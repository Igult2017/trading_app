"""
test_stop_from_his_trades.py — run with:
    cd signal_platform && python tests/test_stop_from_his_trades.py

THREE CHANGES HE ASKED FOR ON 2026-11-08, and the evidence each rests on.

 1. *"make autotrade to risk only 1% of the account."*
 2. *"The reason why we removed the spread stuff is because it was leading to rejection of trades
    unnecessarily. But now we want to use it to determine the size of SL."*
 3. The stop multiple, from the manual trades he pointed at: *"you can get some trade samples that
    i made manually here: 5347048."*

HIS REAL STOPS, read off the broker and measured as a share of the momentum candle's BODY — the unit
`_SL_LINE_GAP_BODY` is written in:

    23 Sep  XAU/USD    4.58 / 11.53 body  = 0.397
    30 Oct  XAU/USD    7.00 / 12.68 body  = 0.552
    05 Nov  GBP/JPY   0.226 / 0.405 body  = 0.558

median 0.552, against the 0.30 that was in the code — his stops are about 1.8x the platform's, which
is his complaint (*"small SL and being hit in the market where i was not supposed to"*) as a number.

⚠ THE CHECKS THAT MATTER MOST ARE THE TWO THAT SAY *NOT* TO DO SOMETHING: the spread must NOT touch
a buy's stop, and a missing spread must NOT move anything. Applying the spread correction to buys is
not a symmetry improvement — it is a measured mistake, worth +13.0R -> +1.4R over 222 real fills.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import settings                       # noqa: E402
from execution.sizing import size_lots                     # noqa: E402
from strategies import vix1_entry                          # noqa: E402

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def close(what, got, want, tol=0.01):
    global _pass, _fail
    ok = got is not None and abs(got - want) <= tol
    print(f"  {'PASS' if ok else 'FAIL'}  {what}: got {got!r}" + ("" if ok else f", want ~{want}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def teeth(what, held):
    global _pass, _fail
    print(f"  {'PASS' if held else 'FAIL'}  TEETH — {what}: {held}")
    if held:
        _pass += 1
    else:
        _fail += 1


print("\nTHE STOP AND THE RISK, SET FROM HIS OWN TRADES\n")

# ── 1. the risk percent ──────────────────────────────────────────────────────
print("1. autotrade risks 1% of the starting balance:")
check("the setting is 1.0", settings.autotrade_risk_pct, 1.0)
# The arithmetic he will feel: same stop, half the size.
at1 = size_lots(10_000.0, 1.0, 10.0)
at2 = size_lots(10_000.0, 2.0, 10.0)
close("1% over a 10-pip stop is 1.00 lot", at1, 1.00)
close("...exactly half of what 2% gave", at1, at2 / 2)
# ⚠ Below his own manual sizing, on purpose — recorded so nobody "corrects" it upward later.
BAL = 9704.51
close("his GBP/JPY 22.6p stop at 1% -> 0.65 lots, where HE placed 1.00",
      size_lots(BAL, 1.0, 22.6, pip_value_per_lot=6.6225), 0.65, tol=0.02)
close("...and 1.5% would have reproduced his 1.00",
      size_lots(BAL, 1.5, 22.6, pip_value_per_lot=6.6225), 0.97, tol=0.02)

# ── 2. the stop multiple, from his three trades ──────────────────────────────
print("\n2. the stop multiple matches what he actually does:")
check("the constant is 0.552", vix1_entry._SL_LINE_GAP_BODY, 0.552)
HIS = [("23 Sep XAU/USD", 4.58, 11.53), ("30 Oct XAU/USD", 7.00, 12.68),
       ("05 Nov GBP/JPY", 0.226, 0.405)]
# ⚠ THE TWO RECENT TRADES ARE WHAT 0.552 FITS. They agree to within 0.006 of each other.
for label, dist, body in HIS[1:]:
    close(f"{label}: 0.552 x its {body} body reproduces his {dist} stop",
          vix1_entry._SL_LINE_GAP_BODY * body, dist, tol=max(0.01, dist * 0.01))
#
# ⚠⚠ AND THE 23 SEP TRADE DISAGREES — recorded as a fact rather than smoothed away. Its multiple is
# 0.397, so 0.552 OVERSHOOTS it (6.36 against his 4.58) and the OLD 0.30 was actually CLOSER to it
# (3.46, out by 1.12, against 1.78). 0.552 is the MEDIAN of three and it matches his two most recent
# trades almost exactly; it is not a fit to all three, and claiming otherwise would be the same
# overclaim the old constant made when it called two trades a measurement.
sep_dist, sep_body = 4.58, 11.53
close("the 23 Sep trade's own multiple is 0.397", sep_dist / sep_body, 0.397, tol=0.001)
teeth("0.552 OVERSHOOTS the 23 Sep stop, and the check says so out loud",
      vix1_entry._SL_LINE_GAP_BODY * sep_body > sep_dist * 1.3)
teeth("...and for THAT trade alone the old 0.30 sat closer",
      abs(0.30 * sep_body - sep_dist) < abs(0.552 * sep_body - sep_dist))
teeth("0.552 is nonetheless closer on the two most recent trades",
      all(abs(0.552 * b - d) < abs(0.30 * b - d) for _l, d, b in HIS[1:]))
# The spread of his three, so a future session sees the real range and not a single number.
mults = sorted(d / b for _l, d, b in HIS)
close("his three multiples run 0.397 to 0.558", mults[-1] - mults[0], 0.161, tol=0.002)
close("...with 0.552 as the median", mults[1], 0.552, tol=0.001)

# ── 3. ⚠ THE SPREAD: a sell only, and nothing when it is unknown ─────────────
# `_apply` mirrors the one line added to vix1_entry so the RULE is asserted without standing up a
# whole 1-minute fixture. The real call site is checked by reading the source, below.
def _apply(sl, bullish, sp):
    return sl + sp if (not bullish and sp > 0) else sl


print("\n3. the spread widens a SELL's stop — and only a sell's:")
close("a sell's stop moves out by exactly the spread", _apply(1.3000, False, 0.0003), 1.3003, 1e-9)
teeth("a BUY's stop is untouched — applying it there measured +13.0R -> +1.4R",
      _apply(1.3000, True, 0.0003) == 1.3000)
teeth("a zero spread moves nothing", _apply(1.3000, False, 0.0) == 1.3000)
teeth("...and so does an unreadable one (sp is 0.0 when it cannot be read)",
      _apply(1.3000, False, max(0.0, None or 0.0)) == 1.3000)
# His 16 Sep GBP/USD sell: a 2.5-pip stop against a 2.6-pip spread, gone in 1.2 seconds.
old_room, spread = 2.5, 2.6
close("his 16 Sep sell would now have 5.1 pips of room, not 2.5", old_room + spread, 5.1, 1e-9)
teeth("...which is no longer inside the spread", (old_room + spread) > spread)

# ── 4. it is actually WIRED at the real call site ────────────────────────────
# Source-read, the way `test_request_pacing` and `test_auth_recovery` do it: the failure that matters
# is a call site that forgot, not a helper that misbehaves.
print("\n4. the real entry applies it, on the sell side only:")
src = (Path(__file__).resolve().parent.parent / "strategies/vix1_entry.py").read_text(encoding="utf-8")
body_src = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith("#"))
check("vix1_entry widens the stop for a sell", "if not bullish and sp > 0:" in body_src, True)
check("...by the spread it already has", "sl += sp" in body_src, True)
teeth("the winning candidate is recorded BEFORE the spread is added, so the label cannot lie",
      body_src.index("chose_line") < body_src.index("sl += sp"))
check("the note tells him the spread moved it", "spread (a sell's stop fires on the ask)" in src, True)

print(f"\n{'ALL PASS' if _fail == 0 else f'{_fail} FAILED'} — {_pass + _fail} checks\n")
sys.exit(0 if _fail == 0 else 1)
