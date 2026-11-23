# Plainwork

This is the static website of Plainwork, a studio opened in November 2026 and run by Fanze Meng in London. The studio checks whether AI assistants can read a small business website, fixes what stops them, and builds websites for small businesses in any trade. The site has an English page (`index.html`), a Simplified Chinese page (`zh.html`) and a short report on 40 manufacturer websites (`geo-benchmark.html`, `geo-benchmark-zh.html`).

## The check program

`tools/geocheck.py` checks how ready a public website is to be read by AI assistants. It needs Python 3.9 or later and nothing else. It makes at most six requests to the site, reads the homepage, `robots.txt`, `llms.txt` and one sitemap file, and names itself in its User-Agent.

```
python3 tools/geocheck.py yourdomain.com
python3 tools/geocheck.py yourdomain.com --json
```

## Preview

The site has no build step and no JavaScript. Run `python3 -m http.server 8000` in this folder and open <http://localhost:8000/>.

## Licence

MIT. See [LICENSE](LICENSE).
