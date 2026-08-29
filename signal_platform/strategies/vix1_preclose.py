"""VIX.1 — THE NOTIFICATION BEFORE THE MOMENTUM CANDLE CLOSES, AND THE ONE THAT CLOSES THE LOOP.

CALLED A NOTIFICATION, NOT A WARNING. His instruction, 2026-08-21: *"dont call it a warning, call it
a notification."* The word appears in what he reads, so it is the word used here too.

His words, 2026-08-19: *"Can we change it so that I receive a message that the momentum candle is
about to close so that I can be there when it closes? ... Being there exactly when the momentum
candle closes is the leverage I have."*

WHAT IT IS. Every other VIX.1 message is about a bar that has already CLOSED — which is why none of
them can reach him before the hour turns. This one reads the bar still FORMING and says *this one is
shaping up, be at the screen*. It carries no entry, stop or target, because none exist yet: the bias
is not confirmed until the candle closes. It is an alarm clock, and must never read as a signal.

THAT FORMING BAR DOES NOT COME FROM THE FEED, which serves closed bars only — it is rebuilt from M1
by `candle_aggregator.forming_bar` and appended by the runner (`wants_forming`). Before that existed
this module found `None` every time and had fired ZERO times in 30 days.

WHY T-5 AND NOT T-10 OR T-15. Measured on 145 days of real cTrader M1, rebuilding each H1 bar as it
stood with N minutes left and running THIS test on it, against the same test on the finished bar:

    lead    fired   correct        caught of all that formed
    T-5      244     80.3%  (EUR)   74.8%          246  76.0% (GBP)  69.3%
    T-10     210     69.5%  (EUR)   55.7%          237  69.6% (GBP)  61.1%
    T-15     178     64.0%  (EUR)   43.5%          196  64.3% (GBP)  46.7%

T-5 wins on BOTH axes at once, so there is no trade-off: earlier is not more notice, it is worse
notice. About 1.7 alerts per pair per day. (In production the rebuilt bar runs ~46s behind, making
this effectively T-6: 77.7% / 74.6%.) Do not move the lead without re-running that measurement.

FOUR IN FIVE, NOT FIVE IN FIVE — one in five gives the move back in the last minutes and closes as
something else. A property of the market, not a bug to tune out.

AND WHEN IT IS THAT ONE IN FIVE, HE IS NOW TOLD. His instruction, 2026-08-21: *"It does not report
back when the momentum candle fails to qualify. It should, then we start watching to another one if
it will come."* The notification fired and nothing watched the outcome: if the candle qualified the
heads-up spoke, and if it did not, no code path existed to say so. His event, from the record and the
real bars — EUR/USD's 12:00 UTC candle on 21 Aug, flagged SELL at 12:55:11, closed at a 10.8 pip body
that did not qualify (it reached 1.16846 and bounced back to 1.16900). GBP/USD's did the same at
12:56:16. Both ended in silence. `standdown_signal` is what speaks there now.
"""
import time

from core.types import Candle, Signal, Direction, TF
from notifications import titles
from shared.mtf_utils import is_closed, seconds as tf_seconds
from strategies.vix1_momentum import is_momentum_candle, momentum_grade

# How long before the close to notify. MEASURED, not chosen — see the table above.
LEAD_S = 5 * 60


def forming(h1: list[Candle], now: float | None = None) -> Candle | None:
    """The still-forming H1 bar — the feed's newest, when it has not closed yet.

    Returns None when the newest bar has already closed, which happens whenever the feed's cache is
    a beat behind the clock. No bar is forming as far as this module is concerned, and inventing one
    from the last closed bar would announce a candle that is already history.
    """
    if not h1:
        return None
    last = h1[-1]
    return None if is_closed(last.time, last.timeframe or TF.H1.value, now) else last


def seconds_to_close(bar: Candle, now: float | None = None) -> float:
    """How long this bar has left. Bars are stamped at their OPEN, so it closes one duration later."""
    return bar.time + tf_seconds(bar.timeframe or TF.H1.value) - (now if now is not None else time.time())


def check(h1_closed: list[Candle], h1_raw: list[Candle], symbol: str,
          now: float | None = None) -> tuple[Candle, bool, float] | None:
    """Is a momentum candle forming, with less than `LEAD_S` left? -> (bar, bullish, secs_left).

    THE BASELINES COME FROM THE CLOSED BARS. `is_momentum_candle` measures the candidate against the
    bars BEFORE it (`h1[i-1]`, and the 100/long windows), so the forming bar is appended as index
    `len(h1_closed)` and every yardstick it is judged against is a finished bar. Passing the raw feed
    list straight in would work only by accident — it relies on there being exactly one unclosed bar
    at the end, which is not something this module gets to assume about a cache.

    Both directions are tried and at most one can pass: `is_momentum_candle` refuses a candidate
    whose own colour disagrees with the side being tested.

    A DOWNWARD CANDLE IS HELD BACK UNTIL THE TURN HAS PROVED ITSELF — his instruction, 2026-08-26:

        "disable DM notification for momentum candle closure for old downtrend without pullback that
         you added pullback for. Send notification of momentum candle closure minutes remaining only
         when the momentum candle occur after pullback to align with the new pullback logic."

    WHY IT WAS NEEDED. On 2026-08-25 a turn DOWN lost the change-of-character shortcut: it must run,
    pull back, and turn back down before a momentum candle can trade it. This function never learned
    that, because it asks only three things — is a bar forming, is it inside the lead window, is it a
    momentum candle — and the trend, regime and pullback tests all live in `detect_bias`, which runs
    much later in `vix1.analyze`. So he was still being told to be at the screen for a candle the
    strategy had already refused.

    `pending == -1` IS THE SAME FACT THE ENTRY REFUSES ON, not a second description of it: a downward
    turn proposed and not yet confirmed. Measured on a synthetic bearish turn through the real
    readers — `breaks down and runs` gives -1 (held back), and once it has pulled back and turned
    back down `pending` is 0 and the notification speaks again.

    A TURN UP IS UNTOUCHED, and so is a down candle in an already-confirmed downtrend (`pending` 0) —
    that trend proved itself long ago. This is deliberately the narrow reading of his sentence: it
    mirrors the one-sided rule it is aligning to, and nothing else.

    THE TREND IS READ ONLY AFTER the bearish momentum test has already passed, so the cost lands in
    the few minutes before a qualifying bearish candle closes rather than on every scan of every
    instrument.

    THE STAND-DOWN NEEDS NO CHANGE: it fires only for a candle he was actually told about
    (`vix1.analyze`, `if told is not None`), so holding the notification back silences its follow-up.
    """
    bar = forming(h1_raw, now)
    if bar is None or len(h1_closed) < 20:
        return None
    left = seconds_to_close(bar, now)
    if not 0 < left <= LEAD_S:
        return None
    window = h1_closed + [bar]
    for bullish in (True, False):
        if not is_momentum_candle(window, len(h1_closed), bullish, symbol):
            continue
        if not _could_trade(h1_closed, bullish, bar):
            return None
        return (bar, bullish, left)
    return None


def _could_trade(h1_closed: list[Candle], bullish: bool,
                 forming_bar: Candle | None = None) -> bool:
    """Could a candle THIS WAY produce a bias at all? If not, there is nothing to be at the screen for.

    HIS CASE, 26 Aug 2026 01:58 UTC. He was sent *"XAU/USD · BUY · closes in ~1 minute"* and asked
    what the basis was, because he could not find one in the strategy. There was none: the 1HR trend
    was DOWN and the candle was a BUY, and the production log said so four minutes later —
    *"XAU/USD bias=NONE: down trend but no momentum candle that way"*. No route existed to trade it at
    any body size. (The candle also stopped qualifying before it closed, at $19.26 against the $21.12
    that triggered the card — the documented one-in-five.)

    `forming_bar` is the bar still being built — it is what lets a BUY candle that is ITSELF turning
    the market UP be announced; see the branch below. Omitted, this behaves exactly as before.

    THIS ASKS THE SAME QUESTION `detect_bias` ASKS, and deliberately not a stricter one:

      * the normal route runs only when the trend AGREES with the candle (`vix1_bias`, `if t1 == want`)
      * when it does not, the only thing that can still trade it is the change-of-character route

    So "the trend disagrees" alone is NOT a reason to stay silent — that would mute exactly the
    reversals `vix1_choch` exists to catch. The test is whether EITHER route is open:

      BUY   trend is up, OR an upward turn is pending
      SELL  trend is down. A pending DOWNWARD turn is refused by his rule of 2026-08-25 (it must run,
            pull back and turn back down first), so it stays refused here — the notification and the
            entry give the same answer, which is the point.

    Read off the `TrendState` the strategy already computes, from CLOSED bars only: a trend is a
    LEVEL, and a level never comes from a bar still forming. Called only AFTER the momentum test has
    passed, so the cost lands in the last minutes of a qualifying candle, not on every scan.
    """
    from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS
    from strategies.vix1_swings import structure_turns
    from strategies.vix1_trend import trend_state
    w = h1_closed[-_H1_TREND_BARS:]
    st = trend_state(w, n=_H1_SWING_N, turns=structure_turns(w, _H1_SWING_N))

    # A BUY CANDLE THAT IS ITSELF TURNING THE MARKET UP (added 2026-08-29). Without this, the `pending
    # == 1` test below can never fire on the bar that CREATES the pending turn — and that is not a
    # tuning problem, it is arithmetic. This function is asked BEFORE the candle closes, so the state
    # it reads is by definition the state BEFORE the break. The bar that proposes a turn up therefore
    # always reads as counter-trend at the moment we ask, and is always silenced.
    #
    # NOTHING IS INVENTED. A change of character is defined ONE way in this codebase — price CLOSES
    # through the level protecting the trend (`vix1_trend`, the CHoCH branch) — and `protected` is
    # that level. This asks the same question of the bar in progress, which is legitimate in THIS
    # module and nowhere else: it is the one place that deliberately reads the forming bar.
    #
    # ONE SIDE ONLY, AND THAT IS HIS RULE OF 2026-08-25, NOT A CHOICE MADE HERE. Traced through the
    # real `trend_state` and `choch_entry` on a synthetic turn of each kind:
    #
    #     a SELL closing through an UPtrend's protection  -> pending -1 -> choch_entry REFUSES it
    #                                                        ("a turn DOWN is not exempted from the
    #                                                         pullback rule")
    #     a BUY  closing through a DOWNtrend's protection -> pending +1 -> choch_entry gives a BIAS
    #
    # So the downward break has NO route and must stay silent — announcing it would re-open exactly
    # what his 26 Aug instruction closed. Only the upward one is added. This mirrors `choch_entry`'s
    # own one-sidedness rather than restating it, and it grants no permission the line below does not
    # already grant — it grants the SAME one, one bar earlier, on the bar that earns it.
    if (forming_bar is not None and bullish and st.direction == -1
            and st.protected is not None and forming_bar.close > st.protected):
        return True

    if bullish:
        return st.direction == 1 or st.pending == 1
    return st.direction == -1


def preclose_signal(symbol: str, bullish: bool, bar: Candle, secs_left: float,
                    pip: float, strategy_name: str) -> Signal:
    """The alarm-clock card. No entry, no stop, no target — none of them exist yet."""
    side = "BUY" if bullish else "SELL"
    mins = max(1, round(secs_left / 60))
    body = abs(bar.close - bar.open) / pip if pip else 0.0
    grade, _ = momentum_grade(bar, bullish)
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if bullish else Direction.SELL,
        # `_watch` routes it to the admin DM. This is emphatically not channel material: it is a
        # forecast about a bar that has not finished, and one in five of them does not come true.
        strategy_id       = "vix1_watch",
        strategy_name     = strategy_name,
        alert_only        = True,
        # NO WATCHING ROW. A forecast about an unfinished bar is not a setup being watched, and there
        # is one such row per strategy+symbol+direction — claiming it would post a setup that may
        # never exist AND leave the genuine heads-up five minutes later with the row already taken.
        persist_watch     = False,
        stage             = "building",     # amber, no projection arrow, no order type
        qualified         = True,
        primary_timeframe = TF.H1,
        confidence        = 0.0,
        headline          = titles.MOMENTUM_CLOSING,
        label             = f"~{mins} MIN LEFT",
        # MARK THE FORMING BAR. This is also what tells the card renderer to draw it: every other
        # card drops the unfinished bar, and this one would be a picture of the wrong candle without
        # the mark. See orchestrator/strategy_runner._attach_chart.
        chart_marks       = [(bar.time, "FORMING")],
        technical_reasons = [
            f"The 1H candle NOW FORMING closes in about {mins} minute{'s' if mins != 1 else ''} "
            f"and currently qualifies as a {side} momentum candle — {body:.0f} pip body, grade {grade}",
            "BE AT THE SCREEN FOR THE CLOSE. Nothing is decided until it closes: the bias, the line "
            "and the 1M entry are all read off the FINISHED candle.",
            "About 4 in 5 of these close as momentum candles; the other 1 in 5 gives it back in the "
            "last minutes — measured on 145 days of real M1 data, both pairs.",
            "This is a NOTIFICATION, not a trade — no entry, stop or target exists yet. You will "
            "hear either way once it closes.",
        ],
        market_context    = (f"VIX.1 PRE-CLOSE — {symbol} 1H momentum candle forming {side}, "
                             f"~{mins} min to the close"),
    )


def dedup_key(strategy_id: str, symbol: str, bullish: bool, bar: Candle) -> str:
    """ONE NOTIFICATION PER CANDLE. Keyed on the forming bar's own open time, so the ~5 scan ticks
    inside the window produce one message and not five. Direction is in the key because a candle that
    flips colour inside the window is a different notification, not a repeat of the first."""
    return f"{strategy_id}_preclose_{symbol}_{'B' if bullish else 'S'}_{bar.time}"


def standdown_key(strategy_id: str, symbol: str, bar: Candle) -> str:
    """ONE STAND-DOWN PER CANDLE — deliberately NOT keyed on direction. "It did not qualify" is one
    fact about the candle however it was flagged, so keying on direction would send two messages when
    a candle flipped colour inside the window and both directions were notified."""
    return f"{strategy_id}_preclose_standdown_{symbol}_{bar.time}"


def closed_outcome(h1_closed: list[Candle], symbol: str,
                   now: float | None = None) -> tuple[Candle, bool] | None:
    """The newest CLOSED bar and whether it qualified as a momentum candle. None if too little data.

    EITHER DIRECTION COUNTS AS QUALIFYING: a candle flagged SELL that closes as a BUY momentum candle
    gets the ordinary BUY heads-up, and a stand-down as well would be two messages saying opposite
    things about one candle. WHETHER HE WAS TOLD is the caller's question, answered from
    `delivery_ledger` — which keeps the DB out of this module.
    """
    if len(h1_closed) < 21:
        return None
    bar = h1_closed[-1]
    i = len(h1_closed) - 1
    qualified = (is_momentum_candle(h1_closed, i, True, symbol)
                 or is_momentum_candle(h1_closed, i, False, symbol))
    return (bar, qualified)


def standdown_signal(symbol: str, bar: Candle, bullish: bool, pip: float,
                     strategy_name: str) -> Signal:
    """"That candle did not make it — still watching." The other half of the notification.

    No `chart_marks`: the bar has CLOSED, so the card draws it as the ordinary finished candle it now
    is. STAGE STAYS `building` — the only other stage is `ready`, which paints a green/red buy-sell
    accent, actively wrong on a message whose point is that there is nothing to trade.
    """
    side = "BUY" if bullish else "SELL"
    body = abs(bar.close - bar.open) / pip if pip else 0.0
    gave_back = (bar.high - bar.close) if not bullish else (bar.close - bar.low)
    reach = (bar.open - bar.low) if not bullish else (bar.high - bar.open)
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if bullish else Direction.SELL,
        strategy_id       = "vix1_watch",     # admin DM, never the channel
        strategy_name     = strategy_name,
        alert_only        = True,
        persist_watch     = False,            # nothing is being watched — the opposite, in fact
        stage             = "building",
        qualified         = False,
        primary_timeframe = TF.H1,
        confidence        = 0.0,
        headline          = titles.MOMENTUM_FAILED,
        label             = "STILL WATCHING",
        technical_reasons = [
            f"The 1H candle you were notified about ({side}) has CLOSED and did not qualify as a "
            f"momentum candle — {body:.1f} pip body.",
            (f"It reached {reach / pip:.1f} pips in your direction and gave back "
             f"{gave_back / pip:.1f} of it before the close."
             if pip and reach > 0 else
             "It did not hold the move it was making when you were notified."),
            "Nothing to trade here — no entry, stop or target was ever created for it.",
            "STILL WATCHING. You will get the next notification if another candle starts building.",
        ],
        market_context    = (f"VIX.1 — {symbol} 1H {side} candle closed without qualifying; "
                             f"watching for the next"),
    )
