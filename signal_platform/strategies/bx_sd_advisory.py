"""BX-S/D — THE PULLBACK ADVISORY: "go and look", not "here is the trade".

HIS RULE, 2026-08-23: *"if it is a zone use the existing entry model. if it is a pullback report it
when its started ending and advice trader to check and set entry."*

So when signal 1's pullback lands on no 1H/30M/15M zone, BX has nothing to price an entry off — and
rather than refusing the setup outright (which is what it did until today) it says what happened and
hands the decision back. `bx_sd_pullback` decides WHEN; this decides what the message says.

IT CARRIES NO ENTRY, NO STOP AND NO TARGET, and that is the whole point rather than an omission. BX
has not worked one out; a card with a number on it would imply it had. `test_signal1_advisory` asserts
all three are zero, because `build_signal` will happily fill them with zeros if nothing checks.

ITS OWN FILE because `bx_sd_signal1` is already 275 lines — over the 200 limit — and this is a
different message with a different audience, not another branch of the entry card.

ROUTING: ADMIN DM, NEVER THE CHANNEL. His standing rule is that the channel carries BX ENTRY signals
only (`config.settings.channel_entries_only`), and a message with no entry is not one. `alert_only`
is the existing flag for exactly this — advice rather than a new signal — and the dispatcher already
routes on it.
"""
from core.types import Direction, Signal, TF

from strategies.bx_sd_pullback import describe
from strategies.bx_sd_registry import MarkedZone


def build_advisory(symbol: str, direction: str, pb, ext: MarkedZone, legs: list[str],
                   digits: int, strategy_id: str, strategy_name: str) -> Signal:
    """The advisory card. `pb` is a `bx_sd_pullback.PullbackState` that has already reported ending.

    The 4H zone the reaction came from is named so he knows WHERE to look — a message that says only
    "a pullback ended" is not actionable on a chart with several pairs open.
    """
    sig = Signal(
        symbol            = symbol,
        direction         = Direction.BUY if direction == "buy" else Direction.SELL,
        strategy_id       = strategy_id,
        strategy_name     = strategy_name,
        primary_timeframe = TF.H4,
        # NO ENTRY, STOP OR TARGET — left at zero deliberately. See the module note.
        entry_price       = 0.0,
        stop_loss         = 0.0,
        take_profit       = 0.0,
        risk_reward       = 0.0,
        confidence        = 0.0,
    )
    sig.headline   = "PULLBACK ENDING — set your own entry"
    sig.stage      = "building"      # amber: the change of character has not completed either
    sig.alert_only = True            # advice, not a trade -> admin DM
    sig.to_channel = False           # channel_entries_only: this has no entry, so it is not eligible
    sig.technical_reasons = [
        *describe(pb, direction, digits),
        f"Off the 4H extreme {ext.direction} zone "
        f"[{ext.bottom:.{digits}f}–{ext.top:.{digits}f}], which price tapped and moved clear of.",
        f"Confluence present: {' + '.join(legs)}" if legs
        else "No 1H/30M/15M zone confluence here — that is why there is no entry.",
    ]
    return sig
