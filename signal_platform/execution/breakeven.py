"""
MOVING THE STOP TO BREAKEVEN, AUTOMATICALLY, AT 1R.

His ask, 2026-08-21: *"Can you create it such that it is moved automatically to BE when the trade is
at 1R."* Until now the platform told him to move it; this is the first code that changes his account
rather than reporting on it, and every rule below exists because of that one fact.

BREAKEVEN IS THE NET-ZERO PRICE, NOT THE ENTRY — his definition, twice: *"when the market takes us
out we lose nothing and gain nothing"* and *"move it to where at least we have something to cater for
the costs of that trade"*. A stop at the entry still gives back the round-trip commission and any
swap, so the target price comes from `ctrader_positions.Position.breakeven()`, which reads the real
commission off the position and doubles it (the field is the opening half; closing costs the same).

THE FOUR RULES THAT MAKE THE WORST CASE "IT DID NOTHING":

  1. BOTH LEGS, ALWAYS — AND THIS IS PROVED, NOT ASSUMED. Measured on a live demo position,
     2026-08-21 (position 237946195, EUR/USD):

         SL 1.16689 -> 1.16789, take profit RE-PASSED   -> stop moved, TP 1.17689 SURVIVED
         SL 1.16789 -> 1.16839, take profit RE-PASSED   -> stop moved, TP 1.17689 SURVIVED
         SL       -> 1.16849, take profit OMITTED       -> stop moved, TP became NONE

     Omitting the take profit DELETES IT. `Q-R10` in the ctrader-mcp-servers skill says so for the
     REST surface and this broker behaves the same way. So re-passing the position's CURRENT target
     on every amend is LOAD-BEARING, not caution: without it, every automatic breakeven move would
     silently destroy his take profit and the trade would run with no exit.
  2. RATCHET ONLY. A stop is moved only toward safety. If his stop already sits at or beyond
     breakeven — because he moved it himself, or a previous poll did — nothing happens. The amend
     can never widen risk.
  3. NO STOP, NO TOUCH. A position without a stop is left exactly as it is. Adding one where he
     deliberately had none is a different decision and not one he asked for.
  4. RE-READ AFTERWARDS. The amend is not believed because the call returned; the position is read
     back and both legs are checked. A vanished take profit is an alarm, not a log line.

OFF BY DEFAULT, AND DEMO-ONLY. `auto_breakeven_enabled` is False until he sets it, and
`auto_breakeven_demo_only` refuses a live account at runtime — the same posture `execution/guards`
takes for order placement.
"""
import logging

from config.settings import settings
from data import ctrader_positions

log = logging.getLogger(__name__)


class Outcome:
    """What happened, in words the DM can use."""

    def __init__(self, moved: bool, message: str, alarm: bool = False):
        self.moved, self.message, self.alarm = moved, message, alarm


def _better(new_sl: float, old_sl: float, bullish: bool) -> bool:
    """Is `new_sl` strictly safer than the stop already there? The ratchet, in one line."""
    return (new_sl > old_sl) if bullish else (new_sl < old_sl)


def why_not(p, account_type: str, new_sl: float | None = None,
            price: float | None = None) -> str | None:
    """The reason this position must NOT be amended, or None if it may be. Checked before any
    network call, so a refusal costs nothing and reaches the log with its reason intact."""
    if not settings.auto_breakeven_enabled:
        return "auto-breakeven is off"
    if settings.auto_breakeven_demo_only and (account_type or "").lower() != "demo":
        return f"account is '{account_type}', not demo — refusing to amend"
    if p.stop is None:
        return "no stop on this position — leaving it alone"
    target_sl = new_sl if new_sl is not None else p.breakeven()
    if target_sl is None:
        return "the new stop price is unknown (position size not readable)"
    if not _better(target_sl, p.stop, p.bullish):
        return f"stop {p.stop} already at or beyond {target_sl:.5f} — nothing to do"
    # A STOP ON THE WRONG SIDE OF THE MARKET IS A MARKET CLOSE, NOT A STOP.
    #
    # LEARNED THE HARD WAY, 2026-08-21, on a real demo position. A buy was opened at 1.16880 and the
    # stop amended to 1.16887 — seven pips of "breakeven" ABOVE the entry, but ALSO above the current
    # bid, because a buy's stop triggers on the bid and the trade was not yet in profit. cTrader
    # accepted the amend (ORDER_REPLACED) and the position vanished on the spot: the stop fired the
    # instant it was set. The ratchet test above passed happily, because 1.16887 IS safer than
    # 1.16780 — safer is not the same as PLACEABLE.
    #
    # In the normal flow this cannot bite: the rungs only fire at 1R or better, where the market is
    # far beyond the new stop. It bites when price snaps back between the R reading and the amend
    # landing. The honest outcome there is "we did not move it", not a silent market exit that the
    # message told him was a stop.
    if price is not None:
        if (target_sl >= price) if p.bullish else (target_sl <= price):
            return (f"stop {target_sl:.5f} is already through the market ({price:.5f}) — setting it "
                    f"would CLOSE the position, not protect it; leaving it alone")
    return None


async def move_stop_to(p, new_sl: float | None, label: str, creds: dict,
                       account_type: str, price: float | None = None) -> Outcome:
    """Move this position's stop to `new_sl`. `None` means "to breakeven". Never raises.

    ONE FUNCTION FOR EVERY RUNG. Breakeven at 1R, +1R at 2R, +2R at 3R and +3R at 4R differ only in
    the price; every guard — ratchet-only, both legs, the re-read, demo-only, the kill switch — is
    identical and must stay identical. A second code path for "the ladder" would be a second place
    for the both-legs rule to be forgotten, which is the one mistake here that costs money.
    """
    be = new_sl if new_sl is not None else p.breakeven()
    blocked = why_not(p, account_type, be, price)
    if blocked:
        return Outcome(False, blocked)
    old = p.stop
    try:
        from execution.broker import StopOrderClient
        client = StopOrderClient(creds, account_type)
        # THE CURRENT TARGET IS RE-PASSED, not omitted — rule 1. `p.target` was read from the broker
        # moments ago by the same reconcile that produced this position.
        res = await client.amend_sltp(p.position_id, p.symbol, be, p.target)
        if not res.ok:
            return Outcome(False, f"broker refused the amend: {res.error}")
    except Exception as exc:
        log.error(f"[breakeven] {p.symbol} #{p.position_id}: {type(exc).__name__}: {exc}",
                  exc_info=True)
        return Outcome(False, f"amend failed: {type(exc).__name__}")

    # RULE 4 — believe the position, not the call.
    after = await ctrader_positions.open_positions()
    if after is None:
        return Outcome(True, f"stop moved to {be:.5f} ({label}), but the position could not be "
                             f"re-read to confirm it — check your platform")
    now = next((x for x in after if x.position_id == p.position_id), None)
    if now is None:
        return Outcome(True, f"stop moved to {be:.5f}, but the position is no longer open — it may "
                             f"have closed in the meantime")
    lost_tp = bool(p.target) and not now.target
    if lost_tp:
        # The failure mode this whole design is shaped around. Say it loudly and say what to do.
        return Outcome(True,
                       f"⚠️ THE TAKE PROFIT IS GONE. The stop moved to {now.stop} but your target "
                       f"({p.target}) is no longer on the position. Re-set it on your platform now. "
                       f"Auto-breakeven should be switched off until this is understood.",
                       alarm=True)
    if now.stop is None or not _better(now.stop, old, p.bullish):
        return Outcome(False, f"the amend reported success but the stop still reads {now.stop} — "
                              f"nothing was changed")
    return Outcome(True, f"stop moved {old} → {now.stop} ({label}). "
                         f"Target {now.target or 'none'} intact.")


async def move_to_breakeven(p, creds: dict, account_type: str) -> Outcome:
    """The 1R rung: the net-zero price. Kept as a named entry point because breakeven is the one rung
    whose price is computed rather than given, and because it is the one he named."""
    return await move_stop_to(p, None, "breakeven, net of costs", creds, account_type)
