# FanzStudio

This is the static website of FanzStudio, a studio opened in November 2026 and run by Fanze Meng in the United Kingdom. The studio works in four categories: Advertisement (checks of whether AI assistants can read a small business website), Design (websites for small businesses), Academic (Reference Audit and figures for research papers) and Programming (small applications).

The site is plain HTML and one stylesheet, `style.css`, with no build step. The pages are `index.html`, `advertisement.html`, `design.html`, `academic.html`, `programming.html`, `figures.html`, a Simplified Chinese page (`zh.html`) and a short report on 40 manufacturer websites (`geo-benchmark.html`, `geo-benchmark-zh.html`).

Public address: https://fanzstudio.org/
Repository: https://github.com/fanzemeng31-arch/fanzstudio
Contact: fanze.meng@fanzstudio.org

## The check program

`tools/geocheck.py` checks how ready a public website is to be read by AI assistants. It needs Python 3.9 or later and nothing else. It makes at most six requests to the site, reads the homepage, `robots.txt`, `llms.txt` and the sitemap, and names itself in its User-Agent.

```
python3 tools/geocheck.py yourdomain.com
```

## How the pages are made

The pages are plain HTML with one stylesheet (`style.css`) and one script (`site.js`). There is no framework, no tracking and no request to another host.
The moving rings behind the headings are drawn by a WebGL 2 shader of about 2 KB inside `site.js`; where WebGL 2 is missing, `rings.svg` shows instead.
The 13-point check on the home page and the Advertisement page is run by the visitor's browser on that page each time it loads.

Fonts, all under the SIL Open Font License and served from this site: Instrument Sans, Fraunces (italic, weight 300) and Geist Mono.

