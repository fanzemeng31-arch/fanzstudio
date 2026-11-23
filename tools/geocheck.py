#!/usr/bin/env python3
"""geocheck.py: how ready is a public website to be read and cited by AI assistants.

Usage: geocheck.py <domain or URL> [--json]
Standard library only. At most 6 requests per site, 15 s timeout, 2 MB per response.
"""
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

UA = "PlainworkGeoCheck/0.1 (+https://fanzemeng31-arch.github.io/plainwork/)"
TIMEOUT = 15
MAX_BYTES = 2 * 1024 * 1024
MAX_REQUESTS = 6

MAIN_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot",
             "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User"]
OTHER_BOTS = ["Google-Extended", "CCBot", "Applebot-Extended",
              "meta-externalagent", "Amazonbot", "Bytespider"]


class Fetcher:
    def __init__(self):
        self.count = 0

    def get(self, url):
        """Return dict: ok, status, final_url, headers, body(text), seconds, error."""
        res = {"ok": False, "status": None, "final_url": url, "headers": {},
               "body": "", "seconds": None, "error": None, "bytes": 0}
        if self.count >= MAX_REQUESTS:
            res["error"] = "request limit reached"
            return res
        self.count += 1
        req = urllib.request.Request(url, headers={
            "User-Agent": UA, "Accept": "text/html,text/plain,application/xml;q=0.9,*/*;q=0.5",
            "Accept-Language": "en"})
        t0 = time.time()
        try:
            try:
                resp = urllib.request.urlopen(req, timeout=TIMEOUT)
            except urllib.error.HTTPError as e:
                resp = e
            res["seconds"] = round(time.time() - t0, 2)
            res["status"] = getattr(resp, "status", None) or resp.getcode()
            res["final_url"] = resp.geturl()
            res["headers"] = {k.lower(): v for k, v in resp.headers.items()}
            raw = resp.read(MAX_BYTES)
            res["bytes"] = len(raw)
            res["body"] = decode(raw, res["headers"].get("content-type", ""))
            res["ok"] = True
        except ssl.SSLError as e:
            res["error"] = "TLS error: %s" % e
        except urllib.error.URLError as e:
            res["error"] = "connection error: %s" % getattr(e, "reason", e)
        except Exception as e:  # timeouts, resets, bad redirects
            res["error"] = "%s: %s" % (type(e).__name__, e)
        return res


def decode(raw, ctype):
    m = re.search(r"charset=([\w\-]+)", ctype or "", re.I)
    encs = [m.group(1)] if m else []
    head = raw[:2048].decode("ascii", "ignore")
    m2 = re.search(r'charset=["\']?([\w\-]+)', head, re.I)
    if m2:
        encs.append(m2.group(1))
    encs += ["utf-8", "latin-1"]
    for enc in encs:
        try:
            return raw.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", "replace")


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.text = []
        self.title = None
        self._in_title = False
        self.metas = []
        self.links = []      # (rel, href, hreflang)
        self.anchors = []    # (href, text)
        self._a = None
        self.h1 = 0
        self.html_lang = None
        self.jsonld = []
        self._ld = None
        self.ids = []

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if a.get("id"):
            self.ids.append((tag, a["id"]))
        if tag == "html":
            self.html_lang = a.get("lang")
        elif tag in ("script", "style", "noscript", "svg"):
            if tag == "script" and "ld+json" in a.get("type", "").lower():
                self._ld = []
            self.skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            self.metas.append(a)
        elif tag == "link":
            self.links.append((a.get("rel", "").lower(), a.get("href", ""), a.get("hreflang", "")))
        elif tag == "h1":
            self.h1 += 1
        elif tag == "a":
            self._a = [a.get("href", ""), []]

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg"):
            if tag == "script" and self._ld is not None:
                self.jsonld.append("".join(self._ld))
                self._ld = None
            self.skip = max(0, self.skip - 1)
        elif tag == "title":
            self._in_title = False
        elif tag == "a" and self._a:
            self.anchors.append((self._a[0], " ".join("".join(self._a[1]).split())))
            self._a = None

    def handle_data(self, data):
        if self._ld is not None:
            self._ld.append(data)
        if self._in_title:
            self.title = (self.title or "") + data
        if self._a is not None:
            self._a[1].append(data)
        if not self.skip:
            self.text.append(data)

    def meta(self, key, val):
        for m in self.metas:
            if m.get(key, "").lower() == val:
                return m.get("content", "")
        return None


def normalise(arg):
    arg = arg.strip()
    if not re.match(r"^https?://", arg, re.I):
        arg = "https://" + arg
    return arg


def check(c_id, label, status, detail):
    return {"id": c_id, "label": label, "status": status, "detail": detail}


def cjk_count(s):
    return len(re.findall(r"[぀-ヿ㐀-鿿가-힯]", s))


def jsonld_types(obj, out):
    if isinstance(obj, list):
        for o in obj:
            jsonld_types(o, out)
    elif isinstance(obj, dict):
        t = obj.get("@type")
        if isinstance(t, str):
            out.add(t)
        elif isinstance(t, list):
            out.update(x for x in t if isinstance(x, str))
        for v in obj.values():
            if isinstance(v, (list, dict)):
                jsonld_types(v, out)


UNIT_RE = re.compile(
    r"(?:(?<![\w.])\d[\d,]*(?:\.\d+)?\s?(?:%|mm|cm|km|kg|MW|kW|°C|years?|days?|hours?|pcs|m|g|t|V|A)(?![A-Za-z]))"
    r"|(?:[£$€¥]\s?\d[\d,]*(?:\.\d+)?)"
    r"|(?:\d[\d,]*(?:\.\d+)?\s?[£€¥])"
    r"|(?:\b(?:19|20)\d{2}\b)")


def run(arg):
    f = Fetcher()
    start = normalise(arg)
    facts = {"input": arg, "requests_made": 0}
    checks = []
    home = f.get(start)
    if not home["ok"] and not re.match(r"^https?://", arg.strip(), re.I):
        # the bare domain did not answer over HTTPS: try www, then plain HTTP
        host = urlparse(start).netloc
        www = [] if host.startswith("www.") else ["www." + host]
        facts["https_error"] = home["error"]
        for alt in ["https://" + h for h in www] + ["http://" + h for h in [host] + www]:
            f.count -= 1  # a failed attempt does not use up the request budget
            home = f.get(alt)
            if home["ok"]:
                break
    if not home["ok"]:
        facts["error"] = home["error"]
        facts["requests_made"] = f.count
        return None, facts, checks
    final = home["final_url"]
    pu = urlparse(final)
    base = "%s://%s" % (pu.scheme, pu.netloc)
    # A site may live in a folder of its host (https://host/shop/). Crawlers read
    # robots.txt only at the host root, but a sitemap and llms.txt may sit in the
    # folder, so those two checks also try the folder of the page.
    folder = pu.path.rsplit("/", 1)[0].rstrip("/")
    sub = (base + folder) if folder else None
    html = home["body"]
    facts.update({"final_url": final, "status": home["status"],
                  "seconds_to_response": home["seconds"], "html_bytes": home["bytes"]})

    # 1 reachability
    https = pu.scheme == "https"
    st = "pass" if https and home["status"] and home["status"] < 400 else "attention"
    checks.append(check("reachable", "Reachable over HTTPS", st,
        "Final URL %s. Status %s. First response in %s s. HTML size %s bytes.%s" % (
            final, home["status"], home["seconds"], home["bytes"],
            "" if https else " The final address is not HTTPS.")))

    # 2 robots.txt
    rob = f.get(base + "/robots.txt")
    rtxt = ""
    rob_ok = rob["ok"] and rob["status"] == 200 and "<html" not in rob["body"][:500].lower()
    if rob_ok:
        rtxt = rob["body"]
    facts["robots_present"] = rob_ok
    allowed = {}
    if rob_ok:
        rp = urllib.robotparser.RobotFileParser()
        rp.parse(rtxt.splitlines())
        for bot in MAIN_BOTS + OTHER_BOTS:
            try:
                allowed[bot] = bool(rp.can_fetch(bot, base + "/"))
            except Exception:
                allowed[bot] = True
    else:
        for bot in MAIN_BOTS + OTHER_BOTS:
            allowed[bot] = True
    facts["bots_allowed_root"] = allowed
    blocked = [b for b in MAIN_BOTS if not allowed[b]]
    other_blocked = [b for b in OTHER_BOTS if not allowed[b]]
    if not rob_ok:
        checks.append(check("robots", "robots.txt and AI crawler access", "info",
            "No robots.txt found (status %s). With no file, all crawlers may fetch the homepage." % rob["status"]))
    else:
        d = "robots.txt found. "
        d += ("Blocked from the homepage: %s." % ", ".join(blocked)) if blocked else "None of the eight main AI crawlers is blocked from the homepage."
        if other_blocked:
            d += " Other tokens blocked: %s." % ", ".join(other_blocked)
        checks.append(check("robots", "robots.txt and AI crawler access",
                            "attention" if blocked else "pass", d))
    cs = [l.strip() for l in rtxt.splitlines() if l.strip().lower().startswith("content-signal")]
    facts["content_signal"] = cs
    checks.append(check("content_signal", "Content-Signal line in robots.txt", "info",
        ("Present: " + " | ".join(cs)) if cs else "Not present."))

    # parse page
    p = Page()
    try:
        p.feed(html)
        p.close()
    except Exception:
        pass
    text = " ".join(" ".join(p.text).split())

    # 3 words without JS
    cjk = cjk_count(text)
    words = len(re.findall(r"\S+", text))
    use_chars = cjk > 0.3 * max(1, len(re.sub(r"\s", "", text)))
    n = cjk if use_chars else words
    limit = 150
    unit = "characters (page is mostly Chinese, Japanese or Korean)" if use_chars else "words"
    if use_chars:
        limit = 150
    shell = [i for t, i in p.ids if i in ("root", "app", "__next", "__nuxt")]
    empty_shell = bool(shell) and n < 50
    facts.update({"visible_count": n, "visible_unit": "characters" if use_chars else "words",
                  "empty_app_root": empty_shell})
    bad = n < limit or empty_shell
    d = "%d visible %s without JavaScript." % (n, unit)
    if empty_shell:
        d += " The page has an empty app container (id=%s) and almost no text." % shell[0]
    if bad:
        d += " Most AI crawlers do not run JavaScript, so they see only this text."
    checks.append(check("js_text", "Homepage text without JavaScript", "attention" if bad else "pass", d))

    # 4 head basics
    title = " ".join((p.title or "").split())
    desc = p.meta("name", "description")
    canon = [h for r, h, _ in p.links if "canonical" in r.split()]
    hl = sorted({l for r, h, l in p.links if "alternate" in r.split() and l})
    facts.update({"title": title, "meta_description": desc, "canonical": canon[:1],
                  "html_lang": p.html_lang, "hreflang": hl, "h1_count": p.h1})
    miss = []
    if not title: miss.append("title")
    if not desc: miss.append("meta description")
    if not canon: miss.append("canonical link")
    if not p.html_lang: miss.append("lang attribute")
    if p.h1 != 1: miss.append("exactly one h1")
    checks.append(check("head", "Title, description, canonical, language, headings",
        "attention" if miss else "pass",
        "Title: %s. Meta description: %s. Canonical: %s. Language: %s. Hreflang: %s. h1 elements: %d.%s" % (
            ("%d characters" % len(title)) if title else "missing",
            ("%d characters" % len(desc.strip())) if desc and desc.strip() else "missing",
            canon[0] if canon else "missing", p.html_lang or "missing",
            ", ".join(hl) if hl else "none", p.h1,
            (" Missing or off: " + ", ".join(miss) + ".") if miss else "")))

    # 5 indexing signals
    mr = p.meta("name", "robots") or ""
    xr = home["headers"].get("x-robots-tag", "")
    sig = (mr + " " + xr).lower()
    flags = [k for k in ("noindex", "nosnippet") if k in sig]
    if re.search(r"max-snippet\s*:\s*0\b", sig):
        flags.append("max-snippet:0")
    facts.update({"meta_robots": mr, "x_robots_tag": xr})
    checks.append(check("indexing", "Indexing signals", "attention" if flags else "pass",
        "Meta robots: %s. X-Robots-Tag: %s.%s" % (mr or "none", xr or "none",
            (" Found: " + ", ".join(flags) + ". AI search tools may skip or not quote this page.") if flags else "")))

    # 6 JSON-LD
    types, bad_ld = set(), 0
    for blk in p.jsonld:
        try:
            jsonld_types(json.loads(blk.strip()), types)
        except Exception:
            bad_ld += 1
    nld = len(p.jsonld)
    facts.update({"jsonld_blocks": nld, "jsonld_unparsed": bad_ld, "jsonld_types": sorted(types)})
    want = ["Organization", "LocalBusiness", "Product", "FAQPage", "WebSite", "BreadcrumbList"]
    absent = [w for w in want if w not in types]
    if nld == 0:
        checks.append(check("jsonld", "JSON-LD structured data", "attention",
            "No JSON-LD blocks found. Structured data tells machines what the business is and sells."))
    else:
        checks.append(check("jsonld", "JSON-LD structured data", "attention" if bad_ld else "pass",
            "%d block(s). Types: %s. %d block(s) failed to parse." % (nld, ", ".join(sorted(types)) or "none", bad_ld)))
    checks.append(check("jsonld_types", "Useful schema types present", "info",
        ("Absent: " + ", ".join(absent) + ".") if absent else "All six common types are present."))

    # 7 Open Graph
    og = {k: bool(p.meta("property", "og:" + k)) for k in ("title", "description", "image")}
    facts["open_graph"] = og
    checks.append(check("open_graph", "Open Graph tags", "pass" if all(og.values()) else "attention",
        "; ".join("og:%s %s" % (k, "present" if v else "missing") for k, v in og.items()) + "."))

    # 8 llms.txt
    def llms_ok(r):
        return (r["ok"] and r["status"] == 200 and "<html" not in r["body"][:500].lower()
                and "<!doctype" not in r["body"][:100].lower() and r["body"].strip() != "")
    ll_url = base + "/llms.txt"
    ll = f.get(ll_url)
    ll_ok = llms_ok(ll)
    if not ll_ok and sub:
        ll2 = f.get(sub + "/llms.txt")
        if llms_ok(ll2):
            ll, ll_ok, ll_url = ll2, True, sub + "/llms.txt"
    facts["llms_txt"] = ll_ok
    facts["llms_txt_url"] = ll_url if ll_ok else None
    checks.append(check("llms_txt", "llms.txt", "pass" if ll_ok else "info",
        "Present at %s (%d bytes)." % (ll_url, ll["bytes"]) if ll_ok else
        "Not found. llms.txt is a proposed convention and AI vendors have not confirmed that they read it."))

    # 9 sitemap
    sm_url = None
    for line in rtxt.splitlines():
        if line.lower().startswith("sitemap:"):
            sm_url = line.split(":", 1)[1].strip()
            break
    named = bool(sm_url)
    sm_url = sm_url or base + "/sitemap.xml"

    def sitemap_at(u):
        r = f.get(u)
        b = r["body"] if r["ok"] and r["status"] == 200 else ""
        ok = bool(b) and ("<urlset" in b.lower() or "<sitemapindex" in b.lower())
        return ok, len(re.findall(r"<loc>", b, re.I))
    tried = [sm_url]
    sm_ok, locs = sitemap_at(sm_url)
    if not sm_ok and sub and sub + "/sitemap.xml" != sm_url:
        # the site lives in a folder: look for the sitemap beside the page
        tried.append(sub + "/sitemap.xml")
        ok2, locs2 = sitemap_at(tried[-1])
        if ok2:
            sm_ok, locs, sm_url, named = True, locs2, tried[-1], False
    facts.update({"sitemap_url": sm_url, "sitemap_named_in_robots": named,
                  "sitemap_ok": sm_ok, "sitemap_loc_count": locs, "sitemap_tried": tried})
    checks.append(check("sitemap", "Sitemap", "pass" if sm_ok else "attention",
        ("%s answers with %d <loc> entries%s." % (sm_url, locs, " (named in robots.txt)" if named else ""))
        if sm_ok else "No sitemap found at %s%s." % (" or ".join(tried), " (named in robots.txt)" if named else "")))

    # 10 contact
    tel = [h for h, _ in p.anchors if h.lower().startswith("tel:")]
    mail = [h[7:].split("?")[0] for h, _ in p.anchors if h.lower().startswith("mailto:")]
    cl = [h for h, t in p.anchors if re.search(r"contact|about|联系|关于", (h + " " + t), re.I)]
    facts.update({"tel_links": tel[:3], "mailto": mail[:3], "contact_or_about_links": len(cl)})
    ok_c = bool(tel or mail)
    checks.append(check("contact", "Machine-readable contact", "pass" if ok_c else "attention",
        "tel: link %s. mailto: link %s. Contact or about link %s.%s" % (
            tel[0] if tel else "none", mail[0] if mail else "none",
            "found" if cl else "none", "" if ok_c else " Neither a phone nor an email link is readable on the homepage.")))

    # 11 specifics
    nspec = len(UNIT_RE.findall(text))
    facts["specific_figures"] = nspec
    checks.append(check("specifics", "Concrete figures on the homepage", "info",
        "%d figures with a unit, sign or year. AI assistants quote concrete facts and cannot quote slogans." % nspec))

    facts["requests_made"] = f.count
    return checks, facts, checks


def report(arg, checks, facts):
    L = ["# GEO check: %s" % facts.get("final_url", arg), ""]
    mark = {"pass": "Pass", "attention": "Needs attention", "info": "Info"}
    for c in checks:
        L.append("## %s: %s" % (c["label"], mark[c["status"]]))
        L.append(c["detail"])
        L.append("")
    na = sum(1 for c in checks if c["status"] == "attention")
    L.append("%d of %d checks need attention" % (na, len(checks)))
    return "\n".join(L)


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    as_json = "--json" in argv
    if not args:
        print("Usage: geocheck.py <domain or URL> [--json]")
        return 2
    checks, facts, _ = run(args[0])
    if checks is None:
        if as_json:
            print(json.dumps({"input": args[0], "reachable": False, "checks": [], "facts": facts}, ensure_ascii=False))
        else:
            print("# GEO check: %s\n\nThe site could not be reached: %s\n\n0 of 0 checks need attention" % (args[0], facts.get("error")))
        return 1
    if as_json:
        print(json.dumps({"input": args[0], "reachable": True, "checks": checks, "facts": facts}, ensure_ascii=False, indent=1))
    else:
        print(report(args[0], checks, facts))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except KeyboardInterrupt:
        sys.exit(1)
