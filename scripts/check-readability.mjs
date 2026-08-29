/**
 * MEASURE A PAGE'S READABILITY — fonts, text sizes and contrast, on the RENDERED page.
 *
 *   npm run build                                   # once, so dist/public is current
 *   node scripts/check-readability.mjs / /blog /calendar /about
 *
 * WHY A TOOL AND NOT AN EYE. Four pages were fixed this way in one week — the blog, the drawdown
 * panel, the economic calendar and the landing page — and in every case reading the source gave the
 * wrong answer:
 *
 *   * the calendar's colours ALREADY passed at 7.58:1; the blur was the typeface and the size
 *   * the landing page declared a constant literally named `sans` that was Playfair Display, so the
 *     source read as though the job was done
 *   * the footer's worst element was a "·" separator at 1.18:1 — the kind of thing nobody reads the
 *     source looking for
 *
 * It serves the built files, so it needs no database and no login. API calls return an empty list,
 * which is fine: this measures type and colour, not data.
 *
 * WHAT "PASS" MEANS HERE. 4.5:1 is the floor for normal text (WCAG AA). 11px is this project's own
 * floor, set because the smallest label on a well-set reference page was 11px and everything below
 * that read as blurred. Neither is a matter of taste; both are measured.
 */
import http from 'http';
import path from 'path';
import { readFileSync, existsSync } from 'fs';
import { chromium } from 'playwright';

const ROOT = 'dist/public';
const PORT = 4321;
const MIN_CONTRAST = 4.5;
const MIN_SIZE = 11;

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.json': 'application/json', '.ico': 'image/x-icon',
};

if (!existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`No build found at ${ROOT}. Run "npm run build" first.`);
  process.exit(2);
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('[]');
  }
  let file = path.join(ROOT, url === '/' ? 'index.html' : url.slice(1));
  if (!existsSync(file) || !path.extname(file)) file = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(PORT);

/**
 * ROUTES MAY BE GIVEN WITH OR WITHOUT THE LEADING SLASH — "blog" and "/blog" both work.
 * On Windows, Git Bash rewrites a bare "/blog" argument into "C:/Program Files/Git/blog" before the
 * script ever sees it, which made every route fail with "invalid URL". Passing them slashless side-
 * steps that entirely, and normalising here means neither form is wrong.
 */
const clean = (r) => {
  const m = r.match(/(?:Git)?(\/(?:blog|calendar|about|support|legal|journal|admin|join|tsc)?.*)$/i);
  let out = m && r.includes('Program Files') ? m[1] : r;
  if (!out.startsWith('/')) out = '/' + out;
  return out === '//' ? '/' : out;
};
const routes = process.argv.slice(2).map(clean);
if (routes.length === 0) routes.push('/', '/blog', '/calendar', '/about', '/support', '/legal');

const browser = await chromium.launch();
let problems = 0;

for (const route of routes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(900);
    // Scroll to the bottom so lazily-revealed sections (and the footer) are measured too.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);

    const found = await page.evaluate(({ MIN_CONTRAST, MIN_SIZE }) => {
      const lum = (c) => {
        const m = (c || '').match(/[\d.]+/g);
        if (!m) return null;
        const [r, g, b] = m.slice(0, 3).map(Number).map(v => v / 255);
        const f = (x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      /**
       * The colour actually painted behind an element.
       *
       * SEMI-TRANSPARENT LAYERS MUST BE COMPOSITED, not taken at face value. A first version of this
       * returned the first non-transparent background it met and ignored its alpha — so a badge with
       * `rgba(244,97,127,0.08)` behind text of `rgb(244,97,127)` was measured as that colour against
       * ITSELF and reported a perfect 1:1 failure. It was a tinted 8% wash over a dark bar, and
       * perfectly legible. Stacking the layers is the difference between a real finding and noise.
       */
      const behind = (el) => {
        const layers = [];
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const m = (getComputedStyle(n).backgroundColor || '').match(/[\d.]+/g);
          if (!m) continue;
          const a = m.length > 3 ? Number(m[3]) : 1;
          if (a === 0) continue;
          layers.push({ rgb: m.slice(0, 3).map(Number), a });
          if (a === 1) break;                       // opaque — nothing below it shows through
        }
        let base = [255, 255, 255];                 // the page itself, if nothing opaque was found
        for (let i = layers.length - 1; i >= 0; i--) {
          const { rgb, a } = layers[i];
          base = base.map((c, k) => rgb[k] * a + c * (1 - a));
        }
        return `rgb(${base.map(Math.round).join(',')})`;
      };
      const ratio = (fg, bg) => {
        const a = lum(fg), b = lum(bg);
        if (a == null || b == null) return null;
        const hi = Math.max(a, b), lo = Math.min(a, b);
        return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
      };

      const out = { fonts: {}, tooFaint: [], tooSmall: [], serifBody: 0, serifExamples: [], total: 0 };
      const leaves = [...document.querySelectorAll('body *')].filter(
        e => e.textContent.trim() && e.children.length === 0 && e.offsetParent !== null);

      for (const el of leaves) {
        const cs = getComputedStyle(el);
        const family = cs.fontFamily.split(',')[0].replace(/["']/g, '');
        const size = parseFloat(cs.fontSize);
        const c = ratio(cs.color, behind(el));
        const text = el.textContent.trim().slice(0, 30);
        out.total++;
        out.fonts[family] = (out.fonts[family] || 0) + 1;
        // A DISPLAY SERIF DOING A BODY JOB is the single most common cause found so far.
        //
        // MATCH THE FAMILY NAME, NOT THE KEYWORD. A first version tested the whole font list against
        // /serif/ — and "Inter, system-ui, …, sans-serif" CONTAINS "serif", so every correctly-set
        // sans element was reported as a serif problem. `family` is already the first name only, and
        // the pattern now names real faces.
        if (/^(playfair|georgia|times|garamond|merriweather|lora|source serif)/i.test(family) && size <= 16) {
          out.serifBody++;
          if (out.serifExamples.length < 5) out.serifExamples.push({ text, size, family });
        }
        if (c != null && c < MIN_CONTRAST) out.tooFaint.push({ text, c, size, color: cs.color });
        if (size < MIN_SIZE) out.tooSmall.push({ text, size });
      }
      return out;
    }, { MIN_CONTRAST, MIN_SIZE });

    const faint = found.tooFaint.length, small = found.tooSmall.length;
    const bad = faint + small + found.serifBody;
    if (bad) problems++;

    console.log(`\n${route}  (${found.total} text elements)`);
    console.log(`   fonts: ${Object.entries(found.fonts).map(([f, n]) => `${f} x${n}`).join(', ')}`);
    console.log(`   below ${MIN_CONTRAST}:1 contrast : ${faint}`);
    for (const r of found.tooFaint.slice(0, 5)) console.log(`      ${String(r.c).padStart(5)}:1  ${r.size}px  "${r.text}"`);
    console.log(`   below ${MIN_SIZE}px            : ${small}`);
    for (const r of found.tooSmall.slice(0, 5)) console.log(`      ${r.size}px  "${r.text}"`);
    // NOT automatically a fault — a logo or a small heading is legitimately serif. It is a prompt
    // to look, which is why the examples are printed rather than just a count.
    console.log(`   serif at body size      : ${found.serifBody}${found.serifBody ? '   <-- check these are headings/logo, not body' : ''}`);
    for (const r of found.serifExamples) console.log(`      ${r.size}px  ${r.family}  "${r.text}"`);
  } catch (err) {
    problems++;
    console.log(`\n${route}  FAILED: ${err.message.slice(0, 80)}`);
  }
  await page.close();
}

await browser.close();
server.close();
console.log(problems ? `\n${problems} route(s) have something to fix.` : '\nAll routes clean.');
process.exit(problems ? 1 : 0);
