"""VIX.1 — ANNOUNCE EVERY QUALIFYING MOMENTUM CANDLE, WHETHER OR NOT ANYTHING CAN BE TRADED.

HIS INSTRUCTION, 2026-10-12: *"I want momentum candles to be announced whether the setup qualifies or
not. That is not a signal, it is just announcement of momentum candles."* And, on the shape of it:
*"announce any momentum candle that qualifies based on the parameters we have for qualifying a
momentum candle not a setup. Only announce it when it is closed. Send through the DM."*

WHAT PROMPTED IT. He marked two EUR/USD 1H candles on 12 Oct and had received nothing:

    11:00 UTC+3 (08:00 UTC)  1.12031 -> 1.11930   10.10 pip body   100-bar median 4.35
    12:00 UTC+3 (09:00 UTC)  1.11931 -> 1.11811   12.00 pip body   100-bar median 4.35

Both qualify, and both are big ON THEIR OWN — neither leans on the 24-hour memory. EUR/USD was
RANGING (inside the 1.1166-1.1279 box, his own rule), and every one of the four momentum messages
this platform already sends is gated on "could this trade":

    MOMENTUM CANDLE CLOSURE NOTIFICATION    `vix1_preclose._could_trade` is False while ranging
    MOMENTUM CANDLE DID NOT QUALIFY         fires only for a candle already announced (`told`)
    MOMENTUM CANDLE CLOSED - SETUP BUILDING sits below the `bias is None` return in `vix1.analyze`
    WAITING ON THE CANDLE COUNT             needs a shadow bias; ranging kills it

One gate, four silences. Nothing was broken — there was simply no message that is not about a trade.
THIS MODULE IS THAT MESSAGE, and the range gate is left exactly as it is.

⚠ IT ASKS ONE QUESTION AND NOTHING ELSE. No trend, no box, no pullback, no candle count, no news, no
spacing, no bias. Every one of those decides whether a TRADE may be taken, and this announces a
CANDLE. Adding any of them here would re-create the exact silence he is complaining about. If a
future change makes this module import `vix1_bias`, `vix1_chop`, `vix1_trend` or `vix1_retracement`,
that change is wrong.

⚠ WHY `qualifies_for_trade` AND NOT `is_momentum_candle`. The two disagree, and his own example
decides it: at a 4.35 pip median the strict 2.5x test demands 10.88 pips, so it would have announced
only the SECOND of the two candles he pointed at. `qualifies_for_trade` is 2.5x less his 0.2 margin
(2.3x = 10.01 pips) plus the 24-hour memory, and it announces BOTH. He pointed at both.

    That function's docstring warns it should be asked only at the trade moment, and that warning is
    real: when the 15 Sep alternatives leaked into every caller, 6 of his 9 recorded dead markets
    looked awake. But the warning is about tests that COUNT or SCAN candles and thereby change what
    gets TRADED. This caller changes no trading behaviour whatsoever — it builds a message and
    returns. Nothing downstream reads its result.

    The one consequence worth naming: the 24-hour memory can admit a candle on an EARLIER candle's
    yardstick. When that happens the card SAYS SO, via `vix1_momentum.size_note`, so the basis is
    visible rather than implied.

ONLY CLOSED CANDLES, at his instruction. The newest bar and no other — this module never reads a
forming bar, which is what `vix1_preclose` exists for.
"""
from core.types import Candle, Signal, Direction, TF
from notifications import titles
from shared.candle_math import body_size, is_bullish
from strategies.vix1_momentum import momentum_grade, qualifies_for_trade, size_note

# The fewest bars worth asking about. `baseline_body` needs a population before its median means
# anything, and below this the answer would be noise dressed as a measurement.
_MIN_BARS = 20


def check(h1_closed: list[Candle], symbol: str) -> tuple[Candle, bool, str | None] | None:
    """Is the NEWEST CLOSED 1H bar a qualifying momentum candle?
    -> (bar, bullish, how_it_qualified), else None.

    `h1_closed` must already have the forming bar removed (`shared.mtf_utils.closed_only`). The
    direction is the candle's OWN colour, not a side being tested: `qualifies_for_trade` refuses a
    candidate whose colour disagrees with the side asked about, so asking both ways would be asking
    the same question twice and getting one answer.

    The third value is `size_note`'s explanation, present ONLY when the 24-hour memory admitted the
    candle on an earlier candle's yardstick, and None when it was big on its own. It is read HERE
    because this is the only place that still holds the full bar list and the index — `note()` gets
    one candle and could not re-derive it.
    """
    if len(h1_closed) < _MIN_BARS:
        return None
    i = len(h1_closed) - 1
    bar = h1_closed[i]
    bullish = is_bullish(bar)
    if not qualifies_for_trade(h1_closed, i, bullish, symbol):
        return None
    return bar, bullish, size_note(h1_closed, i, bullish, symbol)


def dedup_key(symbol: str, bar: Candle) -> str:
    """ONE ANNOUNCEMENT PER CLOSED CANDLE. Keyed on the bar's own open time, so the ~80 scan ticks
    that see the same newest bar produce one message, not eighty.

    KEYED ON THE BAR, NOT THE DIRECTION, unlike the trade-side keys. A candle has exactly one
    colour, so a direction here would add nothing and would let a mislabelled rerun through twice.
    """
    return f"vix1_mom_announce_{symbol}_{bar.time}"


def note(symbol: str, bullish: bool, bar: Candle, pip: float, strategy_name: str,
         admitted_note: str | None = None) -> Signal:
    """The DM card. No entry, no stop, no target — this is NOT a trade, and must not read as one.

    `admitted_note` is `check`'s third value: how the candle qualified, stated only when the
    24-hour memory let it in on an earlier candle's yardstick. Shown rather than hidden, so the
    basis for a borderline announcement is visible on the card itself.
    """
    side = "BUY" if bullish else "SELL"
    body = body_size(bar) / pip if pip else 0.0
    grade, _ = momentum_grade(bar, bullish)
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if bullish else Direction.SELL,
        # `vix1_watch` — THE SAME ID EVERY OTHER VIX.1 DM CARD USES. The `_watch` suffix routes it to
        # the admin DM (`dispatcher.py:255`), and the dispatcher STRIPS that suffix and looks the
        # rest up in `dm_only_exempt`, `channel_all` and `min_confidence_overrides` — all of which
        # know "vix1". An id like `vix1_announce_watch` would be looked up as `vix1_announce`, a name
        # none of them knows, and would silently stop following VIX.1 at the next settings change.
        # The card type is told apart by its HEADLINE and its own dedup key, exactly as `preclose`,
        # `building` and `countwatch` already share this id.
        strategy_id       = "vix1_watch",
        strategy_name     = strategy_name,
        alert_only        = True,
        # NO WATCHING ROW. There is one per strategy+symbol+direction; claiming it for an
        # announcement would take the row a real setup needs, for a candle nothing is trading.
        persist_watch     = False,
        stage             = "building",
        qualified         = True,
        primary_timeframe = TF.H1,
        confidence        = 0.0,
        headline          = titles.MOMENTUM_ANNOUNCEMENT,
        label             = f"{side} · ANNOUNCEMENT ONLY",
        chart_marks       = [(bar.time, "MOMENTUM")],
        technical_reasons = [r for r in [
            f"A {side} momentum candle has CLOSED on the 1H — {body:.1f} pip body, grade {grade}.",
            admitted_note and f"How it qualified: {admitted_note}",
            "THIS IS AN ANNOUNCEMENT, NOT A SIGNAL. It says only that a momentum candle closed. It "
            "says nothing about the trend, the range, the pullback or the candle count, and the "
            "strategy may well have refused this setup already.",
            "No entry, stop or target is attached, because no trade is being proposed. If a trade "
            "does come from this candle it arrives as its own separate signal.",
        ] if r],
        market_context    = f"VIX.1 — {symbol} 1H {side} momentum candle closed (announcement only)",
    )
