"""VIX.1 — THE LIQUIDITY VOID: do not trade into a move while price is still filling it.

HIS RULE, 2026-09-20, quoted so it cannot drift:

    "That long bearish candle that dropped the price to where we took the trade is called liquidity
     void. In most cases, the price goes back to fill it before proceeding. So, can we have a logic
     that lets the price move 2 candles one closing on top of each other with direction before we
     consider taking trades in the direction of that long candle? However, if the price starts
     moving to fill it, we wait until the price finishes filling it and then starts moving in its
     direction."

WHAT THE TWO CANDLES ARE FOR — his words, 2026-09-21, after I had misread them as a general candle
rule and patched them against an older one:

    "The two candle rule is for liquidity void setups. By design it is meant to enable VIX to take
     confirmed directions. For instance, where price moves without filling the void, two directional
     and decisive candles make us know that the price is moving and not going back to fill the void.
     Similarly in the case of filling the void, two decisive candles show that the turn for filling
     the void is over and the price is now moving toward the direction of the candle that created
     the void. Don't confuse it with the candle rules that existed before."

SO THIS CHANGES NOTHING ABOUT HOW A TRADE IS TAKEN. It answers one question — may VIX.1 take the
trade it is already about to take, right now — and returns a reason when the answer is no. It never
opens a trade, never moves an entry, a stop or a target, and never touches the 1-minute trigger.

⚠ A VOID IS A BAND OF PRICE, NOT A CANDLE. The first build of this module measured ONE CANDLE'S BODY
and got 47% of its voids wrong on his own fills, called the very candle being traded a "void" 23% of
the time, and could report a fill of 378%. Every reference and every open-source implementation
measures the WIDTH OF AN UNTRADED BAND instead, and so does this one now:

    the band     merged three-candle gaps (`shared.zone_detection.find_fvg_zones`), consecutive ones
                 joined into one zone, top = the highest, bottom = the lowest. That merge is the
                 standard `join_consecutive` mechanic, and it is what makes a void span candles.
    the size     HIS bar: the candles making it are *"more than twice bigger than the momentum
                 candle"*, so more than 2 x 2.5 = 5x the 100-bar median body. Checked against the
                 standard rather than guessed — the literature calls a displacement candle two to
                 three times the average body, which is what VIX.1's momentum candle ALREADY is.
    the fill     measured against the band, so it is bounded at 0-100% by construction.

BECAUSE A REAL VOID IS RARE, THIS MODULE IS SILENT ALMOST ALL THE TIME. That is the point: the old
one spoke on every trade, which is how a void rule turned into a general refusal.

WHAT SET IT OFF. His EUR/USD sell of 17 Sep 19:06 was taken while price was on its way back into the
void left by the 67.5-pip drop of 16 Sep 18:00 UTC — 33% of the way back in, with no momentum candle
that way since. His words: *"looking at it, nothing qualified."* Replayed on real broker bars in
`test_void_gate.py`: that sell and three others across 17 Sep are refused, and his 18 Sep winner is
allowed the moment two momentum candles print.
"""
from dataclasses import dataclass

from core.types import Candle, ZoneType
from shared.candle_math import atr, body_size
from shared.zone_detection import find_fvg_zones
from strategies import vix1_momentum
from strategies.vix1_momentum import _MIN_BODY_MULT, baseline_body

LOOK = 48         # hours to look back for the void that made this leg
VOID_MULT = 2.0   # HIS bar: a void's candles are more than TWICE a momentum candle
# AND THE BAND ITSELF MUST BE WIDE ENOUGH TO BE A ZONE. His rule sizes the CANDLES; it does not stop
# a big candle leaving a hairline gap. On his own 28 May chart that let a 1.5-pip band through at
# 03:00 and call it a void. This is the standard's own filter, not one invented here: the open-source
# detectors size the GAP against ATR — `minGapSize := ta.atr(14)` in sonnyparlin/fvg_pinescript, and
# a width-versus-ATR threshold in LuxAlgo's Liquidity Voids. ⚠ FLAGGED TO HIM: his rule did not name
# this, so it is the documented standard filling a gap his words left, and one line to change.
BAND_ATR = 1.0

# MAY THE VOID BREAK RE-OPEN THE CHANGE-OF-CHARACTER SHORTCUT? — OFF. He granted it on 2026-09-20
# (*"you switch it on only for the liquidity void case not all"*), it was built, and measuring it
# found it did not do that: it shipped dead (it read a level `vix1_trend.py:412` empties on the line
# that proposes a turn), and once alive it fired on almost every reversal. `OPEN.md` B31.
_BRANCH_C = False


@dataclass(frozen=True)
class Void:
    """The band of price a fast move crossed with almost no trading inside it."""
    bullish: bool                 # the direction the move went
    top: float
    bottom: float
    start: int                    # h1 index of the first gap in the band
    end: int                      # h1 index of the last one
    time: int = 0                 # when the move began
    pips: float = 0.0             # how tall the band is


@dataclass(frozen=True)
class VoidState:
    """Where the void stands right now. `kind` is one of:

    no-void         no qualifying band in this direction -> nothing to say (the common case)
    not-filled-yet  price has not come back into the band -> his two candles first
    filling         price is inside the band and has not resumed -> NO TRADE
    filled          price reached the band's origin -> his two candles before trading it again
    resumed         two momentum candles since the deepest point -> trade allowed
    broken          price closed through the protected level while filling (branch C, switched off)
    """
    kind: str
    deepest: float = 0.0          # how far back into the band price came, 0-1 of its height
    void_time: int = 0
    void_pips: float = 0.0
    on_fill: bool = False

    @property
    def allows(self) -> bool:
        """Only a resumed move may be traded in the void's direction. A void we cannot see
        (`no-void`) allows too: a missing measurement is never a refusal."""
        return self.kind in ("resumed", "no-void")


def _big_enough(h1: list[Candle], j: int) -> bool:
    """HIS SIZE BAR, asked of ONE candle: is this body *"more than twice bigger than the momentum
    candle"*? A momentum candle is `_MIN_BODY_MULT` (2.5) x the 100-bar median body, so this is more
    than 5x it. Imported rather than copied, so if his 2.5 ever moves this moves with it, and the
    strict 2.5 is used rather than the 2.3 `qualifies_for_trade` allows — that margin is about
    letting a candle TRADE, which has nothing to do with how big a move must be to leave a void."""
    base = baseline_body(h1, j)
    return base > 0 and body_size(h1[j]) > VOID_MULT * _MIN_BODY_MULT * base


def _merge(h1: list[Candle], lo: int, hi: int) -> list[Void]:
    """Every band in `h1[lo:hi + 1]`, before the width test. Consecutive gaps the same way become one
    zone — the standard `join_consecutive` mechanic, and what makes a void span candles.

    ⚠ ONLY GAPS LEFT BY A VOID-SIZED CANDLE JOIN, and that bound is his word *"candles"*, plural:
    a void is made of them, so every candle in the band must clear his bar. Without it, merging runs
    away — on a smooth staircase every bar leaves a gap and they all chain, which on the hand-built
    fixture in `test_choch_bearish_proof.py` produced a 111.5-pip "void" out of a 60-pip candle.
    Real bars overlap enough to break the chain on their own, which is why it stayed hidden there.
    """
    seg = h1[lo: hi + 1]
    if len(seg) < 3:
        return []
    out: list[Void] = []
    for z in find_fvg_zones(seg):
        j = lo + z.formed_at                       # lift the gap's bar into h1
        if not _big_enough(h1, j):
            continue                               # an ordinary candle's gap is not a void
        bull = z.type == ZoneType.DEMAND           # a gap left BELOW price = the move went up
        if out and out[-1].bullish == bull and j == out[-1].end + 1:
            last = out[-1]
            out[-1] = Void(bull, max(last.top, z.top), min(last.bottom, z.bottom), last.start, j)
        else:
            out.append(Void(bull, z.top, z.bottom, j, j))
    return out


def _is_a_void(h1: list[Candle], v: Void) -> Void | None:
    """Is this band wide enough to be a zone? Its candles already cleared HIS size bar in `_merge`;
    this is the standard's own width filter on top — see `BAND_ATR`."""
    a = atr(h1[max(0, v.start - 20): v.start], 14)
    if a > 0 and (v.top - v.bottom) < BAND_ATR * a:
        return None                                # a hairline gap is not a zone
    pip = 0.1 if h1[v.start].high > 100 else 0.0001
    return Void(v.bullish, v.top, v.bottom, v.start, v.end, h1[v.start].time,
                (v.top - v.bottom) / pip)


def find_void(h1: list[Candle], i: int, bullish: bool, symbol: str,
              look: int = LOOK) -> Void | None:
    """The void this trade would be joining: the most recent qualifying band in the trade's own
    direction, inside the look-back. `None` means there is no void here — and then this module has
    nothing to say, which is the usual answer."""
    lo = max(0, i - look)
    for v in reversed(_merge(h1, lo, i)):
        if v.bullish != bullish:
            continue
        real = _is_a_void(h1, v)
        if real is not None:
            return real
    return None


def state(h1: list[Candle], i: int, bullish: bool, symbol: str,
          protected: float | None = None) -> VoidState:
    """Read the void at bar `i`. Never raises: anything unreadable comes back as `no-void`, which
    allows — this module may cost a trade on purpose, never by accident."""
    v = find_void(h1, i, bullish, symbol)
    if v is None or v.top <= v.bottom:
        return VoidState("no-void")
    height = v.top - v.bottom
    after = h1[v.end + 1: i + 1]
    if not after:
        return VoidState("not-filled-yet", 0.0, v.time, v.pips)

    # HOW FAR BACK IN HAS PRICE COME? Measured against the band, so it cannot exceed 100%. A move up
    # is filled from ABOVE its band, a move down from BELOW it.
    fills, deepest, deep_k = [], 0.0, 0
    for k, x in enumerate(after):
        back = (v.top - x.low) / height if bullish else (x.high - v.bottom) / height
        back = max(0.0, min(1.0, back))
        fills.append(back)
        if back > deepest:
            deepest, deep_k = back, k

    # BROKEN — branch C's question, asked first when it is switched on. See `_BRANCH_C`.
    if protected is not None and _BRANCH_C:
        for k, x in enumerate(after):
            if (x.close > protected) if not bullish else (x.close < protected):
                return VoidState("broken", deepest, v.time, v.pips, fills[k] > 0.0)

    # HAS IT RESUMED? Two momentum candles since the deepest point, the second closing beyond the
    # first — his *"2 candles one closing on top of each other with direction"*, where "momentum" is
    # the strategy's own test, so *"decisive"* needs no new rule of its own.
    first = None
    for off in range(deep_k + 1, len(after)):
        j = v.end + 1 + off
        if not vix1_momentum.is_momentum_candle(h1, j, bullish, symbol):
            continue
        x = h1[j]
        if first is None:
            first = x
            continue
        if (x.close > first.close) if bullish else (x.close < first.close):
            return VoidState("resumed", deepest, v.time, v.pips)
        first = x

    if deepest >= 1.0:
        return VoidState("filled", deepest, v.time, v.pips)
    if deepest > 0.0:
        return VoidState("filling", deepest, v.time, v.pips)
    return VoidState("not-filled-yet", deepest, v.time, v.pips)


def break_of_a_fill(h1: list[Candle], turning_up: bool, broken_level: float | None,
                    symbol: str) -> bool:
    """Is the pending turn the break of a void price was filling? HIS BRANCH C — SWITCHED OFF.

    Kept working, not deleted, so restoring it is one line once the question it got wrong is settled
    (`OPEN.md` B31). `broken_level` is `TrendState.choch_price`, NEVER `protected`: `vix1_trend.py`
    empties `protected` on the line that proposes a turn, which is what made the first build dead.
    """
    if not _BRANCH_C or not h1 or broken_level is None:
        return False
    st = state(h1, len(h1) - 1, not turning_up, symbol, broken_level)
    return st.kind == "broken" and st.on_fill


def not_filling(h1: list[Candle], protected: float | None, bullish: bool,
                symbol: str) -> str | None:
    """The veto: a reason to refuse, or None to allow. Same shape as the gates it joins in
    `vix1_bias`, and it only ever refuses — it cannot turn a refusal into a trade."""
    if not h1:
        return None
    st = state(h1, len(h1) - 1, bullish, symbol, protected)
    if st.allows:
        return None
    from datetime import datetime, timezone
    when = datetime.fromtimestamp(st.void_time, timezone.utc).strftime("%d %b %H:%M UTC")
    if st.kind == "filling":
        return (f"price is {st.deepest:.0%} of the way back into the {st.void_pips:.1f}-pip void of "
                f"{when} and has not resumed — his rule waits for the fill to finish and then two "
                f"momentum candles")
    if st.kind == "filled":
        return (f"the {st.void_pips:.1f}-pip void of {when} has been filled and price has not turned "
                f"back its way yet — his rule wants two momentum candles first")
    if st.kind == "broken":
        return (f"the protected level broke while price was filling the {st.void_pips:.1f}-pip void "
                f"of {when} — that move is done; this direction is not traded off it")
    return (f"the {st.void_pips:.1f}-pip void of {when} has not been confirmed by two momentum "
            f"candles yet — price has not come back into it")
