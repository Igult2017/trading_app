"""
A WAITING ORDER STAYS AT 1% RISK UNTIL IT FILLS — whatever moves its stop.

HIS TWO POINTS, 15 Nov 2026:
  *"sometimes after placing a fill order, spread increase or something happen that affects SL before
   entry, can you check that properly and see if we can adjust lot size and entry if that happens."*
  *"But you havent considered when the SL becomes bigger than we planned before the fill."*

WHAT WAS MISSING. The spread was used ONCE, when the signal fired: a BUY's entry is raised by one
spread (a buy stop triggers on the ask) and a SELL's stop is pushed out by one (it is closed on the
ask) — `strategies/vix1_entry.py`. The lots were fixed at placement (`placer.py`). While the order
waited, nothing looked at it again.

TWO RULES, RUN EVERY 2 SECONDS ON THE TRACKER'S CLOCK, AGAINST THE ORDER AS THE BROKER HOLDS IT:

  1. THE ORDER FOLLOWS THE SPREAD — the entry rule above, applied continuously instead of once. When
     the live spread differs from the one the order was built with by at least `_SPREAD_MOVE_PIPS`, a
     BUY's entry and a SELL's stop move by that difference, and the lots are re-sized to exactly 1%.
     Not done to an order HE has moved by hand: his levels are his.
  2. THE SIZE FOLLOWS THE STOP — his second point. Whatever made the entry-to-stop distance bigger
     than the lots were sized for (the spread, his own hand edit in Pepperstone, anything), the
     volume is CUT so the trade still risks 1%. A smaller distance never sizes up on its own.

At most one amend per order per `_AMEND_EVERY_S`, so a flickering spread cannot hammer the broker.

⚠ EVERY AMEND IS RECORDED (`storage/autotrade_changes`). The canceller reads any difference between
the broker and our record as "he moved it" and then never withdraws the order, and the fill is
recognised by its SIZE; an unrecorded amend would break both.

Never raises: it runs inside the tracker that moves stops on live trades.
"""
import logging
import time

from execution import guards
from execution.intents import _intent, pending_intents
from shared.pip import pip_size, price_digits

log = logging.getLogger(__name__)

#: How far the spread must move before the order follows it. Below this it is flicker.
_SPREAD_MOVE_PIPS = 0.3
#: At most one amend per order in this many seconds.
_AMEND_EVERY_S = 30.0
#: Same tolerance the canceller uses to call a level "moved by hand" (`canceller._MOVED_EPS_PIPS`).
_EPS_PIPS = 0.1

_last_amend: dict[str, float] = {}


def _moved_enough(delta: float, pip: float) -> bool:
    """Has the spread moved by at least the threshold? Rounded, so 0.3 pip computed as 0.29999… in
    floating point still counts (caught by the test's teeth, 15 Nov)."""
    return round(abs(delta) / pip, 6) >= _SPREAD_MOVE_PIPS
_told_failed: set[str] = set()


def decide(side: str, entry: float, sl: float, volume: int, spread_used: float,
           live_spread: float | None, pip: float, he_moved: bool, size_for):
    """What the waiting order should become, or None to leave it. Pure — `size_for(entry, sl)` returns
    (lots, volume, stop_pips) at 1% for those levels.

    Returns dict(entry, sl, lots, volume, stop_pips, spread, moved, why)."""
    new_entry, new_sl, spread, moved, why = entry, sl, None, False, []
    if not he_moved and live_spread is not None:
        delta = live_spread - spread_used
        if _moved_enough(delta, pip):
            if side == "BUY":
                new_entry = entry + delta
                why.append(f"spread {spread_used / pip:.1f}→{live_spread / pip:.1f}p, entry moved")
            else:
                new_sl = sl + delta
                why.append(f"spread {spread_used / pip:.1f}→{live_spread / pip:.1f}p, stop moved")
            spread, moved = live_spread, True
    lots, new_vol, pips = size_for(new_entry, new_sl)
    if not new_vol or new_vol <= 0:
        return None                     # cannot size honestly — leave the order exactly as it is
    if not moved:
        if new_vol >= volume:
            return None                 # rule 2 only ever CUTS the size
        why.append(f"stop is {pips:.1f}p, bigger than the size was set for")
    elif new_vol == volume and abs(new_entry - entry) < pip * 0.01 and abs(new_sl - sl) < pip * 0.01:
        return None
    return dict(entry=new_entry, sl=new_sl, lots=lots, volume=new_vol, stop_pips=pips,
                spread=spread, moved=moved, why="; ".join(why))


def _he_moved(intent: dict, live: dict, pip: float) -> bool:
    """Has he changed the entry or stop by hand? Compared against our IN-MEMORY record, which every
    amend of ours keeps in step — so no database read on the 2-second path."""
    tol = _EPS_PIPS * pip
    return any(intent.get(k) and live.get(k) and abs(float(live[k]) - float(intent[k])) > tol
               for k in ("entry", "sl"))


def _needs_look(intent: dict, live: dict, meta: dict, live_spread: float | None, pip: float,
                he_moved: bool) -> bool:
    """Cheap pre-check, so the account is only fetched when something may actually change."""
    if not he_moved and live_spread is not None and \
            _moved_enough(live_spread - float(intent.get("spread_used") or 0.0), pip):
        return True
    dist = abs(float(live["entry"]) - float(live["sl"])) / pip
    return dist > float(intent.get("stop_pips") or 0.0) + 0.05 or \
        int(meta["volume"]) > int(intent.get("volume") or 0)


async def check(send) -> None:
    """One pass over every autotrade order still waiting at the broker."""
    try:
        from data import ctrader_positions as cp, fix_quotes
        for oid, intent in list(pending_intents().items()):
            live, meta = cp.last_resting_levels(oid), cp.last_resting_meta(oid)
            if not live or not meta or "entry" not in live or "sl" not in live or not meta.get("volume"):
                continue                # not resting (filled, withdrawn) or not readable — leave it
            if time.monotonic() - _last_amend.get(oid, 0.0) < _AMEND_EVERY_S:
                continue
            sym = intent["symbol"]
            pip = pip_size(sym)
            q = fix_quotes.live_quote(sym)
            live_spread = (q[1] - q[0]) if q and q[0] and q[1] and q[1] > q[0] else None
            he = _he_moved(intent, live, pip)
            if _needs_look(intent, live, meta, live_spread, pip, he):
                await _adjust(oid, intent, live, meta, live_spread, pip, he, send)
    except Exception as exc:
        log.error(f"[resting_watch] {type(exc).__name__}: {exc}", exc_info=True)


async def _adjust(oid, intent, live, meta, live_spread, pip, he, send) -> None:
    from config.settings import settings
    from config import live_settings
    from execution.account import load_account
    from execution.placer import _usd_jpy_for
    from execution.sizing import plan_size
    acct = await load_account()
    if acct is None or not acct.risk_base:
        return
    sym, side = intent["symbol"], intent["side"]
    usd_jpy = await _usd_jpy_for(sym)

    def size_for(e, s):
        return plan_size(equity=acct.risk_base, entry=e, stop=s, symbol=sym,
                         risk_pct=live_settings.get('autotrade_risk_pct'), fixed_lots=settings.autotrade_fixed_lots,
                         max_lots=live_settings.get('autotrade_max_lots'), usd_jpy=usd_jpy)

    plan = decide(side, float(live["entry"]), float(live["sl"]), int(meta["volume"]),
                  float(intent.get("spread_used") or 0.0), live_spread, pip, he, size_for)
    _last_amend[oid] = time.monotonic()
    if plan is None:
        return
    from execution.broker import StopOrderClient
    res = await StopOrderClient(acct.creds, acct.account_type).amend_order(
        int(oid), sym, plan["volume"], plan["entry"], plan["sl"], meta.get("tp"), meta.get("expiry_ms"))
    d = price_digits(sym)
    if not res.ok:
        log.warning(f"[resting_watch] {sym} order {oid}: amend refused — {res.error}")
        if oid not in _told_failed:
            _told_failed.add(oid)
            await _say(send, f"⚠️ <b>WAITING ORDER NOT ADJUSTED</b> · {sym} {side}\n{plan['why']}\n"
                             f"the broker refused: {res.error}\n<i>order {oid} is unchanged</i>")
        return
    _record(oid, intent, plan)
    log.info(f"[resting_watch] {sym} order {oid}: {plan['why']} → {plan['lots']} lots")
    await _say(send, f"🔧 <b>WAITING ORDER ADJUSTED</b> · {sym} {side}\n{plan['why']}\n"
                     f"entry <code>{plan['entry']:.{d}f}</code> · stop <code>{plan['sl']:.{d}f}</code> "
                     f"({plan['stop_pips']:.1f}p)\n{intent.get('lots')} → <b>{plan['lots']} lots</b> "
                     f"to keep the risk at 1%")


def _record(oid: str, intent: dict, plan: dict) -> None:
    """Keep every record of the order in step with the broker — see the module note."""
    from storage import autotrade_changes
    moved = plan["moved"]
    autotrade_changes.record_amended(
        oid, lots=plan["lots"], volume=plan["volume"], stop_pips=plan["stop_pips"],
        entry=plan["entry"] if moved else None, stop=plan["sl"] if moved else None,
        spread_used=plan["spread"] if moved else None)
    intent.update(lots=plan["lots"], volume=plan["volume"], stop_pips=plan["stop_pips"])
    if moved:
        intent.update(entry=plan["entry"], sl=plan["sl"], spread_used=plan["spread"])
        if intent.get("signal_id"):         # the monitor judges the setup against the new levels
            from storage import signal_repo
            signal_repo.adopt_levels(intent["signal_id"], entry=plan["entry"], stop=plan["sl"])
    _intent[oid] = intent
    guards.note_volume(oid, plan["volume"])
    try:
        from monitor import position_book
        position_book.invalidate()
    except Exception:
        pass


async def _say(send, text: str) -> None:
    if send:
        from notifications import safe_notify
        await safe_notify.tell(send, text)
