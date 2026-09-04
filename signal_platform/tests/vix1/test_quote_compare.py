"""THE TWO PRICE SOURCES MUST NEVER INTERFERE WITH EACH OTHER.

His rule: *"we use 2 sources of data so that when one goes off we switch to the other seamlessly
like nothing ever happened... Also make sure this does not disrupt anything."*

`ctrader_spread.quote_for` asks the broker. Alongside it, `_compare_live` reads the live streamed
quote and LOGS the two side by side so the streamed ASK can be judged over days before anything
relies on it. That comparison decides nothing today, and this file is the proof that it cannot
start deciding something by accident:

  * a broken, crossed, missing or exploding live stream must leave the broker's quote untouched
  * the live pair is always taken WHOLE — a live bid is never paired with a broker ask

WHY THE MIXING RULE IS TESTED RATHER THAN TRUSTED. The spread is `ask - bid` from ONE quote
(`spread_for`, and `strategy_runner.py:257`). Pair a live bid with a 25-second-old broker ask and the
result is a spread no broker ever showed — possibly NEGATIVE, which every consumer then reads as a
crossed book. This was nearly shipped: the plan said Part B could fall back to "live bid, broker
ask", and that is why it did not.
"""
import time

import _harness  # noqa: F401
from _harness import Suite                                          # noqa: E402

from data import ctrader_spread, fix_quotes                         # noqa: E402
from data.fix_quotes import FixQuoteStream                          # noqa: E402

s = Suite("TWO PRICE SOURCES — the observation can never cost a quote")

for st in tuple(fix_quotes._STREAMS):
    fix_quotes._deregister(st)

BID, ASK = 1.16000, 1.16004


def compare():
    """Runs the real comparison. It returns nothing; the point is that it must never raise."""
    ctrader_spread._compare_live("EUR/USD", BID, ASK)
    return True


# ── NO STREAM AT ALL ───────────────────────────────────────────────────────
s.check("with no live stream, the comparison is a no-op", compare(), True)


# ── A HEALTHY STREAM ───────────────────────────────────────────────────────
st = FixQuoteStream("1", "offline")
st.book.connected = True
st.book._quotes["EUR/USD"] = (1.16001, 1.16005)
st.book._last_tick["EUR/USD"] = time.monotonic()
fix_quotes._register(st)
s.check("with a healthy stream it still just observes", compare(), True)
s.check("...and the live pair is available WHOLE",
        fix_quotes.live_quote("EUR/USD") is not None, True)


# ── EVERY WAY THE LIVE SIDE CAN BE BROKEN ──────────────────────────────────
# Each of these must leave the broker's quote completely alone. They are separate cases rather than
# one, because each fails at a different point in the lookup and a single case would only prove one.
st.book._quotes["EUR/USD"] = (1.16005, 1.16001)          # crossed
s.check("a CROSSED live book is ignored, not blended", fix_quotes.live_quote("EUR/USD"), None)
s.check("...and the comparison survives it", compare(), True)

st.book._quotes["EUR/USD"] = (1.16002, 1.16002)          # equal
s.check("an EQUAL live book is ignored too", fix_quotes.live_quote("EUR/USD"), None)
s.check("...and the comparison survives it", compare(), True)

st.book._quotes["EUR/USD"] = (1.16001, 1.16005)
st.book._last_tick["EUR/USD"] = time.monotonic() - 600   # stale
s.check("a STALE live quote is ignored", fix_quotes.live_quote("EUR/USD"), None)
s.check("...and the comparison survives it", compare(), True)

st.book._last_tick["EUR/USD"] = time.monotonic()
st.book.connected = False                                # session down
s.check("a DISCONNECTED stream is ignored", fix_quotes.live_quote("EUR/USD"), None)
s.check("...and the comparison survives it", compare(), True)
st.book.connected = True


# ── AND A STREAM THAT ACTIVELY THROWS ──────────────────────────────────────
# The registry holds whatever registered itself. A stream object that raises on every access is the
# case a `try` around the loop exists for, and the only way to know it works is to build one.
class Exploding:
    @property
    def book(self):
        raise RuntimeError("this stream is broken")


boom = Exploding()

# TEETH FIRST — prove the control is real. If `Exploding` did not actually raise, the two checks
# below would pass for no reason at all.
raised = False
try:
    boom.book
except RuntimeError:
    raised = True
s.teeth("the exploding stream really does raise when touched", raised)

fix_quotes._register(boom)
s.check("a stream that raises on every access does not take the lookup down",
        fix_quotes.live_quote("EUR/USD") is not None, True)
s.check("...and the healthy stream beside it is still read",
        fix_quotes.live_quote("EUR/USD"), (1.16001, 1.16005))
s.check("...and the comparison still survives", compare(), True)
fix_quotes._deregister(boom)

st._lost()
s.check("after everything, no stream is left registered", fix_quotes.live_streams(), 0)
s.check("and the comparison is a no-op again", compare(), True)

s.done()
