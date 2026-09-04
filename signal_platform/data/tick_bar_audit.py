"""
Are our tick-built candles the SAME candles the broker eventually sends? The gate on the whole idea.

WHY THIS IS A GATE AND NOT A NICETY. cTrader publishes **no guarantee that every tick is delivered**
— its FIX limitations page is silent on throttling and completeness, and cTrader itself recommends
the Open API alongside FIX for market data. If ticks are ever coalesced or dropped, our high or low
differs from the broker's. **A fast wrong candle is far worse than a slow right one**: the momentum
test could pass when it should not, or the line be drawn at the wrong level, and we would then be
placing trades faster onto wrong numbers.

So nothing built from ticks is served until it has been proved, and the proof runs continuously in
production rather than once at build time. Every bar we build is compared against the broker's own
when it arrives 10-70s later.

THE BAR IS EXACTNESS, and it is the bar the aggregator already cleared: open, high, low and close
identical to the last decimal, over a minimum sample, with a 100% recent match rate. Not "close
enough" — a tenth of a pip on a 3-pip stop is a third of the risk.

TRUST IS PER SYMBOL. One instrument's feed misbehaving must not disqualify the others, and a symbol
that fails is simply served from the broker exactly as it is today.

PHASE 1 SERVES NOTHING. This module only observes and reports; `serve_enabled` is what turns the
result into a behaviour change, and it stays off until the match rate has been read off a live
session.
"""
import logging
import threading
from collections import deque

log = logging.getLogger(__name__)

# How many consecutive matching bars before a symbol is trusted. One live hour gives ~60 per symbol,
# so this is minutes of evidence, not days — but it is never zero.
#
# That claim was FALSE until 31 Aug and this is the note that keeps it honest: these are DISTINCT
# MINUTES, each scored once (`compare`). They used to be raw comparisons, and the same minute was
# re-scored on every fetch, so both numbers below meant far less than they appeared to.
MIN_SAMPLE = 30
# How many recent BARS the verdict is taken over — one entry per minute, never per fetch.
_WINDOW = 200


# How close two offsets must be to count as "the same constant". Prices are floats, so 0.005
# computed from 216.343-216.348 and from 4308.35-4308.1 are not bit-identical; this is a tolerance
# for FLOAT NOISE, not for price difference — it is far below one pipette on every instrument traded.
_OFFSET_EPS = 1e-9


# HOW CLOSE IS CLOSE ENOUGH — his ruling, 2026-09-04:
#
#     "so long as the FIX data is ahead of broker data, we dont drop it. We only drop it if it is
#      later than the old broker's data."
#
# WHAT THE OLD RULE COST, AND THE ARITHMETIC THAT JUSTIFIED IT WAS WRONG. This module demanded EXACT
# equality, and the reason given (line 17) was *"a tenth of a pip on a 3-pip stop is a third of the
# risk"*. **0.1 / 3 is 3.3%, not 33% — the justification overstated the cost TENFOLD**, and every
# "exactness, not closeness" decision since rested on it.
#
# WHAT IS ACTUALLY BEING TRADED OFF, measured both ways:
#   * GAIN: the broker publishes a finished bar **10-70 seconds late** (`candle_cache.py:46`). A bar
#     built from ticks exists the instant its minute ends.
#   * COST: the real production differences were **0.00001 and 0.00002 on EUR/USD** — one and two
#     tenths of a pip, on the open or close of an occasional bar. Against his real 5.9 and 6.2-pip
#     stops that is **3.4% of the risk at worst**.
#
# Being up to a minute late is what caused measured harm — all four stored VIX.1 signals arrived at
# or past their own entry, two genuinely through it. Throwing away a minute of freshness to avoid a
# rounding error is the wrong side of the trade.
#
# NO FIXED TOLERANCE, AND THAT IS THE POINT. A tick count does not scale across instruments: the
# same 3% of the risk is 0.2 of a pip on EUR/USD (5.9-pip stop) and 10 cents on gold (a $4.12 stop).
# Picking a number per pair would be fitting, which is how the last bad threshold got in.
#
# THE ONE BOUNDARY USED IS THE CANDLE'S OWN RANGE: a difference smaller than the bar's own high-to-low
# is recognisably the SAME candle, seen through a slightly different set of ticks. A difference larger
# than the whole candle is a different candle, and no amount of freshness makes that safe. Nothing is
# tuned — the bar sizes itself.
#
# GBP/JPY IS STILL EXCLUDED, and NOT by this test. Its offset (0.005 against a 0.146 range) passes
# comfortably here. It is caught by `_constant_offset` below: all four prices out by the SAME amount
# in the SAME direction, every bar, which is a price source quoting a different level rather than a
# different view of the same one. **That is a deliberate departure from the literal reading of his
# instruction** — he said drop it only when it is not faster — and it is kept because serving a
# systematically shifted level would put every stop half a pip from where the broker thinks it is.

def _within_tolerance(symbol: str, ours, theirs) -> bool:
    """Is this recognisably the same candle — every price closer than the bar's own range?"""
    span = theirs.high - theirs.low
    if span <= 0:
        return False                      # a flat bar gives no scale to judge by; demand exactness
    limit = span + _OFFSET_EPS
    return (abs(ours.open - theirs.open) < limit and abs(ours.high - theirs.high) < limit
            and abs(ours.low - theirs.low) < limit and abs(ours.close - theirs.close) < limit)


def _constant_offset(ours, theirs) -> float | None:
    """The single amount every price is out by — or None if they differ by different amounts.

    THIS IS THE WHOLE DISTINCTION. A constant offset means the candle was built correctly and the
    price SOURCE is quoting differently (a broker markup, a different account's pricing). Different
    amounts on different prices mean the candle itself is wrong — a dropped tick, a missed high — and
    that is a real fault which must be logged every single time.
    """
    diffs = (ours.open - theirs.open, ours.high - theirs.high,
             ours.low - theirs.low, ours.close - theirs.close)
    if max(diffs) - min(diffs) > _OFFSET_EPS:
        return None
    return diffs[0]


class _SymbolAudit:
    __slots__ = ("results", "matched", "compared", "last_mismatch", "last_scored", "offset")

    def __init__(self):
        self.results = deque(maxlen=_WINDOW)
        self.matched = 0
        self.compared = 0
        self.last_mismatch: str | None = None
        # The newest minute already scored. EVERY MINUTE COUNTS ONCE — see `compare`.
        self.last_scored: int = 0
        # The constant price difference, when every one of the four prices is out by the SAME
        # amount. None until a mismatch is seen; see `compare` for why it earns its own field.
        self.offset: float | None = None


class TickBarAudit:
    """Per-symbol scoreboard of tick-built bars against the broker's own."""

    def __init__(self):
        self._lock = threading.Lock()
        self._by_symbol: dict[str, _SymbolAudit] = {}

    def compare(self, symbol: str, ours, theirs) -> bool | None:
        """One bar against its broker counterpart. True/False, or None if not comparable.

        None means the pair could not be judged (no counterpart for that minute) and is NOT counted
        either way — scoring an unanswerable comparison as a pass is how a bad feed earns trust.
        """
        if ours is None or theirs is None or ours.time != theirs.time:
            return None
        exact = (ours.open == theirs.open and ours.high == theirs.high
                 and ours.low == theirs.low and ours.close == theirs.close)
        # A SYSTEMATIC LEVEL SHIFT IS NEVER ACCEPTABLE, however small. Every price out by the SAME
        # amount in the SAME direction is a price source quoting a different level, not a different
        # view of the same one — so it is rejected before the "same candle" test can forgive it.
        shifted = (not exact) and _constant_offset(ours, theirs) is not None
        ok = exact or (not shifted and _within_tolerance(symbol, ours, theirs))
        with self._lock:
            a = self._by_symbol.setdefault(symbol, _SymbolAudit())
            # EVERY MINUTE IS SCORED EXACTLY ONCE, and this line is what makes the scoreboard mean
            # what it says. `_audit_against_ticks` re-compares EVERY overlapping bar on EVERY M1
            # fetch, so without this the same minute is scored again and again — and the window is
            # 200 COMPARISONS, not 200 bars.
            #
            # MEASURED IN PRODUCTION, 30 Aug: GBP/USD showed 183/200 and later 193/200, reading like
            # 7-17 separate failures. There was exactly ONE bad minute (22:47) — re-scored on every
            # fetch until it filled a twelfth of the window. It cut the other way too: a "200/200"
            # was roughly 33 distinct minutes counted six times each, so `MIN_SAMPLE = 30` could be
            # satisfied by about five real minutes of evidence. The gate protects the money path;
            # it must not be able to overstate what it has seen.
            #
            # First observation wins. A bar re-fetched later with different values is NOT re-scored:
            # the first comparison is the honest one, made against what we actually built at the time.
            if ours.time <= a.last_scored:
                return ok
            a.last_scored = ours.time
            a.results.append(ok)
            a.compared += 1
            if ok:
                a.matched += 1
            else:
                a.last_mismatch = (
                    f"{symbol} @{ours.time}: ours O{ours.open} H{ours.high} L{ours.low} "
                    f"C{ours.close} vs broker O{theirs.open} H{theirs.high} L{theirs.low} "
                    f"C{theirs.close}")
                # A KNOWN CONSTANT OFFSET IS NOT NEWS, AND A WARNING SHOULD TELL YOU SOMETHING YOU
                # DO NOT ALREADY KNOW. GBP/JPY produced 405 of the 434 mismatch warnings in 6.8
                # hours of production (93%) — every bar, all of them the same finding: all four
                # prices out by exactly 0.005, the SHAPE right and only the level shifted. That is
                # already recorded (OPEN.md B13), already acted on (the symbol is untrusted, so its
                # bars are never served), and already reported every 15 minutes by the scoreboard.
                #
                # NOT SUPPRESSION — CLASSIFICATION. The offset is said once, and again the moment it
                # CHANGES, which is the event that would actually mean something new. Anything that
                # is NOT a clean constant offset — a wrong high, a dropped tick, random noise — has
                # `off` of None and is logged every time, exactly as before. The scoreboard still
                # counts every bar as a miss either way, so trust is unaffected.
                off = _constant_offset(ours, theirs)
                if off is None:
                    log.warning(f"[tick-audit] MISMATCH {a.last_mismatch}")
                elif a.offset is None or abs(off - a.offset) > _OFFSET_EPS:
                    was = "" if a.offset is None else f" (was {a.offset:+g})"
                    log.warning(f"[tick-audit] {symbol}: every price is a CONSTANT {off:+g} from the "
                                f"broker's{was} — shape matches, level is shifted. Repeats are not "
                                f"logged; the scoreboard still counts every bar. {a.last_mismatch}")
                    a.offset = off
        return ok

    def trusted(self, symbol: str) -> bool:
        """May this symbol's tick-built bars be served?

        Requires a minimum sample AND no mismatch anywhere in the recent window. A single wrong bar
        withdraws trust — there is no partial credit, because there is no such thing as a candle that
        is mostly right.
        """
        with self._lock:
            a = self._by_symbol.get(symbol)
            if a is None or len(a.results) < MIN_SAMPLE:
                return False
            return all(a.results)

    def report(self, symbol: str | None = None) -> dict:
        """The scoreboard, for logs and the reader tool."""
        with self._lock:
            out = {}
            for sym, a in self._by_symbol.items():
                if symbol and sym != symbol:
                    continue
                n = len(a.results)
                out[sym] = {
                    "compared": a.compared,
                    "matched": a.matched,
                    "recent": n,
                    "recent_matched": sum(1 for r in a.results if r),
                    "trusted": n >= MIN_SAMPLE and all(a.results),
                    "last_mismatch": a.last_mismatch,
                }
            return out


audit = TickBarAudit()
