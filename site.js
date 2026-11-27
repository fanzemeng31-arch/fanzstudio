/* FanzStudio site script. No library, no tracking, no request to another host. */
(function () {
  'use strict';
  window.__fz = 1;
  var D = document, root = D.documentElement;
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. Growth rings drawn by the graphics card: thin ring lines, lit by a lamp that follows the pointer.
        Where WebGL 2 is missing, the CSS rings behind the canvas stay. */
  (function () {
    var cv = D.querySelector('canvas.grain');
    if (!cv) return;
    var gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return;
    var css = getComputedStyle(cv);
    function col(name) {
      var m = css.getPropertyValue(name).trim().match(/^#([0-9a-f]{6})$/i), n = m ? parseInt(m[1], 16) : 0;
      return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
    }
    var VS = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    var FS = '#version 300 es\nprecision highp float;\n' +
      'uniform vec2 R;uniform float T;uniform vec2 M;uniform vec3 W;uniform vec3 CE,CW,CO;out vec4 O;\n' +
      'float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n' +
      'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}\n' +
      'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.02+vec2(3.1,1.7);a*=.5;}return v;}\n' +
      'void main(){vec2 uv=(gl_FragCoord.xy-.5*R)/R.y;\n' +
      ' vec2 d=(uv-vec2(-1.15,-1.1))*vec2(.34,1.);\n' +                    /* the centre of the tree lies off to the lower left */
      ' float wp=fbm(uv*vec2(.8,2.1)+vec2(T*.012,W.z))+fbm(uv*vec2(2.6,7.)+3.+W.z)*.16;\n' +
      ' float r=length(d)*W.x+wp*W.y;r+=.33*sin(r*.9+W.z);\n' +            /* ring number, unevenly spaced like real rings */
      ' float f=fract(r),aa=fwidth(r);\n' +
      ' float line=1.-smoothstep(0.,aa*1.3+.014,abs(f-.5));\n' +
      ' float band=smoothstep(.1,.5,f)*smoothstep(1.,.5,f);\n' +
      ' vec2 lp=(M-.5)*vec2(R.x/R.y,1.);float ds=length(uv-lp);float lamp=exp(-ds*ds*1.5);\n' +
      ' float fib=fbm(vec2(uv.x*3.,uv.y*42.)+W.z);\n' +
      ' float sheen=pow(.5+.5*sin(r*1.25+fib*4.+(uv.x-lp.x)*5.),8.);\n' +
      ' vec3 c=CE+CW*(band*.36+fib*.13)*(.12+lamp*.95);c+=CO*line*(.07+lamp*1.05);c+=CO*sheen*lamp*.09;c*=1.-.2*dot(uv,uv);\n' +
      ' c+=(h(gl_FragCoord.xy+T)-.5)/170.;O=vec4(c,1.);}';
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    }
    var a = sh(gl.VERTEX_SHADER, VS), b = sh(gl.FRAGMENT_SHADER, FS);
    if (!a || !b) return;
    var pr = gl.createProgram(); gl.attachShader(pr, a); gl.attachShader(pr, b); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {}; ['R', 'T', 'M', 'W', 'CE', 'CW', 'CO'].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
    var wood = (cv.dataset.wood || '11,1.05,0').split(',').map(Number);
    gl.uniform3f(U.W, wood[0], wood[1], wood[2]);
    gl.uniform3fv(U.CE, col('--grain-ground')); gl.uniform3fv(U.CW, col('--grain-wood')); gl.uniform3fv(U.CO, col('--grain-line'));
    var rest = [.78, .66], aim = rest.slice(), cur = rest.slice(), seen = true, t0 = performance.now(), raf = 0, hover = false;
    function size() {
      var q = Math.min(devicePixelRatio || 1, innerWidth < 800 ? 1.25 : 1.5), w = Math.round(cv.clientWidth * q), hh = Math.round(cv.clientHeight * q);
      if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; gl.viewport(0, 0, w, hh); gl.uniform2f(U.R, w, hh); }
    }
    function draw(now) {
      raf = 0; size();
      var t = (now - t0) / 1000;
      if (!hover && !still) { aim[0] = rest[0] + Math.sin(t * .23) * .09; aim[1] = rest[1] + Math.cos(t * .17) * .07; }
      cur[0] += (aim[0] - cur[0]) * .06; cur[1] += (aim[1] - cur[1]) * .06;
      gl.uniform1f(U.T, still ? 0 : t); gl.uniform2f(U.M, cur[0], cur[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      cv.classList.add('is-on');
      if (!still && seen && !D.hidden && !root.classList.contains('still')) raf = requestAnimationFrame(draw);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(draw); }
    if (!still) {
      var host = cv.parentElement;
      host.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var bx = cv.getBoundingClientRect(); hover = true;
        aim[0] = (e.clientX - bx.left) / bx.width; aim[1] = 1 - (e.clientY - bx.top) / bx.height;
      });
      host.addEventListener('pointerleave', function () { hover = false; });
      new IntersectionObserver(function (en) { seen = en[0].isIntersecting; if (seen) kick(); }).observe(cv);
      D.addEventListener('visibilitychange', kick);
      D.addEventListener('fz:motion', kick);
    }
    addEventListener('resize', kick);
    kick();
  })();

  /* 1b. Stop and start everything that keeps moving (the rings and the changing headline) */
  var pbs = [].slice.call(D.querySelectorAll('.pause'));
  function motion(off) {
    root.classList.toggle('still', off);
    pbs.forEach(function (b) { b.setAttribute('aria-pressed', off); b.textContent = off ? b.dataset.play : b.dataset.pause; });
    try { sessionStorage.setItem('fzStill', off ? '1' : ''); } catch (x) {}
    D.dispatchEvent(new Event('fz:motion'));
  }
  if (!still) {
    pbs.forEach(function (b) { b.hidden = false; b.addEventListener('click', function () { motion(!root.classList.contains('still')); }); });
    try { if (sessionStorage.getItem('fzStill') === '1') motion(true); } catch (x) {}
  }

  /* 2. A soft light that follows the pointer over rows and cards */
  D.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest('.card,.kind');
    if (!el) return;
    var b = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - b.left) + 'px'); el.style.setProperty('--my', (e.clientY - b.top) + 'px');
  }, { passive: true });

  /* 3. Sections appear as they come into view */
  var rv = [].slice.call(D.querySelectorAll('.rv'));
  if ('IntersectionObserver' in window && !still) {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    rv.forEach(function (el) { io.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('in'); });

  /* 4. The menu on small screens */
  var top = D.querySelector('.top'), mb = D.querySelector('.menu');
  if (mb) {
    mb.addEventListener('click', function () {
      var open = top.classList.toggle('open'); mb.setAttribute('aria-expanded', open);
    });
    top.addEventListener('click', function (e) { if (e.target.closest('nav a')) { top.classList.remove('open'); mb.setAttribute('aria-expanded', 'false'); } });
    D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && top.classList.contains('open')) { top.classList.remove('open'); mb.setAttribute('aria-expanded', 'false'); mb.focus(); } });
  }

  /* 5. Copy the email address */
  [].forEach.call(D.querySelectorAll('[data-copy]'), function (b) {
    b.hidden = false;
    var box = b.closest('.mail'), s = box.querySelector('[role=status]');
    b.addEventListener('click', function () {
      function done() {
        b.textContent = b.dataset.done; s.textContent = b.dataset.done;
        setTimeout(function () { b.textContent = b.dataset.label; s.textContent = ''; }, 2000);
      }
      function pick() {
        var r = D.createRange(); r.selectNodeContents(box.querySelector('.mail-text'));
        var g = getSelection(); g.removeAllRanges(); g.addRange(r);
        try { D.execCommand('copy'); } catch (x) {}
        done();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(b.dataset.copy).then(done, pick); else pick();
    });
  });

  /* 6. The part of a category page that is on screen is marked in the strip under the header */
  var links = [].slice.call(D.querySelectorAll('.subnav a'));
  if (links.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (en) {
      en.forEach(function (x) {
        if (!x.isIntersecting) return;
        links.forEach(function (l) { l.classList.toggle('on', l.getAttribute('href') === '#' + x.target.id); });
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    links.forEach(function (l) { var t = D.getElementById(l.getAttribute('href').slice(1)); if (t) spy.observe(t); });
  }

  /* 7. The 13-point check, run by the visitor's browser on the page being read.
        It follows the studio's check program (tools/geocheck.py). A browser may only read its own site,
        so this runs on fanzstudio.org pages and nowhere else. */
  var panel = D.querySelector('[data-check]');
  if (!panel || !/^https?:$/.test(location.protocol)) return;
  var BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User'];
  var FIG = /(?:(?<![\w.])\d[\d,]*(?:\.\d+)?\s?(?:%|mm|cm|km|kg|MW|kW|°C|years?|days?|hours?|pcs|m|g|t|V|A)(?![A-Za-z]))|(?:[£$€¥]\s?\d[\d,]*(?:\.\d+)?)|(?:\d[\d,]*(?:\.\d+)?\s?[£€¥])|(?:\b(?:19|20)\d{2}\b)/g;
  function get(u) {
    return fetch(u, { cache: 'no-store' }).then(function (r) {
      return r.text().then(function (t) { return { ok: r.ok, status: r.status, text: t, robots: r.headers.get('x-robots-tag') || '' }; });
    }).catch(function () { return { ok: false, status: 0, text: '', robots: '' }; });
  }
  function plain(x) { return x.ok && !/<html|<!doctype/i.test(x.text.slice(0, 500)) && x.text.trim() !== ''; }
  function blocked(txt, bot) {
    var groups = [], cur = null, lastUA = false;
    txt.split(/\r?\n/).forEach(function (l) {
      var m = l.replace(/#.*/, '').match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
      if (!m) return;
      var k = m[1].toLowerCase(), v = m[2];
      if (k === 'user-agent') { if (!lastUA) { cur = { ua: [], dis: [], al: [] }; groups.push(cur); } cur.ua.push(v.toLowerCase()); lastUA = true; return; }
      lastUA = false;
      if (cur && k === 'disallow') cur.dis.push(v); else if (cur && k === 'allow') cur.al.push(v);
    });
    var own = groups.filter(function (g) { return g.ua.indexOf(bot.toLowerCase()) > -1; });
    var use = own.length ? own : groups.filter(function (g) { return g.ua.indexOf('*') > -1; });
    return use.some(function (g) { return g.dis.indexOf('/') > -1 && g.al.indexOf('/') < 0; });
  }
  var t0 = performance.now(), base = location.origin, here = location.href.split('#')[0];
  Promise.all([get(here), get(base + '/robots.txt'), get(base + '/llms.txt'), get(base + '/sitemap.xml')]).then(function (res) {
    var pg = res[0], rb = res[1], ll = res[2], sm = res[3], ms = Math.round(performance.now() - t0), out = {};
    if (!pg.ok) return;
    var doc = new DOMParser().parseFromString(pg.text, 'text/html');
    function q(s) { return doc.querySelector(s); }
    function meta(a, v) { var e = q('meta[' + a + '="' + v + '"]'); return e ? (e.getAttribute('content') || '').trim() : ''; }
    var https = location.protocol === 'https:';
    out.reachable = [https ? 'pass' : 'attn', 'Status ' + pg.status + '. ' + pg.text.length + ' characters of HTML.' + (https ? '' : ' This address is not HTTPS.')];
    if (plain(rb)) {
      var bl = BOTS.filter(function (b) { return blocked(rb.text, b); });
      out.robots = [bl.length ? 'attn' : 'pass', bl.length ? 'Blocked from the homepage: ' + bl.join(', ') + '.' : 'robots.txt found. None of the eight main AI crawlers is blocked.'];
    } else out.robots = ['info', 'No robots.txt found. With no file, all crawlers may fetch the page.'];
    var cs = (plain(rb) ? rb.text : '').split(/\r?\n/).filter(function (l) { return /^\s*content-signal/i.test(l); });
    out.content_signal = ['info', cs.length ? 'Present: ' + cs.join(' | ') : 'Not present.'];
    var copy = doc.body.cloneNode(true);
    [].forEach.call(copy.querySelectorAll('script,style,noscript,template'), function (e) { e.remove(); });
    var words = (copy.textContent.match(/\S+/g) || []).length;
    out.js_text = [words < 150 ? 'attn' : 'pass', words + ' words in the page as the server sends it, before any script runs.'];
    var title = (doc.title || '').trim(), desc = meta('name', 'description'), canon = q('link[rel~="canonical"]'), lang = doc.documentElement.getAttribute('lang') || '', h1 = doc.querySelectorAll('h1').length, miss = [];
    if (!title) miss.push('title'); if (!desc) miss.push('meta description'); if (!canon) miss.push('canonical link'); if (!lang) miss.push('lang attribute'); if (h1 !== 1) miss.push('exactly one h1');
    out.head = [miss.length ? 'attn' : 'pass', 'Title: ' + title.length + ' characters. Description: ' + desc.length + ' characters. Language: ' + (lang || 'missing') + '. h1 elements: ' + h1 + '.' + (miss.length ? ' Missing or off: ' + miss.join(', ') + '.' : '')];
    var sig = (meta('name', 'robots') + ' ' + pg.robots).toLowerCase(), flags = ['noindex', 'nosnippet'].filter(function (k) { return sig.indexOf(k) > -1; });
    out.indexing = [flags.length ? 'attn' : 'pass', flags.length ? 'Found: ' + flags.join(', ') + '.' : 'No noindex or nosnippet instruction.'];
    var types = {}, bad = 0, blocks = doc.querySelectorAll('script[type="application/ld+json"]');
    function walk(o) {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') { [].concat(o['@type'] || []).forEach(function (t) { if (typeof t === 'string') types[t] = 1; }); Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') walk(o[k]); }); }
    }
    [].forEach.call(blocks, function (b) { try { walk(JSON.parse(b.textContent)); } catch (x) { bad++; } });
    var tl = Object.keys(types).sort();
    out.jsonld = [!blocks.length || bad ? 'attn' : 'pass', blocks.length ? blocks.length + ' block(s), ' + bad + ' failed to parse. Types: ' + tl.join(', ') + '.' : 'No JSON-LD blocks found.'];
    var want = ['Organization', 'LocalBusiness', 'Product', 'FAQPage', 'WebSite', 'BreadcrumbList'].filter(function (w) { return !types[w]; });
    out.jsonld_types = ['info', want.length ? 'Absent: ' + want.join(', ') + '.' : 'All six common types are present.'];
    var og = ['title', 'description', 'image'].filter(function (k) { return !meta('property', 'og:' + k); });
    out.open_graph = [og.length ? 'attn' : 'pass', og.length ? 'Missing: ' + og.map(function (k) { return 'og:' + k; }).join(', ') + '.' : 'og:title, og:description and og:image are present.'];
    out.llms_txt = [plain(ll) ? 'pass' : 'info', plain(ll) ? 'Present, ' + ll.text.length + ' characters.' : 'Not found.'];
    var locs = (sm.text.match(/<loc>/gi) || []).length, smok = sm.ok && /<urlset|<sitemapindex/i.test(sm.text);
    out.sitemap = [smok ? 'pass' : 'attn', smok ? 'sitemap.xml answers with ' + locs + ' pages.' : 'No sitemap found.'];
    var mail = doc.querySelector('a[href^="mailto:"]'), tel = doc.querySelector('a[href^="tel:"]');
    out.contact = [mail || tel ? 'pass' : 'attn', mail ? 'A mailto: link is present.' : (tel ? 'A tel: link is present.' : 'Neither a phone nor an email link is readable.')];
    out.specifics = ['info', (copy.textContent.match(FIG) || []).length + ' figures with a unit, sign or year.'];

    var names = { pass: 'Pass', info: 'Info', attn: 'Needs attention' }, attn = 0, n = 0;
    [].forEach.call(panel.querySelectorAll('li[data-c]'), function (li, i) {
      var r = out[li.dataset.c]; if (!r) return;
      n++; if (r[0] === 'attn') attn++;
      var st = li.querySelector('.st'), sm2 = li.querySelector('small');
      setTimeout(function () {
        st.className = 'st st--' + r[0]; st.textContent = names[r[0]]; if (sm2) sm2.textContent = r[1]; li.classList.add('live');
      }, still ? 0 : 140 + i * 70);
    });
    setTimeout(function () {
      [].forEach.call(D.querySelectorAll('[data-sum=attn]'), function (e) { e.textContent = attn; });
      [].forEach.call(D.querySelectorAll('[data-sum=n]'), function (e) { e.textContent = n; });
      [].forEach.call(D.querySelectorAll('[data-sum=ms]'), function (e) { e.textContent = ms + ' ms'; });
      [].forEach.call(D.querySelectorAll('[data-sum=when]'), function (e) { e.textContent = e.dataset.live; });
    }, still ? 0 : 140 + n * 70);
  });
})();
