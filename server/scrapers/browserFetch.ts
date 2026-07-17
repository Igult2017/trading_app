import { chromium, type Browser } from 'playwright';

/**
 * Real-browser fetch — the only thing that gets past MyFXBook's Cloudflare.
 *
 * MyFXBook serves the calendar behind a Cloudflare MANAGED CHALLENGE (cf-mitigated: challenge,
 * "Just a moment…", cf_chl_opt) — not a hard block. `cloudscraper` (and any plain HTTP client)
 * only ever receives the challenge page, because solving it requires executing the challenge JS in
 * a genuine browser to earn the `cf_clearance` cookie. Chromium does exactly that here: it loads
 * the page, the challenge auto-solves in a few seconds and reloads into the real calendar.
 *
 * Measured (2026-07-17): the server's Hostinger datacenter IP is challenged on every plain request,
 * while the identical request from a residential IP passes — so this is IP-reputation, and a real
 * browser is the free, permanent way through it. See reference: docs/scrapers if added later.
 *
 * One Chromium is launched lazily and REUSED across scheduler runs (a fresh context per fetch, so
 * cookies/fingerprint don't accumulate). Kill switch: CALENDAR_BROWSER_FETCH=false disables it and
 * the caller falls back to its previous behaviour.
 */

let browserPromise: Promise<Browser> | null = null;

const CHALLENGE_RE = /Just a moment|_cf_chl_opt|cf-browser-verification|cdn-cgi\/challenge-platform/i;

// A current, real Chrome UA — a stale one is itself a bot signal to Cloudflare.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export function browserFetchEnabled(): boolean {
  return (process.env.CALENDAR_BROWSER_FETCH ?? 'true').toLowerCase() !== 'false';
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      })
      .catch((err) => {
        browserPromise = null; // allow a later retry instead of caching the failure forever
        throw err;
      });
  }
  return browserPromise;
}

/**
 * Load `url` in a real browser, wait out any Cloudflare challenge, and return the rendered HTML.
 * If `waitForSelector` is given, also wait until that element exists — proof the REAL page (not
 * just a cleared challenge) has rendered before the HTML is handed back for parsing.
 */
export async function browserFetch(
  url: string,
  opts: { waitForSelector?: string; timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 45000;
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const deadline = Date.now() + timeoutMs;
    let lastHtml = '';
    while (Date.now() < deadline) {
      try {
        const html = await page.content();
        lastHtml = html;
        if (!CHALLENGE_RE.test(html)) {
          if (!opts.waitForSelector) return html;
          if (await page.$(opts.waitForSelector)) return html; // real data present
        }
      } catch {
        // The challenge auto-solves by NAVIGATING (reload into the real page). A page.content()
        // call racing that navigation throws "Execution context was destroyed" — expected and
        // transient. Swallow it and retry on the next tick rather than aborting the whole fetch.
      }
      await page.waitForTimeout(1000);
    }
    // Timed out waiting for a clean page — return the last body we saw; the caller validates/parses.
    return lastHtml || (await page.content().catch(() => ''));
  } finally {
    await context.close();
  }
}

/** Shut the shared browser down (called on server shutdown). Safe to call when never launched. */
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  if (b) await b.close().catch(() => {});
}
