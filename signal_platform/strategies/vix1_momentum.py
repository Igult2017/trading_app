"""
VIX.1 — the 1HR MOMENTUM candle.

The strategy's OWN rule, from the playbook — NO indicators. A MOMENTUM CANDLE is the market moving
decisively one way and HOLDING it. It has to answer three questions:

  BIG        — its body is large FOR THIS PAIR RIGHT NOW. The yardstick is the MEDIAN body of the
               last 100 closed bars, never the single candle before it. Measured over 2y of H1, the
               old "bigger than the previous candle" test threw away 21-23% of genuinely strong
               candles (the bar before them simply happened to be bigger) and admitted 24-27% that
               were BELOW normal size — the smallest was 0.79 pips, less than the spread. MEDIAN, not
               mean: on 11-21% of bars a single spike drags the mean past 1.6x the median and then
               blocks every real candle behind it for hours.
  CLEAN      — the body is most of the candle. The GATE floor is 60% of its own range; the shape
               above the floor is GRADED, not just gated (momentum_grade): a 75%+ body with a tiny
               counter-wick is the A-grade "near-wickless look the playbook draws".
  UNREJECTED — the wick AGAINST the move is tiny. The two wicks are NOT the same thing: on a bull
               candle an upper wick is price being SOLD back (momentum failing), while a lower wick
               is a dip being BOUGHT (strength). Only the counter-wick is capped — the old rule
               capped both at 33% and so rejected candles that sold off and were bought back hard.

A RUN is consecutive momentum candles and VIX.1 operates from the FIRST — its close opens the 1M
watch. _MIN_RUN STAYS 1 ON PURPOSE: measured on 1,433 real momentum candles, a second one follows
only 2-5% of the time and 2-3 in a row happen 0-2% of the time. The market gives runs of one, so
waiting for confirmation forfeits the setup. The MOVE does continue — 65% reach 2 more bars of
extension, 47% reach 3, 23% reach 5 — but it continues THROUGH A PULLBACK (a clean unbroken run
reaches 5 bars 0% of the time). That pullback is exactly what the 1M entry is built to buy.
"""
import logging
from statistics import median

from core.types import Candle
from shared.candle_math import body_size, full_range, upper_wick, lower_wick, is_bullish
from shared.pip import pip_size

log = logging.getLogger(__name__)

_BASELINE_BARS  = 100   # bars whose MEDIAN body defines "normal size" for this pair right now
_MIN_BASELINE   = 20    # fewer than this and we cannot say what normal is — never qualify
_MIN_BODY_MULT  = 2.5   # body >= this x the 100-bar MEDIAN body. CALIBRATED 2026-07-20 against 87
                        # real GBP/USD trades: the user's actual momentum candles run ~2.7-6x median
                        # (~14-31 pips, median ~22). 2.5x captures 91% of them; the old 4.0x captured
                        # only 60% — it threw away 4 in 10 real setups (top-5% candles only). The
                        # SELECTIVITY belongs to the trend/line-break/pullback gates that follow, not
                        # to making the momentum candle itself freakishly rare.
_MIN_BODY_FRAC  = 0.50  # GATE: body >= this share of the candle's OWN range. 75%->60% (2026-07-21),
                        # then 60%->50% (2026-07-25) CALIBRATED on 22 of the user's own trades: his
                        # thinnest real momentum candle was 51% body (a 14.6p body in a 28.5p range
                        # that went on to hit TP). The 60% gate was rejecting 3 of those 22 outright.
                        # 50% is the measured floor, not a guess; the SHAPE above it is GRADED
                        # (momentum_grade), so a thin-but-valid candle still scores lower.
_MIN_VS_PREV    = 1.0   # GATE: body must be BIGGER THAN THE PREVIOUS CANDLE'S body — the user's own
                        # stated theory, and it holds in 22/22 of his real trades (median 2.96x, min
                        # 1.06x; robust at every timezone offset tested). This test USED to exist, was
                        # removed in the 2026-07-20 rebuild in favour of the 100-bar median, and the
                        # removal was wrong: measured over 41,900 H1 bars, 596 of the 4,980 candles
                        # that pass the other three gates (12.0%) FAIL this one — i.e. it strips 12%
                        # of the scanner's output at ZERO cost to the real setups. It is a COMPANION
                        # to the median test, never a replacement: alone it admits tiny candles that
                        # merely beat a tinier neighbour, which is why the median rule exists too.
_A_BODY_FRAC    = 0.75  # A-grade body: >= 75% of range  (the "perfect" wickless look)
_A_CWICK_FRAC   = 0.15  # A-grade counter-wick: <= 15%   (a "perfect" wick)
_A_CONF         = 0.85  # confidence assigned to an A-grade (perfect) momentum candle
                        # "SHORT WICKS" MEANS THE COUNTER-WICK — settled 2026-07-26 by his own trade.
                        # A symmetric cap (each wick <= 10%) was shipped on his instruction "trade only
                        # when the first momentum candle has no wicks or very short wicks; don't use the
                        # wick rule you created for this". His FIRST walked-through setup then killed it:
                        # GBP/USD 2021-07-06 13:00 UTC, a 25.2p / 5.48x-median / 70%-body BEAR he traded
                        # to +2.28R — upper (counter) wick 2.7p = 7.5%, lower (with-move) wick 8.2p =
                        # 22.7%. He called it himself: "the 1HR first candle is not a perfect one but i
                        # loved the momentum." The symmetric cap REJECTED it; the asymmetric one admits
                        # it. Both statements are satisfied at once because the wick he means by "very
                        # short" IS the counter-wick (7.5% here — genuinely very short); the with-move
                        # wick is the move overshooting and settling back, which is not rejection.
                        # The near-wickless look he describes is still rewarded — as a GRADE, not a gate
                        # (momentum_grade: A needs body >= 75% AND counter-wick <= 15%).
_MAX_CWICK_FRAC = 0.25  # wick AGAINST the move, as a share of range. Raised 15%->25% (user 2026-07-21):
                        # real volume candles get bought/sold back a little — a strict 15% demanded an
                        # almost-wickless marubozu and threw away genuine momentum. Live proof: GBP/USD
                        # 20-Jul 18:00 was a 21-pip, 3.62x-median, 81%-body BEAR that VIX.1 rejected
                        # ONLY because its counter-wick was 19%. 25% admits it.
_LONG_BARS      = 2000  # ~4 months of H1 (bars, not calendar days). The SECOND size test's yardstick.
                        # WHY 2000 AND NOT 3000: the fetch asks for a WINDOW of (count+10) hours, but
                        # H1 bars only exist while the market is open — 120 bars a week, not 168. A
                        # request for 3000 spans 125 calendar days and delivers only ~2150 real bars.
                        # 2000 is therefore what can be RELIED ON to arrive; asking the median for
                        # 3000 and silently getting 2150 would measure a different window than the
                        # multiplier below was calibrated on, and nothing would say so.
_LONG_MIN_BARS  = 1800  # below this we cannot say what 4 months looks like — the test then SKIPS
                        # rather than rejects (see long_baseline). The median is flat across
                        # 1800-2150 bars (GBP/USD 5.20-5.30p), so delivery wobble cannot move it.
_LONG_BODY_MULT = 2.12  # body >= this x the MEDIAN body of the last 2000 bars, ON TOP of the 100-bar
                        # test above. WHY IT EXISTS: the 100-bar yardstick is only ~4 trading days, and
                        # four quiet days collapse it. GBP/USD 10-Aug 09:00 UTC — the median body had
                        # fallen to 2.9 pips, so 2.5x asked for just 7.25, and a 7.5-pip nothing candle
                        # qualified and fired a signal the user caught. Measured over 4 years: the
                        # 100-bar requirement drops as low as 7.4 pips, the 3000-bar one never below 10.5.
                        #
                        # WHERE 2.12 COMES FROM — his own standard, not a number I chose. He named two
                        # GBP/USD candles as the minimum he would trade (06-Aug 14:00 and 15:00 UTC,
                        # bodies 11.3p and 12.4p) and said "the body that size or bigger but not smaller".
                        # 11.0 / (2000-bar median 5.20) = x2.12 on GBP/USD; the equally-rare EUR/USD
                        # body (8.4p) / 3.95 = x2.13. The SAME multiple on both pairs to within 0.01,
                        # so ONE number serves both — and it satisfies his settled rule "nothing
                        # hardcoded where the market can say it" (vix1.md), which a flat 11-pip floor
                        # would have broken.
                        #
                        # Today it asks ~11.0p on GBP/USD and ~8.4p on EUR/USD — his standard exactly.
                        # It is the stricter of the two tests only 14-16% of the time (the dead
                        # patches), so ~85% of the time nothing changes; it costs ~1.7 momentum
                        # candles/month/pair. Over 4 years it moved between 8.7 and 23.5 pips on its
                        # own, so it never needs re-tuning as volatility regimes change.
_LONG_EPS       = 1e-6  # pip tolerance. His own 11.3p candle computes as 11.30000000000075 and clears
                        # 11.3 by 7.5e-13 — luck, not safety. A different price pair lands microscopically
                        # BELOW and the rule built from his candles would reject his candles. Far smaller
                        # than a tenth of a pip, so it can never admit anything real.
_MIN_RUN        = 1     # see the docstring — the market gives runs of one
LOOKBACK       = 12    # recent 1HR bars scanned for the candle (an established trend's impulse can
                        # be several bars old while the fresh 1M entry is still forming).
                        # PUBLIC on purpose: vix1.candle_counts DERIVES the M1 request size from it,
                        # so the 1M window always spans the oldest candle this can return. Those two
                        # numbers drifted apart twice (see fix log ef6ff8b) and the entry then judged
                        # a setup on a window that started hours after its own line was drawn.


def baseline_body(h1: list[Candle], i: int) -> float:
    """The MEDIAN body of the closed bars before `i` — what a normal candle is for this pair now."""
    window = h1[max(0, i - _BASELINE_BARS):i]
    if len(window) < _MIN_BASELINE:
        return 0.0
    return median([body_size(c) for c in window])


def counter_wick(c: Candle, bullish: bool) -> float:
    """The wick AGAINST the move — the rejection one. Upper on a bull candle, lower on a bear."""
    return upper_wick(c) if bullish else lower_wick(c)


def long_baseline(h1: list[Candle], i: int) -> float:
    """The MEDIAN body over ~4 months — the yardstick that a quiet week cannot collapse.

    Returns 0.0 when there is not enough history to say, and the caller then SKIPS this test rather
    than failing it: a strategy that goes silent because its window is short would be a worse bug
    than the one this exists to fix. In production `vix1.candle_counts[TF.H1]` requests 3000, which
    delivers ~2150 real bars (weekends are not bars) — comfortably above _LONG_MIN_BARS.
    """
    window = h1[max(0, i - _LONG_BARS):i]
    if len(window) < _LONG_MIN_BARS:
        return 0.0
    return median([body_size(c) for c in window])


def long_requirement(h1: list[Candle], i: int, symbol: str) -> float:
    """What the 6-month test demands of this candle, in PIPS. 0.0 = not enough history to ask."""
    base = long_baseline(h1, i)
    pip = pip_size(symbol)
    if base <= 0 or pip <= 0:
        return 0.0
    return _LONG_BODY_MULT * base / pip


def is_momentum_candle(h1: list[Candle], i: int, bullish: bool, symbol: str) -> bool:
    """BIG for this pair right now + BIG FOR THE LAST SIX MONTHS + BIGGER THAN THE ONE BEFORE IT
    + CLEAN + UNREJECTED. The wick WITH the move is not capped (a 48% with-wick appears in the
    user's real winners).

    `symbol` is REQUIRED, not defaulted: the long-window test converts pips to a price and needs the
    pair. `pip_size("")` happens to return the right value for EUR/USD and GBP/USD and would be
    SILENTLY wrong for a yen pair, so a caller that forgets must fail loudly instead.
    """
    c = h1[i]
    if is_bullish(c) != bullish:
        return False
    rng  = full_range(c)
    base = baseline_body(h1, i)
    if rng <= 0 or base <= 0:
        return False
    need = long_requirement(h1, i, symbol)
    if need > 0 and body_size(c) / pip_size(symbol) < need - _LONG_EPS:
        return False
    prev = body_size(h1[i - 1]) if i > 0 else 0.0
    return (body_size(c) >= _MIN_BODY_MULT * base
            and body_size(c) > _MIN_VS_PREV * prev          # the user's own rule — 22/22 of his trades
            and body_size(c) >= _MIN_BODY_FRAC * rng
            and counter_wick(c, bullish) <= _MAX_CWICK_FRAC * rng)


def momentum_grade(c: Candle, bullish: bool) -> tuple[str, float]:
    """Grade a momentum candle by SHAPE (body-fraction + counter-wick) -> (letter, confidence).

    User 2026-07-21: "candle with perfect wicks and 75% body = A; wicks up to 25% and body down to 60% =
    graded 74% down to 60%." So:
      A  — body >= 75% of range AND counter-wick <= 15% (a clean, near-wickless candle) -> conf 0.85.
      B/C — anything weaker, down to the gate (body 60% / wick 25%): confidence scales from 0.74 (best
            non-A) to 0.60 (worst). The WEAKER of the two dimensions sets the grade, so one bad axis is
            not hidden by a good one. Only reached for a candle that already PASSED is_momentum_candle.
    """
    rng = full_range(c)
    if rng <= 0:
        return ("C", 0.60)
    bf = body_size(c) / rng
    cw = counter_wick(c, bullish) / rng
    # 1e-9 epsilon: a candle sitting EXACTLY on the A boundary must grade A — float division off
    # 5-decimal prices can land a true 75.000% body at 0.74999999…, silently demoting it.
    if bf >= _A_BODY_FRAC - 1e-9 and cw <= _A_CWICK_FRAC + 1e-9:
        return ("A", _A_CONF)
    body_q = min(max((bf - _MIN_BODY_FRAC) / (_A_BODY_FRAC - _MIN_BODY_FRAC), 0.0), 1.0)
    wick_q = min(max((_MAX_CWICK_FRAC - cw) / (_MAX_CWICK_FRAC - _A_CWICK_FRAC), 0.0), 1.0)
    conf   = round(0.60 + min(body_q, wick_q) * (0.74 - 0.60), 3)   # 0.60 .. 0.74
    return ("B" if conf >= 0.68 else "C", conf)


def momentum_run(h1: list[Candle], bullish: bool, symbol: str) -> tuple[int, int] | None:
    """
    Most recent run of consecutive momentum candles. Returns (first_idx, run_len) or None.
    Each candle qualifies ON ITS OWN MERIT against the baseline — NOT against the one before it. The
    old rule required every candle in a run to beat its predecessor, i.e. continuously GROWING
    bodies; inside real vertical legs that holds only ~50% of the time (median ratio 1.00x), so a
    4-candle leg needed four coin-flips in a row and 91% of runs came out length 1 by construction.
    """
    start = max(1, len(h1) - LOOKBACK)
    for i in range(len(h1) - 1, start - 1, -1):
        if not is_momentum_candle(h1, i, bullish, symbol):
            continue
        run, first = 1, i
        j = i - 1
        while j >= 1 and is_momentum_candle(h1, j, bullish, symbol):
            run  += 1
            first = j
            j    -= 1
        if run >= _MIN_RUN:
            return first, run
    return None


def veto_reason(h1: list[Candle], bullish: bool, symbol: str) -> str:
    """Why the recent bars produced no momentum candle — for diagnostics only.

    The long-window gate is counted SEPARATELY from the 100-bar one. Folding them together would have
    made the 10-Aug defect invisible in the logs: the candle passed the short test and was only ever
    going to be stopped by the long one, and a single "too small" tally cannot say which.
    """
    start = max(1, len(h1) - LOOKBACK)
    in_dir = too_small = under_long = not_bigger = wrong_shape = 0
    pip = pip_size(symbol)
    for i in range(len(h1) - 1, start - 1, -1):
        c = h1[i]
        if is_bullish(c) != bullish:
            continue
        in_dir += 1
        rng, base = full_range(c), baseline_body(h1, i)
        prev = body_size(h1[i - 1]) if i > 0 else 0.0
        need = long_requirement(h1, i, symbol)
        if base > 0 and body_size(c) < _MIN_BODY_MULT * base:
            too_small += 1
        elif need > 0 and pip > 0 and body_size(c) / pip < need - _LONG_EPS:
            under_long += 1
        elif body_size(c) <= _MIN_VS_PREV * prev:
            not_bigger += 1
        elif rng > 0 and (body_size(c) < _MIN_BODY_FRAC * rng
                          or counter_wick(c, bullish) > _MAX_CWICK_FRAC * rng):
            wrong_shape += 1
    if in_dir == 0:
        return f"no in-direction ({'up' if bullish else 'down'}) H1 candle in the last {LOOKBACK} bars"
    long_now = long_requirement(h1, len(h1) - 1, symbol)
    return (f"{in_dir} in-direction bars but none was a momentum candle "
            f"(too small x{too_small}, under the 6-month floor x{under_long}, "
            f"not bigger than the previous candle x{not_bigger}, "
            f"wicky/shape x{wrong_shape} — needs body >= "
            f"{_MIN_BODY_MULT:.1f}x the {_BASELINE_BARS}-bar median body, "
            f">= {long_now:.1f} pips ({_LONG_BODY_MULT:.2f}x the {_LONG_BARS}-bar median), "
            f"> the previous candle's "
            f"body, >= {_MIN_BODY_FRAC:.0%} of its own range, counter-wick <= {_MAX_CWICK_FRAC:.0%})")
