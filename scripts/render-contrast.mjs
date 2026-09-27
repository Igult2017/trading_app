/**
 * MEASURE THE RENDERED JOURNAL — every text element, in the theme it is actually painted in.
 *
 *     node scripts/render-contrast.mjs                      # the light theme, all panels
 *     node scripts/render-contrast.mjs --theme navy          # a dark theme, to prove no regression
 *     node scripts/render-contrast.mjs --panels dashboard,vault
 *     node scripts/render-contrast.mjs --shots out/          # also save a PNG per panel
 *
 * ══ WHY THIS EXISTS AND WHY IT IS DIFFERENT FROM scripts/contrast-audit.mjs ══════════════════════
 *
 * `contrast-audit.mjs` reads SOURCE. It is fast, needs nothing, and catches a colour before it ships —
 * but docs/READABILITY.md's third recorded trap is that *"reading the source is not the same as reading
 * the render"*: a colour set in one place is overridden in three others, and only the browser knows
 * which won. That document also asks for exactly this script — *"the measuring script is worth
 * rebuilding if this comes up again: walk every screen, and for each piece of text read its colour, the
 * colour actually painted behind it (walk up until an ancestor is opaque), its size, its family and its
 * weight."*
 *
 * ══ THE TWO THINGS IT GETS RIGHT THAT A NAIVE VERSION DOES NOT ══════════════════════════════════
 *
 *   1. IT COMPOSITES THE BACKGROUND STACK. The readability tool's first version found the first
 *      non-transparent background and ignored its alpha, so text of `rgb(244,97,127)` on a badge of
 *      `rgba(244,97,127,0.08)` was measured against ITSELF — a perfect 1:1 on a tinted wash that was
 *      perfectly legible. It reported 32 failures on the blog, half of them false.
 *      **If this ever prints exactly 1:1, suspect the tool before the page.**
 *   2. IT READS ONLY ELEMENTS THAT PAINT THEIR OWN TEXT. An ancestor's colour is inherited by every
 *      descendant, so counting every node reports one label forty times and buries the real failures.
 *
 * ══ HOW IT GETS INTO THE JOURNAL WITHOUT SUPABASE ═══════════════════════════════════════════════
 *
 * The app has a local-admin mode: with `VITE_SUPABASE_URL` unset, `AuthContext` restores a session
 * synchronously from `sessionStorage.local_admin_session`. That is the app's own code path, not a
 * bypass invented here. The theme is set the app's own way too, through `localStorage.journal_settings_v2`.
 * `/api/me/entitlement` is stubbed to grant journal access so the paywall does not stand in front of
 * the thing being measured.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const BASE   = arg('base', 'http://127.0.0.1:5055');
const THEME  = arg('theme', 'light');
const SHOTS  = arg('shots', null);
const AA = 4.5, AA_LARGE = 3.0;

/**
 * The journal's own nav ids, copied from NAV_ITEMS in Journal.tsx.
 *
 * `sync` (FX Copier) is left out: its `.ts-page` paints its own opaque #090C15 ground and Journal.tsx
 * exempts it from theming, so it is self-grounded and measuring it against the white canvas would
 * report a dark hero page as broken. `sessions` is a submenu rather than a panel.
 */
const ALL_PANELS = ['dashboard', 'accounts', 'journal', 'vault', 'calendar', 'drawdown',
                    'metrics', 'strategy', 'fsdai', 'assets', 'leaderboard'];
const PANELS = arg('panels', '').split(',').filter(Boolean).length
  ? arg('panels', '').split(',').filter(Boolean) : ALL_PANELS;

const EXEC = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
              '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.addInitScript(([theme]) => {
  // The app's own local-admin path (AuthContext.getLocalInitialState).
  sessionStorage.setItem('local_admin_session',
    JSON.stringify({ email: 'admin@local', token: 'local-admin-token' }));
  // The app's own settings store (useJournalSettings.SETTINGS_KEY).
  localStorage.setItem('journal_settings_v2',
    JSON.stringify({ theme, font: 'montserrat', hiddenPanels: [] }));
}, [THEME]);

// Grant journal access so the paywall is not what gets measured.
await page.route('**/api/me/entitlement', (r) => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ subscriptionStatus: 'active', subscriptionEndsAt: null,
                         journalAccessEndsAt: null, journalAccessGrantedBy: 'test',
                         hasJournalAccess: true, stripeConfigured: false }),
}));

/**
 * ⚠ A REAL SERVER BUG THIS HAS TO STEP AROUND, not a test convenience.
 *
 * `GET /api/notifications/unread` (routes.ts:2398) calls `requireAuth(req, res)`, which SENDS its own
 * 401, and then the handler sends a second response. The throw lands in the catch, the catch tries to
 * send a 500, and THAT throw is uncaught — so an unauthenticated request to that route takes the whole
 * Node process down with ERR_HTTP_HEADERS_SENT. Reproduced here twice while measuring.
 *
 * Fixing it is a different change in a different subsystem; this stub keeps the browser from tripping it
 * while the theme is measured. The empty payloads also mean every panel renders its EMPTY state, which
 * still carries the labels, captions, KPI tiles, headers and nav — where most of the ink is — but is NOT
 * the same as a panel full of trades. Said plainly rather than implied.
 */
const EMPTY = { '**/api/notifications/unread': '[]', '**/api/notifications*': '[]',
                '**/api/sessions*': '[]', '**/api/journal/entries*': '[]',
                '**/api/broker/accounts*': '[]', '**/api/trades*': '[]' };
for (const [pattern, body] of Object.entries(EMPTY)) {
  await page.route(pattern, (r) => r.fulfill({ status: 200, contentType: 'application/json', body }));
}

const MEASURE = ({ aa, aaLarge, sel }) => {
  const ROOT = sel ?? '.journal-root';
  const parse = (css) => {
    const m = String(css).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  };
  const lum = (c) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (fg, bg) => {
    const l1 = lum(fg), l2 = lum(bg);
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
  };
  const blend = (top, under) =>
    [0, 1, 2].map((i) => top[3] * top[i] + (1 - top[3]) * under[i]);

  /** Every rgb()/rgba() stop in a gradient string, in order. */
  const gradientStops = (bgImage) => {
    if (!bgImage || !/gradient/.test(bgImage)) return [];
    return [...bgImage.matchAll(/rgba?\([^)]*\)/g)].map((m) => parse(m[0])).filter(Boolean);
  };

  /**
   * THE COLOUR ACTUALLY PAINTED BEHIND an element: every translucent layer from the element upward,
   * composited down onto the first opaque one. Taking the first non-transparent layer and ignoring its
   * alpha is the bug that produced 16 false 1:1 failures on the blog.
   *
   * A GRADIENT IS AN OPAQUE LAYER TOO, and reading only `background-color` walks straight past it. The
   * landing page's "Most Popular" badge is white text on its own `linear-gradient(to right, rgb(96,165,250)…)`
   * — its background-COLOR is transparent, so the walk found the white page behind and reported 1.04:1 on
   * a badge that is perfectly legible. The gradient's stops are used instead, and the WORST of them is
   * taken: text spans the whole sweep, so the ground is whichever stop reads least well.
   */
  const groundOf = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const stops = cs.backgroundClip !== 'text' && cs.webkitBackgroundClip !== 'text'
        ? gradientStops(cs.backgroundImage) : [];
      if (stops.length) { stack.push(...stops.map((c) => [c[0], c[1], c[2], 1])); break; }
      const c = parse(cs.backgroundColor);
      if (!c || c[3] === 0) continue;
      stack.push(c);
      if (c[3] === 1) break;
    }
    if (!stack.length || stack[stack.length - 1][3] !== 1) stack.push([255, 255, 255, 1]);
    let ground = stack.pop().slice(0, 3);
    while (stack.length) ground = blend(stack.pop(), ground);
    return ground;
  };

  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll(`${ROOT} *`)) {
    // Only elements that paint their OWN text. An inherited colour counted on every descendant
    // reports one label forty times.
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!ownText) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    // DECORATIVE TEXT IS EXEMPT, and `aria-hidden` is how a page declares it. WCAG 1.4.3 applies to text
    // that conveys information; the landing page's "01" step watermark duplicates a full-contrast title
    // sitting right below it. Honouring the attribute also means the fix for such a case is to DECLARE
    // the intent rather than to repaint something that was never meant to be read.
    if (el.closest('[aria-hidden="true"]')) continue;

    let fgRaw = parse(cs.color);
    if (!fgRaw) continue;
    const ground = groundOf(el);

    // TEXT PAINTED BY A GRADIENT. `background-clip: text` with `color: transparent` is how the landing
    // page draws its "Start free" call to action: the glyphs ARE the gradient, and `color` is
    // deliberately `rgba(0,0,0,0)`. Measuring that reports exactly 1:1 on text a reader can see
    // perfectly — docs/READABILITY.md's own rule, *"if it ever reports exactly 1:1, suspect the tool
    // before the page."* The gradient's stops are the ink; the worst of them is the one that counts.
    const clipped = cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text';
    if (clipped && fgRaw[3] === 0) {
      const stops = gradientStops(cs.backgroundImage);
      if (!stops.length) continue;                 // transparent text with nothing painting it
      let worst = null, worstR = Infinity;
      for (const stop of stops) {
        const r = ratio(stop.slice(0, 3), ground);
        if (r < worstR) { worstR = r; worst = stop; }
      }
      fgRaw = worst;
    }
    if (fgRaw[3] === 0) continue;                  // genuinely invisible-by-design, not ink

    const fg = fgRaw[3] === 1 ? fgRaw.slice(0, 3) : blend(fgRaw, ground);
    const size = parseFloat(cs.fontSize);
    const weight = +cs.fontWeight || 400;
    // WCAG's large-text allowance: 18.66px at 700+, or 24px at any weight.
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const cr = ratio(fg, ground);
    const floor = large ? aaLarge : aa;

    const text = el.textContent.trim().slice(0, 42);
    const key = `${text}|${cs.color}|${size}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      text, color: cs.color, ground: `rgb(${ground.map(Math.round).join(', ')})`,
      ratio: cr, size, weight, family: cs.fontFamily.split(',')[0].replace(/['"]/g, ''),
      pass: cr >= floor, floor, large,
    });
  }
  return out;
};

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));

console.log(`\nRENDERED CONTRAST — theme "${THEME}" at ${BASE}\n`);

/**
 * THE PUBLIC PAGES ARE ROUTES, NOT PANELS, so they are measured by navigating rather than by clicking a
 * sidebar. `--routes` switches this script to that mode. His instruction, 2026-09-26: *"When I said white
 * colour theme fix I meant everything including the admin page and home pages such as landing page,
 * economic calendar, blog and everything. Sweep everything."*
 */
const ROUTES = arg('routes', '').split(',').filter(Boolean);
if (ROUTES.length) {
  let rGrand = 0, rFail = 0;
  const rWorst = [];
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(3_000);
    // MEASURE is passed in per navigation — a page function does not survive one.
    const rows = await page.evaluate(MEASURE, { aa: AA, aaLarge: AA_LARGE, sel: 'body' }).catch(() => []);
    const fails = rows.filter((r) => !r.pass);
    rGrand += rows.length; rFail += fails.length;
    rWorst.push(...fails.map((f) => ({ ...f, panel: route })));
    const flag = rows.length === 0 ? '  NO CONTENT — not measured'
               : fails.length ? `${String(fails.length).padStart(3)} FAIL` : '      ok';
    console.log(`  ${route.padEnd(16)} ${String(rows.length).padStart(4)} text elements   ${flag}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${THEME}-route${route.replace(/\//g, '_') || '_home'}.png` });
  }
  if (rWorst.length) {
    console.log('\n  the failures, worst first:\n');
    console.log('   ratio  size/wt  colour                  on ground              text');
    const seen = new Set();
    for (const f of rWorst.sort((a, b) => a.ratio - b.ratio)) {
      const k = f.color + f.ground + f.panel;
      if (seen.has(k)) continue;
      seen.add(k);
      if (seen.size > 30) break;
      console.log(`  ${String(f.ratio).padStart(5)}:1  ${String(f.size).padStart(4)}/${String(f.weight).padEnd(3)} ` +
                  `${f.color.padEnd(23)} ${f.ground.padEnd(21)} ${f.panel}: ${f.text}`);
    }
  }
  console.log(`\n  ${rGrand} text elements across ${ROUTES.length} route(s) · ${rFail} below their floor`);
  await browser.close();
  process.exit(rFail ? 1 : 0);
}

await page.goto(`${BASE}/journal`, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForSelector('.journal-root', { timeout: 45_000 });
} catch {
  console.log('  the journal never rendered. Page text was:');
  console.log('  ' + (await page.locator('body').innerText().catch(() => '')).slice(0, 400).replace(/\n/g, '\n  '));
  if (errors.length) console.log('  page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  process.exit(2);
}

let grand = 0, grandFail = 0;
const worst = [];
const empty = [];

for (const panel of PANELS) {
  // The sidebar drives the panel switch; clicking it is how a reader gets there.
  const nav = page.locator(`[data-testid="nav-${panel}"], [data-nav="${panel}"]`).first();
  if (await nav.count()) {
    await nav.click({ timeout: 5_000 }).catch(() => {});
  } else {
    // Fall back to the app's own state, by its label, when a panel has no test id.
    await page.evaluate((p) => {
      const b = [...document.querySelectorAll('.journal-root button, .journal-root a')]
        .find((x) => (x.textContent || '').trim().toLowerCase() === p);
      if (b) b.click();
    }, panel);
  }
  // Wait for the panel to actually paint something rather than for a fixed guess.
  await page.waitForFunction(() => {
    const m = document.querySelector('.journal-root main');
    return !!m && m.innerText.trim().length > 20;
  }, { timeout: 12_000 }).catch(() => {});
  await page.waitForTimeout(1_200);

  const rows = await page.evaluate(MEASURE, { aa: AA, aaLarge: AA_LARGE, sel: '.journal-root' });
  const fails = rows.filter((r) => !r.pass);
  grand += rows.length;
  grandFail += fails.length;
  worst.push(...fails.map((f) => ({ ...f, panel })));

  const flag = fails.length ? `${String(fails.length).padStart(3)} FAIL` : '      ok';
  console.log(`  ${panel.padEnd(12)} ${String(rows.length).padStart(4)} text elements   ${flag}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${THEME}-${panel}.png`, fullPage: false });
}

if (worst.length) {
  console.log('\n  the failures, worst first:\n');
  console.log('   ratio  size/wt  colour                  on ground              text');
  for (const f of worst.sort((a, b) => a.ratio - b.ratio).slice(0, 40)) {
    console.log(`  ${String(f.ratio).padStart(5)}:1  ${String(f.size).padStart(4)}/${String(f.weight).padEnd(3)} ` +
                `${f.color.padEnd(23)} ${f.ground.padEnd(21)} ${f.panel}: ${f.text}`);
  }
}

console.log(`\n  ${grand} text elements measured across ${PANELS.length - empty.length} of ${PANELS.length} panels` +
            ` · ${grandFail} below their floor`);
if (empty.length) console.log(`  NOT MEASURED (rendered nothing): ${empty.join(', ')}`);
if (errors.length) console.log(`  (${errors.length} page error(s): ${[...new Set(errors)].slice(0, 2).join(' | ')})`);
await browser.close();
process.exitCode = (grandFail || empty.length) ? 1 : 0;
