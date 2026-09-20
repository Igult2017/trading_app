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
from execution import liveness

log = logging.getLogger(__name__)

# Orders placed, newest last: (utc_time, symbol, direction, broker order id, volume).
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
_placed: list[tuple[datetime, str, str, str, int | None]] = []


def rehydrate() -> int:
    """Restore the last 24h of placements from the database. Call ONCE at boot. Returns how many."""
    try:
        from storage import autotrade_repo
        rows = autotrade_repo.recent_placements(24)
    except Exception as exc:                     # never block boot on this
        log.warning(f"[guards] could not restore recent placements: {type(exc).__name__}: {exc}")
        return 0
    known = set(_placed)
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


def record(symbol: str, direction: str, order_id: str | None = None,
           volume: int | None = None) -> None:
    """Log a placement against the caps. Called only after the broker ACCEPTS the order.

    The ORDER ID and VOLUME let rule 7 ask the broker whether this order is still alive (resting,
    or filled into a trade that is still open). Without them a withdrawn order looked exactly like
    a live one for 24 hours; see rule 7."""
    _placed.append((datetime.now(timezone.utc), symbol, direction, str(order_id or ""), volume))


def _recent(hours: int = 24) -> list[tuple[datetime, str, str, str, int | None]]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    return [p for p in _placed if p[0] >= cutoff]


def check(symbol: str, direction: str, strategy: str,
          account_type: str, equity: float, lots: float,
          book: tuple[list, set[int]] | None = None,
          stop_distance: float | None = None, spread: float | None = None) -> str | None:
    """None = place it. A string = refuse, and that string is the reason.

    `book` is what the broker has right now: open positions and the ids of resting orders, from ONE
    reply (`monitor.position_book.snapshot`). None means it could not be read. Only rule 7 uses it.

    `stop_distance` (entry to stop, in price) and `spread` (ask - bid right now) are only rule 8's.
    Both default to None, which that rule treats as "not measured" and lets through — see there.
    """

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
    #
    #    LIVE MEANS LIVE, fixed 2026-09-15. This refused on any order PLACED in the last 24h, and
    #    nothing ever took a dead one off the list. On 14 Sep his EUR/USD sell of 07:23 (order
    #    360658076) was withdrawn at 07:26, when price touched its stop side first. At 13:03 a new
    #    EUR/USD sell reached its entry and NO ORDER WAS SENT: refused as a "duplicate" of an order
    #    dead for five and a half hours. Proven from the broker's own order history.
    #
    #    An earlier order now blocks only while the broker still has it RESTING, or it FILLED into a
    #    trade that is still OPEN. If the broker cannot be read it refuses exactly as before, so
    #    this only ever lets through what the broker confirms is gone.
    for placed_at, s, d, order_id, volume in recent:
        if s != symbol or d != direction:
            continue
        if book is None:
            return (f"an order for {symbol} {direction} (order {order_id or '?'}) was placed in "
                    f"the last 24h and the broker could not be read to confirm it is gone")
        alive = liveness.why_alive(order_id, symbol, direction, volume, placed_at, book)
        if alive:
            return f"an order for {symbol} {direction} is still live: {alive}"

    # 8. A SELL'S STOP MUST BE WORTH SEVERAL SPREADS — his instruction, 2026-09-20, after the
    #    measurement below: *"build it and make sure it only refuses orders it is meant to refuse."*
    #
    #    WHY ONLY A SELL. A sell is closed by BUYING BACK, so its stop fires on the buy price, while
    #    the line and the pullback it was measured from are drawn on chart prices. A buy's stop fires
    #    on that same chart price, so the spread cannot reach it. Measured over 222 real fills with
    #    the broker's own bid AND ask ticks at every one (docs/strategies/vix1-measured.md): the year
    #    is +16.3R scored on the chart price and -21.6R scored on the price the trades really close
    #    at, and every bit of that 37.9R is on the sells. His 16 Sep GBP/USD sell is the shape of it
    #    — a 2.5-pip stop against a 2.6-pip spread at the fill, past its stop the moment it filled,
    #    gone in 1.2 seconds.
    #
    #    AND THE TEST THAT SAYS THIS IS THE SPREAD, NOT A FITTED NUMBER: the same filter applied to
    #    BUYS, where the mechanism says it must not help, drops +13.0R to +1.4R.
    #
    #    IT REFUSES THE ORDER, NOT THE SIGNAL. `dispatcher` sends the card and only then calls
    #    autotrade, so nothing here can suppress a Telegram signal — that is why the rule lives in
    #    this module and not in `vix1_entry`, where the B30 dead-setup check rightly kills the signal.
    mult = settings.autotrade_min_stop_spread
    if mult > 0 and (direction or "").upper() == "SELL":
        if spread is None or not spread or stop_distance is None:
            # UNMEASURED IS NOT THE SAME AS BAD, and this is a deliberate exception to the module's
            # "anything ambiguous refuses" rule (his instruction above). An unreadable spread does
            # not make a trade dangerous; refusing on it would silence autotrade on every feed
            # hiccup, which is refusing orders this rule was never meant to refuse.
            log.info(f"[guards] {symbol} {direction}: the spread could not be read, so the "
                     f"{mult:g}x-spread rule did not run — placing on the other gates alone")
        elif stop_distance < mult * spread:
            return (f"the stop is {stop_distance / spread:.1f}x the spread "
                    f"({stop_distance:.5f} against {spread:.5f}), under the {mult:g}x a sell needs: "
                    f"a sell is closed at the BUY price, so it starts "
                    f"{100 * spread / stop_distance:.0f}% of its own stop behind")

    return None


def reset() -> None:
    """Clear the in-process placement log — tests only."""
    _placed.clear()
