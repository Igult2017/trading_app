"""
VIX.1 — THE CHANGE-OF-CHARACTER ROUTE. The one place a pullback is not asked for.

HIS RULE, settled 2026-08-15 over three corrections, quoted so it cannot drift:

    "When the break happens, we only trade if the candle is a momentum candle so we mark its close
     and take a trade. However, if the break is not a momentum candle or arising from a choppy or a
     ranging market we don't trade."

    "the momentum candle might not be the one that caused the structure change, meaning we might not
     have a pullback due to high volume, so when we find a momentum candle in that event even if
     there is no pullback we take a trade."

    "A CHOCH can occur and then we end up with no volume or momentum, so a CHOCH is not a
     qualification for momentum — we are only trading if or when momentum develops in it along the
     way. So after the breakout has happened for a while we can start using the pullback rule."

WHY THIS EXISTS. The normal route (`vix1_bias`) refuses at the exact moment he wants to trade, twice
over. Replayed on his own chart — EUR/USD 28 Jul 2026, real cTrader bars:

    17:00 chart  the 13.6-pip 89%-body candle closes through 1.13732   -> "trend is changing"  REFUSED
    18:00-19:00  still changing                                        -> REFUSED
    20:00-05:00  trend now UP, candle recognised                       -> "the leg says pullback" x10h
    06:00        the candle is older than LOOKBACK                     -> gone

Removing either refusal alone changes nothing, which is why this is a route and not a patch.

WHERE THE WINDOW ENDS, AND WHY IT NEEDS NO TUNED NUMBER. His own definition closes it:

    "a pullback ends when CHOCH begins. So until a move is considered CHOCH it is still a pullback
     no matter how deep."

    "the exemption ends when we have the first pullback after CHOCH so that we dont trade in
     pullbacks again."

So the window runs from the break to the FIRST PULLBACK after it — and a pullback is only knowable
once its turning point is CONFIRMED, so that is the test: a confirmed swing AGAINST the new direction
sitting after the break bar. Both edges come from his own rules; nothing here is calibrated.

    MEASURED: 12 months, both pairs, this ends the window on exactly the same bar as waiting for the
    new direction to CONFIRM — 0 setups and 0 open-hours differ. That is not a coincidence worth
    relying on, and it is why the test is written out rather than left implicit: after an up-turn
    price has just closed ABOVE the old lower high, so the first confirmed high after the break is
    almost always a HIGHER high — which is itself what confirms the trend. The two collapse together
    TODAY. Change `vix1_trend`'s confirm rule and they would come apart silently, with this route
    quietly trading pullbacks again — the exact thing he asked to prevent.

The span is a median 4h (EUR/USD) / 5h (GBP/USD), 97% of episodes inside 24h. His own chart was 3h.

    KNOWN TAIL, reported to him before this shipped: 2% of EUR/USD episodes stay unconfirmed past
    72h, the worst 104h, and the exemption stays open that whole time. He was asked and chose NO CAP
    rather than a number he had not given. Do not add one without him.

THIS IS A REVERSAL ENTRY, and that re-opens "only trade pro trend" (2026-07-25/26). Deliberate, his
call, made with the frequency in front of him: 29 episodes on EUR/USD and 15 on GBP/USD over 12
months — 2.4 and 1.2 a month. His two filters (momentum required, not out of chop/range) refuse
roughly two-thirds of all changes of character.

NOTHING IS RE-DETECTED HERE. The break, its price and its bar come from `vix1_trend.TrendState`; the
candle from `vix1_momentum`; the market kind from `vix1_regime`. This file only asks the questions.
"""
from core.types import Candle
from shared.candle_math import atr
from strategies import vix1_regime
from strategies.vix1_momentum import momentum_run
from strategies.vix1_state import Bias, market_state
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import TrendState

# Bars of history required BEFORE the break to judge what kind of market it came out of. Below this
# the regime cannot be read and we refuse rather than guess: "we don't know" and "it was trending"
# are opposite answers, and only one of them may trade.
_MIN_BEFORE = 60

ORIGIN = "choch"


def choch_entry(window: list[Candle], h1: list[Candle], tstate: TrendState,
                turns, n: int, symbol: str) -> tuple[Bias | None, str]:
    """His change-of-character route. Returns (Bias or None, the reason either way).

    `window` is the trend window (the tail of `h1`); `tstate` and `turns` were already computed from
    it by the caller, so nothing here re-reads structure. The reason is returned rather than logged
    so the caller keeps one log line per scan.
    """
    # 1. A TURN IS PROPOSED AND NOT YET CONFIRMED. Outside this span there is no exemption to grant:
    #    before it there is no break, after it the normal route owns the decision.
    if tstate.pending == 0 or tstate.choch_index is None:
        return None, "no change of character is pending"

    bullish = tstate.pending == 1
    way = "up" if bullish else "down"
    ci = tstate.choch_index                      # indexes into `window`
    broke = tstate.choch_price

    # 1b. THE FIRST PULLBACK AFTER THE BREAK CLOSES THE WINDOW — his refinement, 2026-08-15:
    #     "the exemption ends when we have the first pullback after CHOCH so that we dont trade in
    #      pullbacks again."
    #
    #     After an UP-turn a pullback is a move down, which begins at a HIGH; mirrored for a
    #     down-turn. So the counter-swing to look for is one whose `is_high` MATCHES `bullish`.
    #     Only CONFIRMED turns are considered — an unconfirmed one is not knowable in real time, and
    #     `structure_turns` returns only confirmed ones by construction.
    if any(p.is_high == bullish and p.index > ci for p in turns):
        return None, (f"change of character {way} at {broke:.5f}, but its first pullback has already "
                      f"begun — from here the pullback rule applies again")

    # 2. MOMENTUM MUST HAVE DEVELOPED THE NEW WAY — "a CHOCH is not a qualification for momentum".
    run = momentum_run(h1, bullish, symbol)
    if run is None:
        return None, (f"change of character {way} at {broke:.5f}, but no momentum candle that way "
                      f"yet — a break on its own is not a trade")

    #    ...AND IT MUST NOT PREDATE THE BREAK. A big candle from before the turn is evidence for the
    #    OLD direction; reading it as confirmation of the new one would trade the move that was just
    #    reversed. `choch_index` is a window index, so lift it into h1 before comparing.
    choch_h1 = ci + (len(h1) - len(window))
    if run[0] < choch_h1:
        return None, (f"change of character {way} at {broke:.5f}, but the freshest {way} momentum "
                      f"candle predates the break — it belongs to the old move")

    # 3. IT MUST NOT HAVE COME OUT OF CHOP OR A RANGE — his answer (a), verbatim: "if the break is
    #    not a momentum candle or arising from a choppy or a ranging market we don't trade". Read on
    #    the bars BEFORE the break, because the question is what the market was doing when it turned,
    #    not what this candle has just made it look like.
    before = window[:ci]
    if len(before) < _MIN_BEFORE:
        return None, (f"change of character {way} at {broke:.5f}, but too little history before it "
                      f"to say what kind of market it came out of")
    regime = vix1_regime.classify(structure_turns(before, n), atr(before, 14))
    if regime.kind != vix1_regime.TREND:
        return None, (f"change of character {way} at {broke:.5f}, but it came out of a "
                      f"{regime.kind.upper()} market — {regime.why}")

    # 4. ALL FOUR HOLD. No pullback is asked for and the confirmation wait is skipped — that is the
    #    whole point of the route, not an oversight: "the no pullback rule in the beginning...
    #    was meant to prevent blocking of good trades at the beginning of a CHOCH."
    ret, eff, _ = market_state(window, tstate, symbol)
    reason = (f"change of character {way}: price closed through {broke:.5f} and a momentum candle "
              f"followed it out of a trending market — traded without waiting for a pullback, which "
              f"applies again once the {way}trend confirms")
    return Bias(bullish, run[0], ORIGIN, run[1], reason, ret, eff, regime), reason
