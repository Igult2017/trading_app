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

  1. BOTH LEGS, ALWAYS. cTrader's REST surface DELETES a leg omitted from an amend (`Q-R10` in the
     ctrader-mcp-servers skill, flagged critical). The protobuf request has both fields
     optional-with-presence, so it can tell omitted from set and may behave the same way. This code
     does not rely on knowing which: it re-passes the position's CURRENT take profit every time.
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


def why_not(p, account_type: str) -> str | None:
    """The reason this position must NOT be amended, or None if it may be. Checked before any
    network call, so a refusal costs nothing and reaches the log with its reason intact."""
    if not settings.auto_breakeven_enabled:
        return "auto-breakeven is off"
    if settings.auto_breakeven_demo_only and (account_type or "").lower() != "demo":
        return f"account is '{account_type}', not demo — refusing to amend"
    if p.stop is None:
        return "no stop on this position — leaving it alone"
    be = p.breakeven()
    if be is None:
        return "breakeven price is unknown (position size not readable)"
    if not _better(be, p.stop, p.bullish):
        return f"stop {p.stop} already at or beyond breakeven {be:.5f} — nothing to do"
    return None


async def move_to_breakeven(p, creds: dict, account_type: str) -> Outcome:
    """Move this position's stop to its net-zero price. Never raises.

    Returns an Outcome whether it acted or not, so the caller can report the truth either way rather
    than inferring silence.
    """
    blocked = why_not(p, account_type)
    if blocked:
        return Outcome(False, blocked)
    be = p.breakeven()
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
        return Outcome(True, f"stop moved to {be:.5f}, but the position could not be re-read to "
                             f"confirm it — check your platform")
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
    return Outcome(True, f"stop moved {old} → {now.stop} (breakeven, net of costs). "
                         f"Target {now.target or 'none'} intact.")
