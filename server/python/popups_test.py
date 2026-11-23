"""popups.py on a hand-made page in a REAL browser (Playwright — the scrapers' own engine). Run by hand:
cd server/python && python popups_test.py

The page has the DATA (a table and a menu inside a box whose class says "popup" — which must NOT be touched), a cookie
banner, a full-screen ad overlay with a × button that only hides it when clicked, an ad iframe and a sticky ad bar that
appears two seconds AFTER the watcher started (popups do that)."""
import sys

from playwright.sync_api import sync_playwright

import popups

PAGE = """<html><body style="overflow:hidden">
<div class="options-popup-wrapper"><select><option>Week 4: Nov 2026</option></select>
  <table id="data"><tr><td>3618.6</td><td><button>x</button></td></tr></table></div>
<div class="cookie-consent" id="cookie"><button id="ok">Accept all</button></div>
<div id="ad" class="modal" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:#000">
  <button onclick="document.getElementById('ad').style.display='none'; window.adClosed=true">×</button></div>
<iframe id="adframe" src="https://googleads.g.doubleclick.net/pagead/x"></iframe>
<script>
  document.getElementById('ok').onclick = () => { document.getElementById('cookie').remove(); };
  setTimeout(() => { const d = document.createElement('div'); d.className = 'sticky-ad'; d.id = 'late';
                     d.textContent = 'AD'; document.body.appendChild(d); }, 2000);
</script></body></html>"""

BAD = []


def check(name, got, want):
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page()
    page.set_content(PAGE)
    popups.install(page)
    page.wait_for_timeout(3500)                          # the late ad appears at 2 s; the watcher runs every second
    q = lambda s: page.evaluate(f"() => !!document.querySelector('{s}')")   # noqa: E731
    shown = page.evaluate("() => { const a = document.getElementById('ad'); return !!a && getComputedStyle(a).display !== 'none'; }")
    check("the cookie banner's Accept was clicked (banner gone)", q("#cookie"), False)
    check("the full-screen ad overlay is gone (× clicked or layer removed)", shown, False)
    check("the ad iframe is removed", q("#adframe"), False)
    check("the sticky ad that appeared 2 s LATER is removed too (the watcher keeps running)", q("#late"), False)
    check("the DATA is untouched — table, menu, and its own 'x' button", (q("#data"), q("select"),
          page.evaluate("() => document.querySelectorAll('#data button').length")), (True, True, 1))
    check("the page can scroll again", page.evaluate("() => getComputedStyle(document.body).overflow"), "auto")
    b.close()
print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} FAILED: {BAD}'}")
sys.exit(1 if BAD else 0)
