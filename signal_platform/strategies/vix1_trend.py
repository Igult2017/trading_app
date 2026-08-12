"""
VIX.1 — the 1HR trend as MARKET STRUCTURE, and the two events that move it: BOS and CHoCH.

THE MODEL (user 2026-07-26: "we have the main trend and inside it we can have ranging market or a
movement we can't understand. But until the market shows decisively that the trend has changed, we
trade the main trend"). Dow's own rule, with modern market structure giving the precise test.

  ESTABLISH  two higher highs + higher lows -> up;  two lower highs + lower lows -> down
  BOS        a swing that EXTENDS the trend (a new HH in an uptrend / new LL in a downtrend).
             The trend CONTINUES; protection advances to the deepest counter-swing of the leg
             just completed.
  CHoCH      a BODY CLOSE through the protecting swing. The trend is PROPOSED as over — but is
             NOT yet turned (see below).
  CONFIRM    the proposed new direction must itself print a BOS before the trend actually turns.

WHY THE TURN IS TWO-STAGE (added 2026-08-11). The old code turned the trend the instant price closed
through the protecting swing. Measured over 12 months of real H1, that produced trend phases lasting
under two days — noise, not trends — and it is why VIX.1 sold GBP/USD all day on 10 Aug into an +85
pip rally. Requiring the new direction to prove itself first:

    approach                        GBP/USD                     EUR/USD
    turn on the CHoCH close alone   10 phases, 2 under 2 days   10 phases, 2 under 2 days
    two-stage (this)                 9 phases, 0 under 2 days   10 phases, 0 under 2 days
    median phase length            334 -> 411 bars             246 -> 350 bars

HALF OF ALL PULLBACKS ARE COMPLEX — measured, 21 of 42 on GBP/USD and 17 of 37 on EUR/USD over 12
months. A complex pullback prints its OWN lower highs and lower lows inside an intact uptrend: it
looks exactly like a downtrend on any faster reading. That is the case this module exists to survive,
and it is why direction is read ONLY here, on wide swings, and never from the faster structure read
that vix1_structure uses for entry timing.

THE FREEZE BUG THIS REPLACED. The old turn set `protected = max(since) if since else None`, and the
turn test was guarded by `if protected is not None`. Landing on None left the trend UNABLE TO EVER
CHANGE AGAIN: GBP/USD spent 62% of bars frozen, once for 873 bars (~7 weeks). Simply removing the
freeze made things WORSE (EUR/USD 10 -> 18 phases, median halved) — it had been masking how eager the
turn rule was. The two-stage turn fixes both at once, and protection is never None by construction.

A BODY CLOSE, never a wick — a wick through a level is a liquidity grab (platform-wide rule).
Deliberately DERIVED, never stored: replayed from the passed window every call, so no hidden global
can desynchronise across a restart or a second process.
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.swing_points import find_swing_points

@dataclass(frozen=True)
class _Pivot:
    """One turning point as the replay below wants it, whichever source produced it."""
    is_high: bool
    price: float
    index: int


_SWING_N  = 3     # generic default; vix1_bias passes its own (48) for the main trend
_MIN_BARS = 20    # below this there is not enough structure to call anything


@dataclass
class TrendState:
    """The trend, plus WHY it is what it is — so a signal card can show its own reasoning."""
    direction: int = 0                      # +1 up / -1 down / 0 none-or-changing
    protected: float | None = None           # close through this = CHoCH
    pending: int = 0                         # a CHoCH proposed this direction; awaiting its BOS
    bos_price: float | None = None           # the most recent break of structure
    bos_index: int | None = None
    choch_price: float | None = None         # the CHoCH that started the current direction
    choch_index: int | None = None
    breaks: int = 0                          # BOS since this direction began — see `maturity`
    # THE BAR THIS DIRECTION WAS ESTABLISHED ON. Exposed for the retracement tracker, which measures
    # from the trend's best price SINCE THE TREND BEGAN and would otherwise have to replay this whole
    # function a second time to find the start. Indexes into the window passed to `trend_state`.
    direction_since: int | None = None
    highs: list[float] = field(default_factory=list)
    lows: list[float] = field(default_factory=list)

    @property
    def maturity(self) -> str:
        """DEVELOPING or DEVELOPED — his distinction, 2026-08-11.

        "The trend has developed" = it has already continued at least once, so there is a break of
        structure behind it. "The trend is developing... after a ranging market, pullback or a
        reversal" = it has just printed its first pair and this is the first continuation.

        BOTH are tradeable. The label exists so the card can say which, and so the difference can be
        judged later on real results rather than assumed now.
        """
        if self.direction == 0:
            return "none"
        return "developed" if self.breaks >= 2 else "developing"

    def reason(self, digits: int = 5) -> str:
        """One line naming the event that justifies trading this direction."""
        if self.direction == 0:
            return "trend changing — a reversal is proposed but not yet confirmed" if self.pending \
                   else "no established trend"
        way = "up" if self.direction == 1 else "down"
        if self.choch_price is not None and self.bos_price is not None:
            return (f"trend turned {way} by CHoCH at {self.choch_price:.{digits}f}, "
                    f"confirmed by BOS at {self.bos_price:.{digits}f}")
        if self.bos_price is not None:
            return f"{way}trend — BOS at {self.bos_price:.{digits}f} confirmed it is continuing"
        return f"{way}trend established from structure"


def _establish(seq: list[tuple[bool, float]]) -> tuple[int, float] | None:
    """Has a trend just STARTED? Returns (direction, the swing that protects it) or None.

    HIS RULE, verbatim (2026-08-12):

        "When a trend starts, it has a high then a low, and if it is a real trend it will print
         another high after the first low. So when it starts printing the second high after the first
         low, we start looking for a momentum candle."

    So an uptrend starts on **three** turning points — a high, a low, then a HIGHER high — and the low
    between them is what protects it. Mirrored for a downtrend: a low, a high, then a LOWER low.

    THIS REPLACED A FOUR-POINT TEST (fixed 2026-08-12). The old rule needed the last TWO highs AND the
    last TWO lows all rising, i.e. four pivots, so it began looking one whole swing later than he
    does. He caught it: *"Did you fix this or you have my rule and still kept the old code?"* — I had
    written the difference into the docs instead of closing it.

    AN EXPANDING RANGE ESTABLISHES NOTHING. Higher highs AND lower lows can both be true at once
    (price broadening out). The old four-point test could never see that case because it demanded
    both sides move together; this one can, so it is refused explicitly rather than letting whichever
    branch is written first silently win.
    """
    highs = [i for i, (is_high, _) in enumerate(seq) if is_high]
    lows = [i for i, (is_high, _) in enumerate(seq) if not is_high]
    up = down = None

    if len(highs) >= 2:
        a, b = highs[-2], highs[-1]
        if seq[b][1] > seq[a][1]:
            between = [i for i in lows if a < i < b]
            if between:                                  # the HL that protects the uptrend
                up = (1, seq[max(between)][1])
    if len(lows) >= 2:
        a, b = lows[-2], lows[-1]
        if seq[b][1] < seq[a][1]:
            between = [i for i in highs if a < i < b]
            if between:                                  # the LH that protects the downtrend
                down = (-1, seq[max(between)][1])

    if up and down:
        return None
    return up or down


def trend_state(candles: list[Candle], n: int = _SWING_N, turns=None) -> TrendState:
    """Replay the structure and return the full state. `clear_trend` is the direction-only view.

    `turns` lets a DIFFERENT source of turning points drive the same rules — pass the real-time ones
    from `vix1_swings.turning_points` and every rule below (establish, BOS, CHoCH, the two-stage
    confirm) runs unchanged on them. Left as None it uses the n-bar lookback detector as before.

    THE ONLY THING THE TWO SOURCES DISAGREE ABOUT IS *WHEN A TURN BECOMES KNOWN*, so that is what
    was generalised. A lookback pivot is knowable `n` bars after it prints; a real-time turn is
    knowable the bar price closes through the candle that made it — a median of 1 bar, against a
    hard floor of 48. Everything downstream is identical, which is the point: the rules are his,
    only the eyesight changes.
    """
    st = TrendState()
    if len(candles) < _MIN_BARS:
        return st
    if turns is None:
        pts = [(p.index + n, p.is_high, p.price, p.index)
               for p in find_swing_points(candles, n)]
    else:
        pts = [(t.confirmed, t.is_high, t.price, t.index) for t in turns]
    pts.sort()
    if not pts:
        return st

    since: list[float] = []       # counter-swings banked since the last BOS
    last_ext: float | None = None  # the last swing that EXTENDED the trend
    k = 0                          # pivots are consumed at the bar they become KNOWN
    last_pi: int | None = None     # where the most recent pivot actually sits — see direction_since
    seq: list[tuple[bool, float]] = []   # confirmed pivots IN ORDER — `highs`/`lows` lose the order,
                                         # and his establishment rule is about a sequence

    for i, c in enumerate(candles):
        while k < len(pts) and pts[k][0] <= i:
            _, _is_high, _price, _pidx = pts[k]; k += 1
            p = _Pivot(_is_high, _price, _pidx)
            (st.highs if p.is_high else st.lows).append(p.price)
            seq.append((p.is_high, p.price))
            last_pi = p.index

            # CONFIRM a proposed reversal: the new direction must print its own BOS first.
            if st.pending and len(st.highs) >= 2 and len(st.lows) >= 2:
                if st.pending == -1 and not p.is_high and st.lows[-1] < st.lows[-2]:
                    st.direction, st.protected = -1, max(st.highs[-2:])
                    st.bos_price, st.bos_index = p.price, p.index
                    st.pending, last_ext, since, st.breaks = 0, p.price, [], 1
                    st.direction_since = p.index
                elif st.pending == 1 and p.is_high and st.highs[-1] > st.highs[-2]:
                    st.direction, st.protected = 1, min(st.lows[-2:])
                    st.bos_price, st.bos_index = p.price, p.index
                    st.pending, last_ext, since, st.breaks = 0, p.price, [], 1
                    st.direction_since = p.index
                continue

            if st.direction == 0:
                continue
            # An UPTREND is extended by a higher HIGH; a DOWNTREND by a lower LOW. The swing on the
            # OTHER side is the one PROTECTING the trend (the higher low / the lower high).
            extends = p.is_high if st.direction == 1 else (not p.is_high)
            if not extends:
                # Highs printed while a downtrend consolidates are noise INSIDE the trend, not the
                # level defining it. Banking them WITHOUT moving protection is what lets a COMPLEX
                # pullback run its course without turning the trend — and half of all pullbacks are
                # complex (21 of 42 on GBP/USD over 12 months).
                #
                # A RESPONSIVE ALTERNATIVE WAS TRIED AND REJECTED, 2026-08-11. Moving protection to
                # each counter-swing (the textbook "last lower high" CHoCH level) does read the
                # 10-Aug reversal earlier — but it takes trend changes from 10 to 14 (GBP/USD) and
                # 10 to 16 (EUR/USD) over 12 months, and `tests/vix1/test_trend.py` failed it on the
                # 4-year stability property it exists to protect. That test exists BECAUSE two
                # earlier candidate fixes each looked right on the day they were tried and were
                # worse over four years. It was right again. The 10-Aug signal is stopped by the LEG
                # GATE instead (vix1_structure), which refuses it at every swing width tested.
                since.append(p.price)
                continue
            if last_ext is None or (p.price > last_ext if st.direction == 1 else p.price < last_ext):
                if since:
                    st.protected = min(since) if st.direction == 1 else max(since)
                st.bos_price, st.bos_index = p.price, p.index      # BOS: the trend continues
                st.breaks += 1
                last_ext, since = p.price, []

        if st.direction == 0 and not st.pending:
            started = _establish(seq)
            if started:
                # `last_ext` is set to the SAME swing as `protected`, which is what the four-point
                # version did too (it used the two lows). Deliberately unchanged: fixing the
                # establishment rule and the BOS reference in one go would make any measured
                # difference unattributable.
                st.direction, st.protected = started
                last_ext, since = st.protected, []
                st.breaks, st.direction_since = 1, last_pi
        elif st.direction != 0 and st.protected is not None:
            # CHoCH — PROPOSE the reversal. The trend does not turn until that direction confirms.
            if st.direction == 1 and c.close < st.protected:
                st.pending, st.direction = -1, 0
                st.choch_price, st.choch_index = st.protected, i
                st.protected, last_ext, since, st.breaks = None, None, [], 0
                st.direction_since = None      # no direction, so nothing to measure a leg from
            elif st.direction == -1 and c.close > st.protected:
                st.pending, st.direction = 1, 0
                st.choch_price, st.choch_index = st.protected, i
                st.protected, last_ext, since, st.breaks = None, None, [], 0
                st.direction_since = None

    return st


def clear_trend(candles: list[Candle], n: int = _SWING_N) -> int:
    """+1 uptrend / -1 downtrend / 0 not established (or a reversal proposed but not yet confirmed).

    The direction-only view of `trend_state`. Callers wanting to SAY WHY should use trend_state().
    """
    return trend_state(candles, n).direction
