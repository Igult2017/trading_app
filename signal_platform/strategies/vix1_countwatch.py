"""VIX.1 — TELL HIM WHEN A CANDLE IS TRADEABLE EXCEPT FOR THE COUNT.

HIS INSTRUCTION, 2026-10-04:

    "for all the setups that require 2 to 3 momentum candles to run for confirmation, i need
     notification for 1st and second candles if they are momentum candles and then signal starts at
     3rd candle going forward"

and, asked to pin the detail down: **DM**, and *"a candle that qualifies based on all qualifications
including margin and memory and only fails candle count."*

WHAT IT DOES NOT DO: it does not change when a signal fires. The entry still starts at the 3rd candle.
This is a notification he may act on at his own discretion, and it says so on its face.

WHY IT EXISTS. VIX.1 makes a setup wait on a candle count in two places — a breakout that has not
pulled back yet (3rd candle, counting the break as the 1st) and a pullback longer than three candles
(3rd candle after it). During that wait he was told nothing. On 30 Sep the only momentum candle of the
whole GBP/USD move — 19 pips, 4.27x the 100-bar median, 89% body, 10% counter-wick — was candle 1 of
such a wait, and it passed in silence while price ran.

HOW "ONLY THE COUNT FAILED" IS DECIDED, and why it is done this way. Listing the other gates here and
checking them one by one would be a SECOND copy of the rule set, and it would drift from the real one
the moment a gate is added or reordered. So the question is put to the entry itself: run it normally,
then run it again with the count refusal — and only that — muted. A real `detect_bias` that returns
None beside a shadow one that returns a Bias means the count was the only thing in the way. It cannot
drift, because it IS the entry.

⚠ THE SHADOW CALL IS NOT FREE AND IS GUARDED ACCORDINGLY. A scanner tick already takes 13-15 s on a
two-CPU box (docs/OPEN.md C10), so running `detect_bias` twice on every tick would be a real cost for
a notification. It runs only after the cheap test below says a note is even possible: the newest closed
candle must itself pass `qualifies_for_trade` — his "all qualifications including margin and memory".
That is rare, so the second call is rare.
"""
from core.types import Candle, Direction, Signal, TF
from notifications import titles
from shared.candle_math import body_size, is_bullish
from strategies import vix1_bias
from strategies.vix1_momentum import momentum_grade, qualifies_for_trade


# WHAT THE NOTE SAYS IS HOLDING IT. One line, because by the time it is used the pair of calls above
# has established it: everything passed, the count did not.
_WAITING = ("the candle count — this setup waits for the 3rd candle, and this one is earlier than that")


def dedup_key(symbol: str, bullish: bool, bar: Candle) -> str:
    """ONE NOTE PER CANDLE. Keyed on the closed bar's own time, so the scan ticks inside that hour
    produce one message and not sixty. Direction is in the key because the opposite way is a different
    setup, not a repeat of this one."""
    return f"vix1_count_{symbol}_{'B' if bullish else 'S'}_{bar.time}"


def check(h1: list[Candle], h4: list[Candle], symbol: str, debut=None) -> tuple[Candle, bool, str] | None:
    """(the candle, its direction, why it is still waiting) — or None when there is nothing to say.

    Returns something ONLY when every gate passes and the candle count alone refuses.
    """
    if len(h1) < 2:
        return None
    bar = h1[-1]                       # `h1` is closed_only, so this is the newest FINISHED candle
    bullish = is_bullish(bar)

    # THE CHEAP TEST FIRST, and it is also his rule. If the candle is not one he would trade, nothing
    # below matters — and this is what keeps the shadow call rare.
    if not qualifies_for_trade(h1, len(h1) - 1, bullish, symbol):
        return None

    # IF IT ALREADY TRADES, THERE IS NOTHING TO REPORT. The signal itself is the message.
    if vix1_bias.detect_bias(h1, h4, symbol, debut=debut) is not None:
        return None

    # ...AND WOULD IT TRADE IF THE COUNT WERE SATISFIED? Only the count refusal is muted; every other
    # gate still runs, so a Bias here means the count was the single thing in the way.
    shadow = vix1_bias.detect_bias(h1, h4, symbol, debut=debut, ignore_count=True)
    if shadow is None:
        return None

    # THE DIRECTION MUST MATCH THE CANDLE. A shadow bias the other way is a different setup, and
    # reporting this candle under it would describe a trade he is not being shown.
    if bool(shadow.bullish) != bullish:
        return None

    # NOTHING IS RE-DERIVED HERE. The two calls above have already PROVEN the count is the only thing
    # refusing — that is what the pair means. An earlier build re-asked `entry_timing` to quote its
    # wording in the note, and it was wrong twice over: asked without the break bar it cannot see the
    # breakout branch at all (it returned None and silently killed every note), and re-deriving a
    # refusal that has already been established is the second-copy-of-the-rule problem this design
    # exists to avoid. The note states what is true and stops there.
    return bar, bullish, _WAITING


def note(symbol: str, bullish: bool, bar: Candle, why: str, pip: float, strategy_name: str) -> Signal:
    """The DM card. No entry, no stop, no target — this is not a trade."""
    side = "BUY" if bullish else "SELL"
    body = body_size(bar) / pip if pip else 0.0
    grade, _ = momentum_grade(bar, bullish)
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if bullish else Direction.SELL,
        # `vix1_watch` — THE SAME ID EVERY OTHER VIX.1 DM CARD USES (`vix1_preclose`,
        # `vix1_building`). The `_watch` suffix is what routes it to the admin DM instead of the
        # public channel, and it also picks the `format_signal_watch` card
        # (`notifications/dispatcher.py:148`, `:199`, `:256`). It is emphatically not channel
        # material: a candle he may choose to trade, not a signal the strategy is taking.
        #
        # ⚠ IT IS DELIBERATELY NOT `vix1_count_watch`, which is what this shipped as first. The
        # dispatcher STRIPS `_watch` and looks the rest up in three settings — `dm_only_exempt`
        # ("bx_sd,vix1"), `channel_all` ("bx_sd") and `min_confidence_overrides` ("vix1:0.60"). A
        # card calling itself `vix1_count_watch` is looked up as `vix1_count`, a name none of them
        # knows, so it would silently stop following VIX.1 the moment any of those is changed.
        # Both ids route to the DM today, so this was not yet a live fault — it was one waiting for
        # a settings change. The CARD TYPE is told apart by its headline and its own dedup key, which
        # is how preclose and building already share this id.
        strategy_id       = "vix1_watch",
        strategy_name     = strategy_name,
        alert_only        = True,
        # NO WATCHING ROW. There is one per strategy+symbol+direction, and claiming it here would take
        # the row the real signal needs when the count is finally satisfied.
        persist_watch     = False,
        stage             = "building",
        qualified         = True,
        primary_timeframe = TF.H1,
        confidence        = 0.0,
        headline          = titles.MOMENTUM_WAITING_COUNT,
        label             = f"{side} · WAITING ON THE COUNT",
        chart_marks       = [(bar.time, "MOMENTUM")],
        technical_reasons = [
            f"A {side} momentum candle has CLOSED and passes every qualification — {body:.0f} pip "
            f"body, grade {grade}.",
            f"It is not being traded for ONE reason: {why}",
            "THE SIGNAL STILL COMES AT THE 3rd CANDLE. Nothing about the entry has changed — this "
            "is the earlier candle reported so you can take it on your own judgement if you want it.",
            "No entry, stop or target is attached, because the strategy has not taken this trade.",
        ],
        market_context    = (f"VIX.1 — {symbol} 1H {side} momentum candle closed, waiting on the "
                             f"candle count"),
    )
