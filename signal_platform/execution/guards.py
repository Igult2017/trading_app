"""
The gates every order must clear before a single byte goes to the broker.

Each one answers "why might placing this be a mistake?", and they are deliberately boring and
independent — a guard that is clever is a guard nobody trusts. `check()` returns None to allow, or
a human-readable REASON to refuse, which is logged and DM'd. Refusing is always safe; placing is
not, so anything ambiguous refuses.

Order matters only for the message quality: the cheapest and most decisive checks run first so the
log says "autotrade is off" rather than "no equity" when both are true.
"""
import logging
from datetime import datetime, timedelta, timezone

from config.settings import settings

log = logging.getLogger(__name__)

# Orders placed, newest last: (utc_time, symbol, direction).
#
# RESTORED AT BOOT, and the reasoning that said it need not be is recorded here because it was WRONG.
# It read: *"In-memory ON PURPOSE — a restart resetting the daily cap is the SAFE failure (it can only
# ever allow the cap again after a crash, and the kill switch and the broker's own margin are the real
# limits)."*
#
# That is true of the DAILY CAP and it misses the other thing this same list does, twenty lines below:
# it enforces **one live order per symbol+direction**, whose own comment says it exists "so a dedup
# slip cannot become two real orders". Losing this list does not reset a counter — it removes a guard,
# and the first signal after a restart could place a SECOND real order on a setup already live.
#
# Same shape as the ladder's "fails in the safe direction", which cost a full R on 01 Sep: a degraded
# path called safe without measuring what it costs. His rule, 2026-09-03: *"you must persist any
# crucial memory."*
#
# NOTHING NEW IS WRITTEN. Every placement is already recorded durably in `autotrade_orders`; this is
# rebuilt from it ONCE at boot by `rehydrate()`, never read on the placement path.
_placed: list[tuple[datetime, str, str]] = []


def rehydrate() -> int:
    """Restore the last 24h of placements from the database. Call ONCE at boot. Returns how many."""
    try:
        from storage import autotrade_repo
        rows = autotrade_repo.recent_placements(24)
    except Exception as exc:                     # never block boot on this
        log.warning(f"[guards] could not restore recent placements: {type(exc).__name__}: {exc}")
        return 0
    known = {(t, s, d) for t, s, d in _placed}
    restored = 0
    for row in rows:
        if row not in known:
            _placed.append(row)
            restored += 1
    _placed.sort(key=lambda x: x[0])
    if restored:
        log.info(f"[guards] restored {restored} placement(s) from the last 24h — the daily cap and "
                 f"the one-order-per-symbol-and-direction guard survive the restart")
    return restored


def _csv(value: str) -> set[str]:
    return {v.strip().lower() for v in (value or "").split(",") if v.strip()}


def record(symbol: str, direction: str) -> None:
    """Log a placement against the caps. Called only after the broker ACCEPTS the order."""
    _placed.append((datetime.now(timezone.utc), symbol, direction))


def _recent(hours: int = 24) -> list[tuple[datetime, str, str]]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    return [p for p in _placed if p[0] >= cutoff]


def check(symbol: str, direction: str, strategy: str,
          account_type: str, equity: float, lots: float) -> str | None:
    """None = place it. A string = refuse, and that string is the reason."""

    # 1. THE KILL SWITCH. One flag, checked first, no exceptions and no overrides.
    if not settings.autotrade_enabled:
        return "autotrade is OFF (autotrade_enabled=false)"

    # 2. DEMO ONLY — checked at RUNTIME against the account we are about to trade, not assumed from
    #    config. The whole exercise is diagnostic; there is no version of it that needs a live
    #    account, and "someone pointed it at live by accident" is the failure that actually costs.
    if settings.autotrade_demo_only and (account_type or "").lower() != "demo":
        return f"account_type is {account_type!r}, and autotrade_demo_only is set"

    # 3. STRATEGY ALLOW-LIST. VIX.1 is the one being measured; BX has different entry semantics
    #    (limit, not stop) and must be opted in deliberately rather than inherited.
    allowed = _csv(settings.autotrade_strategies)
    if allowed and (strategy or "").lower() not in allowed:
        return f"strategy {strategy!r} is not in autotrade_strategies"

    # 4. SYMBOL ALLOW-LIST (empty = allow all).
    syms = _csv(settings.autotrade_symbols)
    if syms and (symbol or "").lower() not in syms:
        return f"symbol {symbol!r} is not in autotrade_symbols"

    # 4b. SESSION ALLOW-LIST — his instruction, 2026-08-31: *"I want you to make it trade during
    #     London and New York Sessions only."* Empty = any session.
    #
    #     THE WINDOWS ARE NOT DEFINED HERE. `get_current_sessions` computes them from each centre's
    #     real timezone, so daylight saving is handled and this agrees with what the sessions page
    #     shows. Writing "London is 08:00-17:00 UTC" here would be a second definition that drifts
    #     from the first twice a year.
    #
    #     REFUSES ON ERROR, like every other guard: if the session cannot be read we do not know
    #     whether we are inside the permitted window, and "ambiguous refuses" is the rule this
    #     module opens with.
    wanted = _csv(settings.autotrade_sessions)
    if wanted:
        try:
            from scheduler.session_windows import get_current_sessions
            active = {s.value.lower() for s in get_current_sessions()}
        except Exception as exc:
            return f"could not read the current session ({type(exc).__name__}) — refusing"
        if not (wanted & active):
            return (f"outside the permitted sessions — now: "
                    f"{', '.join(sorted(active - {'all'})) or 'none'}; allowed: "
                    f"{', '.join(sorted(wanted))}")

    # 5. SIZE. 0.0 means sizing could not be done honestly (no equity, no stop). Never guess.
    if lots <= 0:
        return "no honest size (equity or stop distance missing)"
    if equity <= 0:
        return "account equity unknown"

    # 6. DAILY CAP.
    recent = _recent(24)
    if len(recent) >= settings.autotrade_max_per_day:
        return (f"daily cap reached ({len(recent)}/{settings.autotrade_max_per_day} "
                f"orders in the last 24h)")

    # 7. ONE LIVE ORDER PER symbol+direction. The strategy's own dedup key already enforces one
    #    SIGNAL at a time; this is the same invariant at the broker, so a dedup slip cannot become
    #    two real orders. Same-symbol OPPOSITE direction is allowed — that is a genuine reversal.
    for _, s, d in recent:
        if s == symbol and d == direction:
            return f"an order for {symbol} {direction} was already placed in the last 24h"

    return None


def reset() -> None:
    """Clear the in-process placement log — tests only."""
    _placed.clear()
