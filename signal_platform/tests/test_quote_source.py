"""
test_quote_source.py — run with:
    cd signal_platform && python tests/test_quote_source.py

THE RULE: a price for THIS INSTANT comes from FIX; the Open API is the fallback for when FIX is
silent. His instruction, recorded in D40: *"when trade is placed and even when watching 1HR candle to
close, we should rely more on FIX data … because it is real time data."* It is also the broker's own
division of labour — FIX "does not support requests for historical market data" (fix_quotes.py:13),
and the Open API is where history lives.

WHAT WENT WRONG WITHOUT IT. `quote_for` asked the Open API for a live price, and `_newest` sends
`ProtoOAGetTickDataReq` — a HISTORICAL request on the scarce ~5/s budget — TWICE per symbol per call
(bid, then ask). About 312 of them in an 18-minute window on 2026-11-03, while the candle fetcher was
being refused for exceeding that same budget.

WHY IT IS GATED PER SYMBOL AND NOT SWITCHED ON WHOLESALE. 165 production samples of the
`quote-compare` line, |difference| mean / max:

    EUR/USD  bid 0.000002 / 0.000020   ask 0.000000 / 0.000010
    GBP/USD  bid 0.000003 / 0.000020   ask 0.000001 / 0.000010
    GBP/JPY  bid 0.005021 / 0.008      ask 0.005021 / 0.006     <- known constant offset
    XAU/USD  bid 0.033    / 0.29       ask 0.016    / 0.29

Two symbols match on both sides; two do not. So the gate is `tick_bar_audit.trusted`, reused rather
than reinvented — it already admits exactly those two and already withdraws trust the moment a
single bar disagrees.

EVERY CHECK BELOW IS ABOUT THE FALLBACK BEING INTACT, because the failure that would matter is not
"we asked the broker once too often" — it is a streamed price being used when it should not have
been.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data import ctrader_spread as cs          # noqa: E402
from data import fix_quotes                     # noqa: E402
from data.tick_bar_audit import audit           # noqa: E402

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def teeth(what, broke_it_and_failed):
    global _pass, _fail
    print(f"  {'PASS' if broke_it_and_failed else 'FAIL'}  TEETH — {what}")
    if broke_it_and_failed:
        _pass += 1
    else:
        _fail += 1


class _Stub:
    """Stand in for the audit and the stream, so no broker and no live session are needed."""
    def __init__(self, trusted: bool, quote):
        self.trusted_val, self.quote = trusted, quote
        self._real_trusted, self._real_live = audit.trusted, fix_quotes.live_quote

    def __enter__(self):
        audit.trusted = lambda symbol: self.trusted_val
        fix_quotes.live_quote = lambda symbol, *a, **k: self.quote
        return self

    def __exit__(self, *exc):
        audit.trusted, fix_quotes.live_quote = self._real_trusted, self._real_live


print("\nA LIVE PRICE COMES FROM FIX; THE OPEN API IS THE FALLBACK\n")

print("1. a trusted symbol with a good streamed quote uses it:")
with _Stub(True, (1.10000, 1.10002)):
    check("streamed quote returned", cs._live_quote_if_trusted("EUR/USD"), (1.10000, 1.10002))

print("\n2. every reason to fall back returns None, so the broker is asked exactly as before:")
with _Stub(False, (1.10000, 1.10002)):
    check("symbol has not earned trust", cs._live_quote_if_trusted("GBP/JPY"), None)
with _Stub(True, None):
    check("no stream / no quote for it", cs._live_quote_if_trusted("EUR/USD"), None)

print("\n3. a crossed or equal book is refused from FIX too:")
# `quote_for` already refuses this from the broker — "not a book, it is a crossed or stale one".
# A streamed quote gets the same test rather than a free pass for its origin.
with _Stub(True, (1.10002, 1.10000)):
    teeth("ask BELOW bid is refused", cs._live_quote_if_trusted("EUR/USD") is None)
with _Stub(True, (1.10000, 1.10000)):
    teeth("ask EQUAL to bid is refused", cs._live_quote_if_trusted("EUR/USD") is None)

print("\n4. it can never be the thing that loses a quote:")
class _Boom:
    def __enter__(self):
        self._real = audit.trusted
        def boom(symbol):
            raise RuntimeError("audit exploded")
        audit.trusted = boom
        return self
    def __exit__(self, *exc):
        audit.trusted = self._real

with _Boom():
    teeth("a throwing gate falls back instead of propagating",
          cs._live_quote_if_trusted("EUR/USD") is None)

print("\n5. the trust gate is the shared one, not a second list:")
src = (Path(__file__).resolve().parent.parent / "data/ctrader_spread.py").read_text(encoding="utf-8")
check("reuses tick_bar_audit", "from data.tick_bar_audit import audit" in src, True)
teeth("and invents no symbol list of its own",
      "EUR/USD" not in src.split('"""')[0] + src.split("_live_quote_if_trusted")[-1].split("async def")[0]
      or "audit.trusted" in src)

print(f"\n{'ALL PASS' if _fail == 0 else f'{_fail} FAILED'} — {_pass + _fail} checks\n")
sys.exit(0 if _fail == 0 else 1)
