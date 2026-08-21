"""VIX.1 — STAGE 1: the momentum candle has closed, we are waiting for the 1M entry.

The user, 2026-08-03: *"send one signal twice. The first signal when higher TF is building up ...
if its VIX the first volume candle has closed so we are waiting for entry. Then the second signal
only sends a ready entry setup."*

THE GAP THIS FILLS. `vix1.analyze` confirmed the 1HR bias off the first momentum candle and then, if
`m1_signals` produced no entry yet, returned SILENTLY. So the only VIX.1 message that ever existed
was the ready entry — there was no way to know a setup was forming, which is exactly the moment a
trader wants to be at the screen.

`vix1_watch` is NOT this. That watches an ALREADY-FIRED setup for invalidation; this fires before
any setup exists.

ONE HEADS-UP PER MOMENTUM CANDLE. The dedup key is the candle's own timestamp, so the alert goes out
when the candle closes and stays quiet for every scan tick after — the bias can hold for hours, and
a heads-up that repeated every 60s would train the user to ignore the channel.
"""
from core.types import Candle, Signal, Direction, TF
from notifications import titles
from charting import theme
from strategies.vix1_lines import draw_line
from strategies.vix1_retracement import Retracement
from strategies.vix1_regime import Regime
from strategies.vix1_state import state_line


def building_signal(symbol: str, buy: bool, vc: Candle, origin: str, vol_count: int,
                    grade: str, digits: int, strategy_name: str, pip: float,
                    retracement: Retracement | None = None,
                    efficiency: float | None = None,
                    regime: Regime | None = None) -> Signal:
    """The stage-1 card: bias confirmed, entry pending."""
    side = "BUY" if buy else "SELL"
    body = abs(vc.close - vc.open) / pip
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = "vix1_watch",   # the _watch suffix routes it to the admin DM, never the
                                            # channel — an unconfirmed setup is not a signal
        strategy_name     = strategy_name,
        alert_only        = True,
        stage             = "building",     # amber card, "WAIT FOR ENTRY", no projection arrow
        qualified         = True,
        primary_timeframe = TF.H1,
        confidence        = 0.0,            # nothing to be confident about until the entry confirms
        # THIS CARD NAMES ITS OWN MOMENT. The panel used to derive the headline from `stage` alone,
        # so this card was captioned with another strategy's zone vocabulary — it told the reader to
        # "AWAIT THE RETURN" when what he is actually waiting for is the 1M pullback entry.
        headline          = titles.MOMENTUM_CLOSED,
        label             = "WAIT FOR 1M ENTRY",
        # No entry/stop/target: they are decided on the 1M and do not exist yet. The card prints an
        # em dash for each rather than inventing a level a reader might act on.
        #
        # MARK THE CANDLE, DO NOT SHADE A BAND. This used to pass a `chart_bands` entry spanning the
        # momentum candle's body, which draws a horizontal level across the whole chart — the user:
        # *"display the real momentum candles, these one doesnt look like a momentum candle."* It is
        # a CANDLE, so the card rings the bar itself and the reader sees its real body and wicks.
        # THE LINE is known the instant the momentum candle closes — it IS that candle's body
        # close — so the stage-1 card carries it too. The reader can see the level the entry will be
        # judged against before any entry exists, which is the whole point of a heads-up.
        chart_bands       = [(draw_line(vc), draw_line(vc), theme.LEVEL, "1H LINE")],
        chart_marks       = [(vc.time, "MOMENTUM")],
        technical_reasons = [
            f"Momentum candle CLOSED on the 1H — {side} bias confirmed, {body:.0f} pip body",
            f"Bias origin: {origin} — {vol_count} momentum candle{'s' if vol_count != 1 else ''} "
            f"in the run, grade {grade}",
            # The same market-state line the ready card carries, so a heads-up and the entry that
            # follows it can be compared directly. Decides nothing (Phase A).
            *( [state_line(retracement, efficiency, pip, regime)] if retracement is not None else [] ),
            "Waiting for the 1M pullback entry — no entry, stop or target until it confirms",
            "This is a HEADS-UP, not a trade. The ready card follows if the entry confirms.",
        ],
        market_context    = (f"VIX.1 BUILDING — {symbol} {side} bias confirmed on the 1H "
                             f"momentum candle; waiting for the 1M entry"),
    )


def dedup_key(strategy_id: str, symbol: str, buy: bool, vc: Candle) -> str:
    """One heads-up per momentum candle, per direction. Keyed on the CANDLE TIME, not the scan tick:
    the bias survives many ticks and the alert must not repeat on each one."""
    return f"{strategy_id}_building_{symbol}_{'B' if buy else 'S'}_{vc.time}"
