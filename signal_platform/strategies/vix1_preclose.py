"""VIX.1 — THE WARNING BEFORE THE MOMENTUM CANDLE CLOSES.

His words, 2026-08-19: *"Can we change it so that I receive a message that the momentum candle is
about to close so that I can be there when it closes? ... Being there exactly when the momentum
candle closes is the leverage I have."*

WHAT IT IS. Every other VIX.1 message is about a bar that has already CLOSED — that is the platform
working correctly, and it is also why the earliest any of them can reach him is a few seconds after
the hour. This one is the opposite: it reads the bar still FORMING and says *this one is shaping up
to be a momentum candle, be at the screen*. It is the only place in VIX.1 where reading the forming
bar is the point rather than a bug.

NOT A SIGNAL, AND IT MUST NEVER READ AS ONE. It carries no entry, no stop and no target, because none
of them exist yet — the bias is not confirmed until the candle closes and the entry is decided on the
1M after that. It is an alarm clock.

WHY T-5 AND NOT T-10 OR T-15. Measured on 145 days of real cTrader M1, rebuilding each H1 bar as it
stood with N minutes left and running THIS test on it, against the same test on the finished bar:

    lead    fired   correct        caught of all that formed
    T-5      244     80.3%  (EUR)   74.8%          246  76.0% (GBP)  69.3%
    T-10     210     69.5%  (EUR)   55.7%          237  69.6% (GBP)  61.1%
    T-15     178     64.0%  (EUR)   43.5%          196  64.3% (GBP)  46.7%

T-5 is better on BOTH axes at once — more of what it says comes true AND it misses fewer real ones —
so there is no trade-off to weigh here. Earlier is not "more warning", it is a worse warning: with
15 minutes left there is simply not enough of the candle to judge. About 1.7 alerts per pair per day.

FOUR IN FIVE, NOT FIVE IN FIVE. One in five of these candles gives the move back in the last five
minutes and closes as something else. That is a property of the market, not a bug to tune out, and
the card says so in as many words — he is being told to WATCH, and the close decides.
"""
import time

from core.types import Candle, Signal, Direction, TF
from shared.mtf_utils import is_closed, seconds as tf_seconds
from strategies.vix1_momentum import is_momentum_candle, momentum_grade

# How long before the close to warn. MEASURED, not chosen — see the table above.
LEAD_S = 5 * 60


def forming(h1: list[Candle], now: float | None = None) -> Candle | None:
    """The still-forming H1 bar — the feed's newest, when it has not closed yet.

    Returns None when the newest bar has already closed, which happens whenever the feed's cache is
    a beat behind the clock. No bar is forming as far as this module is concerned, and inventing one
    from the last closed bar would warn about a candle that is already history.
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
    """
    bar = forming(h1_raw, now)
    if bar is None or len(h1_closed) < 20:
        return None
    left = seconds_to_close(bar, now)
    if not 0 < left <= LEAD_S:
        return None
    window = h1_closed + [bar]
    for bullish in (True, False):
        if is_momentum_candle(window, len(h1_closed), bullish, symbol):
            return (bar, bullish, left)
    return None


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
        headline          = f"{side} — MOMENTUM CANDLE CLOSING",
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
            "About 4 in 5 of these close as momentum candles. The other 1 in 5 gives it back in the "
            "last minutes — measured on 145 days of real M1 data, both pairs.",
            "This is a WARNING, not a trade. No entry, stop or target exists yet.",
        ],
        market_context    = (f"VIX.1 PRE-CLOSE — {symbol} 1H momentum candle forming {side}, "
                             f"~{mins} min to the close"),
    )


def dedup_key(strategy_id: str, symbol: str, bullish: bool, bar: Candle) -> str:
    """ONE WARNING PER CANDLE. Keyed on the forming bar's own open time, so the ~5 scan ticks inside
    the window produce one message and not five. Direction is in the key because a candle that flips
    colour inside the window is a different warning, not a repeat of the first."""
    return f"{strategy_id}_preclose_{symbol}_{'B' if bullish else 'S'}_{bar.time}"
