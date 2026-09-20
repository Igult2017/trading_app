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
    C  the PROTECTED level broke WHILE price was filling                23% / 23%
       (a further 21% / 20% broke it without price coming back at all — not his case. An earlier
        count of "44% / 42%" for C left the fill condition out and is wrong; see `OPEN.md` B31.)

THE ORDER OF THE QUESTIONS IS HIS, AND IT IS LOAD-BEARING. On his 28 May chart (`Desktop\Void 2.png`)
the two momentum candles appear with both closes ABOVE the void, after price had already reversed
through it. Asked "has it resumed?" first, the rule sells the bottom of the turn. So: BROKEN first,
then FILLING, then RESUMED.

WHY 50% IS "STARTED FILLING", measured rather than chosen: price comes back half the candle's body
before extending a full body 69% of the time on EUR/USD and 68% on GBP/USD, median one hour — while a
COMPLETE fill is a coin flip (51% / 50%). Independent research on liquidity voids says the same: the
midpoint is the reactive level inside one.

WHAT IT COSTS, measured as shipped with his scope applied — 190 real fills, entry and stop unchanged
(`tools/vix1_void_scoped.py`): allows 77 trades worth -8.7R, refuses 113 worth -22.2R; the year goes
-30.9R -> -8.7R. It throws away 15 winners worth +26.8R and cuts the number of trades by 59%. It
stops the bleeding; it does NOT make VIX.1 profitable, and nothing here should be read as saying so.

BRANCH C IS SWITCHED OFF — see `_BRANCH_C` below and `OPEN.md` B31. What he asked for there already
exists in `vix1_choch` from his own words of 2026-08-15; this module only ever marks the void dead
and stops blocking. A second change-of-character would be the "two logics for one question" he has
ruled against twice.
"""
from dataclasses import dataclass

from core.types import Candle
from shared.candle_math import body_size
from strategies import vix1_momentum

LOOK = 48         # hours to look back for the long candle that made the leg
FILL_ON = 0.50    # how much of its body counts as "started filling" — measured, see above

# MAY THE VOID BREAK RE-OPEN THE CHANGE-OF-CHARACTER SHORTCUT? — OFF. He granted it on 2026-09-20
# (*"you switch it on only for the liquidity void case not all"*), it was built, and measuring it
# found it does not do that. The evidence is in `OPEN.md` B31 in full; in one line each:
#
#   1. it shipped DEAD — both callers read `protected`, which `vix1_trend.py:412` empties on the
#      line that proposes a turn (0 of 848 pending turns over 12 months could reach it);
#   2. alive, it fires on almost every reversal — 103 of 103 entries it opens had price already
#      100-1000% past a median 19-25 pip "void";
#   3. it cannot reproduce his own image 2 (EUR/USD 28 May 2026): there is no pending turn there to
#      exempt, because the level that started the trend was taken back (his rule of 2026-09-16).
#
# SWITCHED OFF, NOT DELETED, and `test_void_gate.py` keeps it honest — the fault is the anchor
# (which candle is "the void"), not the plumbing. His branches A and B are unaffected and stay ON.
_BRANCH_C = False


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
    # WAS PRICE FILLING WHEN THE LEVEL BROKE? His branch C is *"IN THE PROCESS OF THE PRICE FILLING
    # IT, if the price breaks its protected area"* — the fill is half the condition, and without it
    # the test counts every ordinary reversal. Measured over 12 months: requiring it takes the case
    # from 44% of long candles to 23% on both pairs; the other 21% broke the level without price
    # ever coming back, which is not what he described.
    on_fill: bool = False

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

    # 1. BROKEN — asked FIRST, see the note at the top of this file. `fills[k]` is how far back into
    #    the void price had come AT THE BREAKING BAR, which is what makes it his branch C rather than
    #    any old reversal; it rides on the state so `break_of_a_fill` can require it and the veto
    #    below can ignore it (a level broken without a fill still ends the move).
    if protected is not None:
        for k, x in enumerate(after):
            through = (x.close > protected) if not bullish else (x.close < protected)
            if through:
                return VoidState("broken", deepest, v.time, pips, fills[k] >= FILL_ON)

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


def proves_the_turn(h1: list[Candle], mc_idx: int, direction_since: int | None,
                    bullish: bool, symbol: str) -> bool:
    """Is this the FIRST momentum candle since the trend was established — the trade his proof
    sequence exists to take? If so, THIS MODULE HAS NOTHING TO SAY ABOUT IT.

    HIS RULING, 2026-09-21, when I put the clash to him as "one candle or two?":

        *"There is no one or two here. These are two different scenarios and treat each as I
         explained. For the scenario where I said one keep it one and for a scenario where I said 2
         keep it 2."*

    THE TWO SCENARIOS, in his own words, and which candle count belongs to each:

        ONE   the turn that has proved itself — *"price breaks down through the old higher low ->
              it runs down -> it pulls back up -> when that pullback turns back down, that's the
              proof -> then A MOMENTUM CANDLE down is the trade"* (2026-08-25, extended to a turn up
              on 2026-09-14). The pullback turning back IS the proof, read from structure.

        TWO   joining a move already under way — *"lets the price move 2 CANDLES one closing on top
              of each other with direction before we consider taking trades in the direction of
              that long candle"* (2026-09-20). There is no structural proof here, so the two candles
              are what stands in for it.

    So the question that separates them is not the direction or the shape: it is whether the trend
    has JUST TURNED AND PROVED IT, or was already running. The first momentum candle after the trend
    is established is his proof trade; every one after it is joining a move, and that is this
    module's business.

    WHY IT IS ASKED THIS WAY AND NOT WITH A TIME LIMIT: `direction_since` is the bar the trend was
    established on, which `vix1_trend` already records for the retracement tracker. Nothing is
    invented and no window is tuned — the scope ends at the second momentum candle, whenever that
    comes.

    MEASURED, because the clash is real and not theoretical: with no scope at all, this module
    refuses his own 2026-08-25 proof sell AND its mirror (`test_choch_bearish_proof.py`), calling
    the break candle a void that has not been confirmed by two candles — 36% deepest pullback, one
    momentum candle since. That is his ONE-candle scenario being judged by his TWO-candle rule.

    A TREND WITH NO RECORDED START KEEPS THE VETO. `direction_since` is None where the trend was not
    established on this window, and then we cannot tell which scenario this is. The proof trade is
    one candle per trend and joining a move is everything after it, so the common case wins.
    """
    if direction_since is None:
        return False
    return not any(vix1_momentum.is_momentum_candle(h1, j, bullish, symbol)
                   for j in range(max(0, direction_since), mc_idx))


def break_of_a_fill(h1: list[Candle], turning_up: bool, broken_level: float | None,
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

    ⚠ `broken_level` IS `TrendState.choch_price`, NOT `protected`. This shipped once reading
    `protected` and was DEAD: `vix1_trend.py:412` sets `protected = None` on the very line that
    proposes the turn, so the level is always empty at the only moment this is asked. Measured over
    12 months: 0 of 476 pending EUR/USD turns and 0 of 372 GBP/USD ones could ever reach the test.
    `choch_price` is set on the line above it and holds the level the break went through.

    AND THE FILL IS REQUIRED. Asking only "was the level broken" is near-vacuous here — a pending
    turn exists BECAUSE that level was closed through, so 89% (EUR/USD) / 93% (GBP/USD) of pending
    turns would be exempted, which is the shortcut switched back on for everything and the opposite
    of his ruling. With his own condition applied — price was at least halfway back into the void
    when the level broke — it is 23% of long candles on both pairs.
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
        return (f"price is {st.deepest:.0%} of the way back into the {st.void_pips:.1f}-pip move of "
                f"{when} and has not resumed — his rule waits for the fill to finish and then two "
                f"momentum candles")
    if st.kind == "broken":
        return (f"the protected level broke while price was filling the {st.void_pips:.1f}-pip move "
                f"of {when} — that move is done; this direction is not traded off it")
    return (f"the {st.void_pips:.1f}-pip move of {when} has not been confirmed by two momentum "
            f"candles yet (deepest pullback into it {st.deepest:.0%})")
