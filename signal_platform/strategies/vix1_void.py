"""VIX.1 — THE LIQUIDITY VOID: do not trade while price is filling the move that made the leg.

HIS RULE, 2026-09-20, quoted so it cannot drift:

    "That long bearish candle that dropped the price to where we took the trade is called liquidity
     void. In most cases, the price goes back to fill it before proceeding. So, can we have a logic
     that lets the price move 2 candles one closing on top of each other with direction before we
     consider taking trades in the direction of that long candle? However, if the price starts
     moving to fill it, we wait until the price finishes filling it and then starts moving in its
     direction. In the process of the price filling it, if the price breaks its protected area, we
     start considering CHOCH and a move on the other direction."

    "Who told you we change the entry? We already have the entry in 1M and we trade momentum
     candles. The purpose of this module is to avoid trading when the price is filling the void and
     start trading when the price starts coming back after 2 momentum candles."

SO THIS CHANGES NOTHING ABOUT HOW A TRADE IS TAKEN. It answers one question — may VIX.1 take the
trade it is already about to take, right now — and returns a reason when the answer is no. It never
opens a trade, never moves an entry, a stop or a target, and never touches the 1-minute trigger.

WHAT SET IT OFF. His EUR/USD sell of 17 Sep 19:06 was taken 40% of the way back INTO the void left by
the 67.5-pip drop of 16 Sep 21:00, with that high set two hours earlier and not one momentum candle
since. His words: *"looking at it, nothing qualified."*

THE THREE BRANCHES, and how often each happens — 937 EUR/USD and 920 GBP/USD voids, 12 months:

    A  never filled to the midpoint, just pulled back and continued      7% / 8%
    B  filled at least halfway, then resumed                            49% / 49%
    C  the PROTECTED level broke while filling                          44% / 42%

THE ORDER OF THE QUESTIONS IS HIS, AND IT IS LOAD-BEARING. On his 28 May chart (`Desktop\Void 2.png`)
the two momentum candles appear with both closes ABOVE the void, after price had already reversed
through it. Asked "has it resumed?" first, the rule sells the bottom of the turn. So: BROKEN first,
then FILLING, then RESUMED.

WHY 50% IS "STARTED FILLING", measured rather than chosen: price comes back half the candle's body
before extending a full body 69% of the time on EUR/USD and 68% on GBP/USD, median one hour — while a
COMPLETE fill is a coin flip (51% / 50%). Independent research on liquidity voids says the same: the
midpoint is the reactive level inside one.

WHAT IT COSTS, on 190 real fills with the entry and stop unchanged: it allows 56 trades worth -1.6R
and refuses 134 worth -29.3R. It throws away 18 winners including a +4.00R, and the win rate is the
same on both sides — it does not find better trades, it halves the LOSS rate, 45% -> 27%. It stops
the bleeding; it does not make VIX.1 profitable, and nothing here should be read as saying it does.

BRANCH C IS NOT BUILT HERE, DELIBERATELY. What he asked for — *"after the price has broken the
protected area by body with a candle that has momentum we draw the line and take a trade… if there
is no momentum candle, we wait until we get one"* — already exists in `vix1_choch`, quoted there from
his own words of 2026-08-15, and he switched it OFF on 2026-09-14 in favour of a proof requirement.
This module only marks the void dead and stops blocking; a second change-of-character would be the
"two logics for one question" he has ruled against twice.
"""
from dataclasses import dataclass

from core.types import Candle
from shared.candle_math import body_size
from strategies import vix1_momentum

LOOK = 48         # hours to look back for the long candle that made the leg
FILL_ON = 0.50    # how much of its body counts as "started filling" — measured, see above


@dataclass(frozen=True)
class VoidState:
    """Where the void stands right now. `kind` is one of:

    no-void        no momentum candle in this direction in the last LOOK hours -> nothing to say
    not-filled-yet the void is intact but the two momentum candles have not come -> not yet
    filling        price is coming back into it and has not resumed -> NO TRADE (his branch B)
    resumed        two momentum candles since the deepest point -> trade allowed (his A and B)
    broken         price closed through the protected level while filling -> the void is dead
    """
    kind: str
    deepest: float = 0.0          # how far back into the void price came, as a share of its body
    void_time: int = 0
    void_pips: float = 0.0

    @property
    def allows(self) -> bool:
        """Only a resumed move may be traded in the void's direction. A void we cannot see
        (`no-void`) allows too: a missing measurement is never a refusal."""
        return self.kind in ("resumed", "no-void")


def find_void(h1: list[Candle], i: int, bullish: bool, symbol: str, look: int = LOOK) -> int | None:
    """The long candle that made this leg: the BIGGEST momentum candle in the trade's direction in
    the last `look` hours — his *"that long bearish candle that dropped the price to where we took
    the trade"*.

    IT IS VIX.1'S OWN MOMENTUM TEST, not a new definition of "big". Searching for the biggest candle
    of any kind was tried and did not reproduce his own circle 2; anchoring to the candle the
    strategy already recognises does.
    """
    best, best_body = None, 0.0
    for j in range(max(0, i - look), i + 1):
        if not vix1_momentum.is_momentum_candle(h1, j, bullish, symbol):
            continue
        b = body_size(h1[j])
        if b > best_body:
            best, best_body = j, b
    return best


def state(h1: list[Candle], i: int, bullish: bool, symbol: str,
          protected: float | None = None) -> VoidState:
    """Read the void at bar `i`. Never raises: anything unreadable comes back as `no-void`, which
    allows — this module may cost a trade on purpose, never by accident."""
    vi = find_void(h1, i, bullish, symbol)
    if vi is None:
        return VoidState("no-void")
    v = h1[vi]
    body = abs(v.close - v.open)
    if body <= 0:
        return VoidState("no-void")
    pips = body / (0.1 if v.high > 100 else 0.0001)
    after = h1[vi + 1: i + 1]
    if not after:
        # The long candle IS the newest bar. His rule: two candles must come first.
        return VoidState("not-filled-yet", 0.0, v.time, pips)

    fills, deepest, deep_k = [], 0.0, 0
    for k, x in enumerate(after):
        back = ((x.high - v.close) / body) if not bullish else ((v.close - x.low) / body)
        fills.append(back)
        if back > deepest:
            deepest, deep_k = back, k

    # 1. BROKEN — asked FIRST, see the note at the top of this file.
    if protected is not None:
        for x in after:
            through = (x.close > protected) if not bullish else (x.close < protected)
            if through:
                return VoidState("broken", deepest, v.time, pips)

    # 2. HAS IT RESUMED? Two momentum candles since the deepest point, the second closing beyond the
    #    first — his *"2 candles one closing on top of each other with direction"*, where "momentum"
    #    is the strategy's own test, so his *"not mixed candles with no momentum"* needs no new rule.
    first = None
    for off in range(deep_k + 1, len(after)):
        j = vi + 1 + off
        if not vix1_momentum.is_momentum_candle(h1, j, bullish, symbol):
            continue
        x = h1[j]
        if first is None:
            first = x
            continue
        if (x.close > first.close) if bullish else (x.close < first.close):
            return VoidState("resumed", deepest, v.time, pips)
        first = x

    # 3. STILL FILLING, or simply not proved yet.
    if deepest >= FILL_ON:
        return VoidState("filling", deepest, v.time, pips)
    return VoidState("not-filled-yet", deepest, v.time, pips)


def break_of_a_fill(h1: list[Candle], turning_up: bool, protected: float | None,
                    symbol: str) -> bool:
    """Is the pending turn the break of a void that price was FILLING? His branch C.

    HIS RULING, 2026-09-20: *"you switch it on only for the liquidity void case not all. What I
    switched off last time remains switched off until I say switch it on."*

    So this is the ONE question that re-opens the change-of-character shortcut, and only here. The
    void is in the OPPOSITE direction to the turn — price was filling a move DOWN and broke upward
    through the level protecting that downtrend, which is his image 2 exactly.

    BOTH CALLERS ASK THIS SAME FUNCTION — the entry (`vix1_choch`) and the pre-close heads-up
    (`vix1_preclose`) — so the notification and the trade can never disagree about whether the
    exemption applies, which is the property `exempts` was built to have.
    """
    if not h1 or protected is None:
        return False
    return state(h1, len(h1) - 1, not turning_up, symbol, protected).kind == "broken"


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
        return (f"price is {st.deepest:.0%} of the way back into the {st.void_pips:.1f}-pip move of "
                f"{when} and has not resumed — his rule waits for the fill to finish and then two "
                f"momentum candles")
    if st.kind == "broken":
        return (f"the protected level broke while price was filling the {st.void_pips:.1f}-pip move "
                f"of {when} — that move is done; this direction is not traded off it")
    return (f"the {st.void_pips:.1f}-pip move of {when} has not been confirmed by two momentum "
            f"candles yet (deepest pullback into it {st.deepest:.0%})")
