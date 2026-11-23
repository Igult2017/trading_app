"""
popups.py — CLOSING ADS AND POPUPS while the scrapers read (his ask, 23 Nov 2026: "These websites, investing and barchart
have ads everywhere and popping up all the time. So we should have something to click those ads when they pop up").

`install(page)` — after every page load: a watcher INSIDE the page, every second for as long as we stay on it.
`sweep(page)` — one pass right before each read, plus an Escape key press.

What one pass does — ONLY inside things that are popups, never on the data:
  * clicks a close / accept / dismiss / "no thanks" / × button that sits inside a dialog, modal, overlay, popup, cookie
    or consent box (or carries a "close" label);
  * removes ad frames (Google, DoubleClick, Amazon, Taboola, Outbrain …) and sticky ad bars;
  * removes a full-screen layer floating over the page — unless it holds the table or menus we read;
  * lets the page scroll again (popups lock it).
"""
from __future__ import annotations

_PASS = r"""() => {
  const WORDS = ['close', 'accept', 'accept all', 'i agree', 'agree', 'got it', 'no thanks', 'not now', 'dismiss',
                 'continue', 'ok', '×', 'x', '✕', 'skip', 'maybe later', 'reject all'];
  const BOX = '[role="dialog"], [aria-modal="true"], [class*="modal"], [class*="popup"], [class*="overlay"], ' +
              '[id*="cookie"], [class*="cookie"], [class*="consent"], [id*="consent"], [id*="onetrust"], ' +
              '[class*="interstitial"], [class*="newsletter"]';
  const keep = (el) => el.querySelector && (el.querySelector('select, table') !== null);
  // Only INSIDE popup boxes — cheap (few boxes), and nothing on the data is ever clicked.
  for (const box of document.querySelectorAll(BOX)) {
    if (keep(box)) continue;
    for (const b of box.querySelectorAll('button, a, [role="button"], span')) {
      const t = (b.textContent || '').trim().toLowerCase();
      const label = ((b.getAttribute && b.getAttribute('aria-label')) || '').toLowerCase();
      if (WORDS.includes(t) || label.includes('close') || label.includes('dismiss')) {
        try { b.click(); } catch (e) {}
        break;
      }
    }
  }
  const AD = /doubleclick|googlesyndication|adservice|amazon-adsystem|taboola|outbrain|adnxs|criteo|pubmatic|rubicon/i;
  for (const f of document.querySelectorAll('iframe')) {
    if (AD.test(f.src || '') || /google_ads|ad_iframe|aswift/i.test(f.id || '')) { try { f.remove(); } catch (e) {} }
  }
  for (const el of document.querySelectorAll('[id^="google_ads"], [class*="sticky-ad"], [class*="adhesion"], ' +
                                               '[class*="ad-slot"], [class*="ad-container"]')) {
    if (!keep(el)) { try { el.remove(); } catch (e) {} }
  }
  const W = window.innerWidth, H = window.innerHeight;
  for (const el of document.querySelectorAll('body > *, body > * > *')) {      // floating layers live near the top
    const s = getComputedStyle(el);
    if ((s.position === 'fixed' || s.position === 'absolute') && parseInt(s.zIndex || '0', 10) >= 1000) {
      const r = el.getBoundingClientRect();
      if (r.width >= W * 0.6 && r.height >= H * 0.5 && !keep(el)) { try { el.remove(); } catch (e) {} }
    }
  }
  for (const n of [document.documentElement, document.body]) {
    if (n && getComputedStyle(n).overflow === 'hidden') { n.style.overflow = 'auto'; }
  }
}"""

_INSTALL = "() => { if (window.__popupWatch) return; const p = " + _PASS + "; p(); " \
           "window.__popupWatch = setInterval(() => { try { p(); } catch (e) {} }, 1000); }"


def install(page) -> None:
    """Start the in-page watcher (once per loaded page — a new page load needs it again). Never raises."""
    try:
        page.evaluate(_INSTALL)
    except Exception:                                                           # noqa: BLE001
        pass


def sweep(page) -> None:
    """One pass now, and Escape (closes most dialogs). Never raises."""
    try:
        page.keyboard.press("Escape")
        page.evaluate(_PASS)
    except Exception:                                                           # noqa: BLE001
        pass
