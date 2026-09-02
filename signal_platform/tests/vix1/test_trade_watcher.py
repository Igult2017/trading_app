"""THE REAL-TIME WATCHER — the price it acts on, and the failure it must survive.

Two things are asserted here, and the second is the one that matters.

1. THE PRICE IS LIVE, AND THE RIGHT SIDE OF THE SPREAD. `position_tracker._price_now` used to return
   the last CLOSED M1 bar while its docstring claimed it was the forming bar. The feed serves closed
   bars only (`candle_cache.py:43`, verified against the live broker over 14 polls), so the trigger
   price could be ~110s old: 60s of bar + 20s of cache + the 30s poll. And a buy's stop triggers on
   the BID, a sell's on the ASK — `breakeven.py:78` records a real demo position CLOSED INSTANTLY on
   2026-08-21 because a stop went the wrong side of the market.

2. THE WATCHDOG, TESTED BY KILLING THE SESSION RATHER THAN BY READING IT. A dead FIX stream is
   indistinguishable from a quiet market — prices simply stop arriving. A watcher that goes blind
   silently is worse than none, because it still looks like it is working. So the stream is dropped
   mid-watch here and the fallback and the alarm are asserted, not assumed.
"""
import ast
import asyncio
import os
import time

from _harness import Suite

s = Suite("REAL-TIME WATCHER — live price, correct side, and a watchdog that actually fires")

SP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── 1. THE SIDE OF THE SPREAD ───────────────────────────────────────────────
from monitor import position_tracker as PT
from data import ctrader_spread

_calls = {"candles": 0}


async def _fake_quote(symbol):
    return (1.35325, 1.35338)          # bid, ask — a real GBP/USD spread from 2026-08-30


async def _fake_candles(symbol, tf, n):
    _calls["candles"] += 1
    class C:
        close = 1.35000                # deliberately different, so a fallback is unmistakable
    return [C(), C()]


ctrader_spread.quote_for = _fake_quote
PT.fetch_candles = _fake_candles

buy_px = asyncio.run(PT._price_now("GBP/USD", bullish=True))
sell_px = asyncio.run(PT._price_now("GBP/USD", bullish=False))
s.check("a BUY's stop is measured on the BID", buy_px, 1.35325)
s.check("a SELL's stop is measured on the ASK", sell_px, 1.35338)
s.check("...and neither fell back to a candle", _calls["candles"], 0)

# THE FALLBACK MUST STILL WORK. A quote that fails must not blind the tracker — the old M1 close is
# worse than a live quote and far better than nothing.
async def _no_quote(symbol):
    return None

ctrader_spread.quote_for = _no_quote
fell_back = asyncio.run(PT._price_now("GBP/USD", bullish=True))
s.check("no quote available -> falls back to the M1 close", fell_back, 1.35000)
s.check("...and it really did fetch a candle to do it", _calls["candles"], 1)


# ── 2. THE STREAM'S OWN STALENESS ───────────────────────────────────────────
from data.fix_quotes import FixQuoteStream

st = FixQuoteStream("5296567", "not-used-offline")
s.check("a stream that never connected is stale", st.is_stale(20.0), True)
s.check("...and reports no age rather than a fake one", st.age("GBP/USD"), None)

st.book.connected = True
st.book.absorb({"55": "2", "px_0": "1.35325", "px_1": "1.35338"})
s.check("an absorbed tick becomes a quote", st.quote("GBP/USD"), (1.35325, 1.35338))
s.check("...and it is not stale", st.is_stale(20.0, "GBP/USD"), False)

st.book._last_tick["GBP/USD"] = time.monotonic() - 60          # 60 seconds of silence
s.check("SILENCE PAST THE LIMIT IS STALE, even though the socket says connected",
        st.is_stale(20.0, "GBP/USD"), True)

st.book.connected = False
s.check("a disconnected stream is stale whatever its last tick said",
        st.is_stale(20.0, "GBP/USD"), True)

# A symbol cTrader does not name must not silently become another one.
st2 = FixQuoteStream("5296567", "x")
st2.book.absorb({"55": "9999", "px_0": "1.0", "px_1": "1.1"})
s.check("an unknown symbol id is ignored, never guessed", st2.quote("GBP/USD"), None)


# ── 3. THE WATCHDOG: KILL THE SESSION MID-WATCH ─────────────────────────────
from monitor.trade_watcher import TradeWatcher


class _P:
    """The smallest thing that behaves like an open position for this test."""
    symbol, bullish, stop, entry = "GBP/USD", True, 1.35000, 1.35100
    position_id, target = 42, 1.36000
    def r_at(self, price):  return 1.0
    def breakeven(self):    return 1.35110


sent = []
async def _send(msg):
    sent.append(msg)
    return True


w = TradeWatcher(_send)
w._stream = st                                   # the stream we just killed above
ctrader_spread.quote_for = _no_quote             # so the fallback is visibly the candle
_calls["candles"] = 0

price = asyncio.run(w._price_for(_P(), streamed=True))
s.check("a DEAD stream falls back to the slower price", price, 1.35000)
s.check("...and it is the fallback that produced it", _calls["candles"], 1)
s.check("...AND IT SAYS SO — silence is never silent", len(sent), 1)
s.check("...naming the symbol", "GBP/USD" in (sent[0] if sent else ""), True)
s.check("...and warning that moves may be late",
        "late" in (sent[0] if sent else "").lower(), True)

# ONCE, NOT EVERY PASS. An outage must be visible without becoming noise that gets muted.
asyncio.run(w._price_for(_P(), streamed=True))
asyncio.run(w._price_for(_P(), streamed=True))
s.check("the alarm is raised ONCE, not on every pass", len(sent), 1)

# AND RECOVERY IS ANNOUNCED by clearing the degraded flag, so the next outage warns again.
st.book.connected = True
st.book._last_tick["GBP/USD"] = time.monotonic()
back = asyncio.run(w._price_for(_P(), streamed=True))
s.check("when the stream returns, the streamed price is used again", back, 1.35325)
s.check("...and the watcher is no longer degraded", w._degraded, False)

# RECOVERY IS NOW SAID OUT LOUD, not only logged (2026-09-02). The warning went to his DM, so the
# all-clear must too — otherwise the last thing he holds is a warning about a feed that came back.
s.check("...and the all-clear reaches him", any("flowing again" in m for m in sent), True)
s.check("...naming the symbol", any("GBP/USD" in m and "flowing again" in m for m in sent), True)

# COUNT WARNINGS, NOT MESSAGES. This read `len(sent)` as a stand-in for "how many warnings", which
# was true only while a warning was the ONLY thing ever sent. The all-clear made that count 3 and
# the assertion failed — the behaviour was right and the measure was stale. Counting the warnings
# themselves keeps the check meaning what its name says, whatever else is sent alongside.
asyncio.run(w._price_for(_P(), streamed=True))
st.book.connected = False
asyncio.run(w._price_for(_P(), streamed=True))
warnings = [m for m in sent if "went quiet" in m]
s.check("A SECOND OUTAGE WARNS AGAIN — the alarm is not spent", len(warnings), 2)
s.check("...and each outage is still announced only once", len(sent), 3)


# ── 3b. "COULD NOT FIND OUT" IS NOT "NOTHING OPEN" ──────────────────────────
# `ctrader_positions.open_positions` returns None when the broker could not be read, and its own
# docstring is explicit: "[] is 'you have no trades open', None is 'I could not find out'. Alerting
# on the first is correct; alerting on the second would be inventing a fact."
#
# The first version of the watcher iterated the result directly and died with
# `TypeError: 'NoneType' object is not iterable` — caught by the boot test on a real failed read, not
# by any unit test, which is why this one now exists. Treating None as "nothing open" would also drop
# the price stream and stop watching a position that may well still be there.
from data import ctrader_positions as CP

async def _unreadable():
    return None

async def _none_open():
    return []

import monitor.trade_watcher as TW
TW._IDLE_S = 0.01                       # the idle wait is real; 30s of it is not needed to test this

CP.open_positions = _unreadable
w2 = TradeWatcher(_send)
ok = True
try:
    asyncio.run(asyncio.wait_for(w2._cycle(), timeout=5))
except Exception as exc:
    ok = f"{type(exc).__name__}: {exc}"
s.check("an UNREADABLE broker does not crash the cycle", ok, True)
s.check("...and does not leave a stream open", w2._stream, None)

CP.open_positions = _none_open
ok2 = True
try:
    asyncio.run(asyncio.wait_for(w2._cycle(), timeout=5))
except Exception as exc:
    ok2 = f"{type(exc).__name__}: {exc}"
s.check("genuinely NO positions also passes cleanly", ok2, True)


# ── 4. IT MUST NEVER TOUCH THE SCANNER'S CONNECTION ─────────────────────────
# The promise this was approved on: "if it will bring the signal platform down just drop it."
# Parsed, not grepped — a text search matches the docstrings explaining what is NOT used.
_watched = [os.path.join(SP_ROOT, "monitor", "trade_watcher.py"),
            os.path.join(SP_ROOT, "data", "fix_quotes.py"),
            os.path.join(SP_ROOT, "data", "fix_wire.py")]
_tree = ast.parse("\n".join(open(f, encoding="utf-8").read() for f in _watched))
_called = {(n.func.attr if isinstance(n.func, ast.Attribute) else
            getattr(n.func, "id", "")) for n in ast.walk(_tree) if isinstance(n, ast.Call)}
s.check("the watcher never calls get_connection() — the scanner's socket",
        "get_connection" in _called, False)
s.check("...and never refreshes the shared token", "get_access_token" in _called, False)

# THE PASSWORD MUST NOT BE IN THE SOURCE. It comes from the environment, and a literal here would
# be committed and pushed by the Stop hook within the hour.
_consts = {n.value for n in ast.walk(_tree)
           if isinstance(n, ast.Constant) and isinstance(n.value, str)}
s.check("no FIX password literal in the watcher or the stream",
        any("anny" in c.lower() for c in _consts), False)

s.done()
