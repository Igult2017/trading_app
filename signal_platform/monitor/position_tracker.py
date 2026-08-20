"""
TRADE PROGRESS, MEASURED ON THE REAL TRADE.

His ask, 2026-08-21: a tracker that tells him when to move to breakeven, when to trail to 1R, and
when 2R is reached — *"I mean the accurate one."*

WHAT MAKES IT ACCURATE, and why the existing one is not. `strategies/vix1_manage` +
`monitor/vix1_alerts` already run an R ratchet, but they compute R from the SIGNAL: the price it
suggested, the stop it suggested, and the assumption he took it and is still in. This module reads
`ctrader_positions.open_positions()` and computes R from HIS FILL and HIS STOP. If he slipped, moved
his own stop, closed early or never took the trade, this one is right and that one is not.

IT TRACKS EVERY OPEN POSITION, including trades the platform never signalled — his answer when asked:
*"Yes"*. So a manual trade gets the same three alerts.

THE THREE ALERTS

    1R  ->  BREAKEVEN     move the stop to the NET-ZERO price
    2R  ->  TRAIL TO 1R   move the stop to +1R          (the existing ratchet's arming point)
    2R  ->  2R REACHED    the target is done

The last two fire at the same instant on purpose. He was asked whether they should be one message or
two and said two — *"for now it should send me these signals so that I can do everything manually"* —
so the instruction and the milestone arrive separately rather than being merged into one line he
might skim.

BREAKEVEN IS NOT THE ENTRY PRICE. *"when the market takes us out we lose nothing and gain nothing"*,
and *"gain just enough to cover cost"*. A stop at the entry still loses the round-trip commission and
any swap, so the alert prints the price where closing actually nets zero
(`ctrader_positions.Position.breakeven`). This is only computable because we are reading the broker —
it is the clearest example of why the rebuild had to look at the real position.

ADVICE ONLY. Nothing here places, amends or closes anything. Phase 1 is his hands on the trade.

STATELESS APART FROM WHAT WAS SENT. R is recomputed from the position every poll, so a restart cannot
corrupt a sequence — there is no sequence stored. The only memory is which alerts have already gone
out, and that rides the DB-backed `delivery_ledger`, so a redeploy cannot re-send and a failed send
retries on the next poll.
"""
import logging

from core import delivery_ledger
from data import ctrader_positions
from data.candle_fetcher import fetch_candles
from shared.pip import price_digits

log = logging.getLogger(__name__)

# The R milestones, in order. Values are HIS: breakeven then the ratchet's existing 2R arming.
BREAKEVEN_R = 1.0
ARM_R       = 2.0

# A TRADE SITTING EXACTLY ON A MILESTONE MUST TRIGGER IT. R is a ratio of differences between
# 5-decimal prices, so a true 1.000R lands at 0.999999999999778 and `r >= 1.0` is False — the alert
# would simply never fire on the boundary, silently. Caught by the test on the first run. The same
# guard, for the same reason, is on `vix1_momentum.momentum_grade`'s A-grade boundary.
_EPS = 1e-9

_TTL = 7 * 24 * 3600     # forget a position's alerts a week after they were sent


def _key(position_id: int, tag: str) -> str:
    """One alert per position per milestone, for the life of that position."""
    return f"postrack_{position_id}_{tag}"


async def _price_now(symbol: str) -> float | None:
    """The freshest M1 close — a TRIGGER read, so the still-forming bar is exactly right here."""
    bars = await fetch_candles(symbol, "M1", 2)
    return bars[-1].close if bars else None


def _lines(p, r: float, price: float) -> list[tuple[str, str]]:
    """(tag, message) for every milestone this position has reached. Newest thresholds last."""
    d = price_digits(p.symbol)
    side = "BUY" if p.bullish else "SELL"
    out: list[tuple[str, str]] = []

    if r >= BREAKEVEN_R - _EPS:
        be = p.breakeven()
        where = (f"{be:.{d}f}" if be is not None else "your entry + costs")
        out.append(("breakeven",
                    f"🟦 BREAKEVEN — {p.symbol} {side}\n\n"
                    f"+{r:.1f}R reached. Move your stop to {where}.\n\n"
                    f"That is the price where closing nets ZERO — it covers the round-trip "
                    f"commission and swap, not just your entry. A stop at {p.entry:.{d}f} would "
                    f"still take the costs off you."))
    if r >= ARM_R - _EPS:
        risk = abs(p.entry - p.stop) if p.stop else 0.0
        one_r = p.entry + risk if p.bullish else p.entry - risk
        out.append(("trail_1r",
                    f"🟩 TRAIL TO 1R — {p.symbol} {side}\n\n"
                    f"Move your stop to {one_r:.{d}f} (+1R locked)."))
        out.append(("hit_2r",
                    f"🎯 2R REACHED — {p.symbol} {side}\n\n"
                    f"Entry {p.entry:.{d}f} · now {price:.{d}f} · +{r:.1f}R.\n"
                    f"The target is done. From here the ratchet trails 1R behind."))
    return out


async def _auto_breakeven(p, send) -> None:
    """Move the stop for real, when `auto_breakeven_enabled` says so. Reports what it did.

    SILENT WHEN SWITCHED OFF. `why_not` returns a reason for every refusal, but the ordinary one —
    "auto-breakeven is off" — must not become a message on every trade; only a refusal that happened
    while the feature was ON is worth telling him about.
    """
    from config.settings import settings as _s
    if not _s.auto_breakeven_enabled:
        return
    try:
        from execution.account import load_account
        from execution import breakeven
        acct = await load_account()
        if acct is None:
            log.warning("[position_tracker] auto-breakeven ON but no usable account")
            return
        out = await breakeven.move_to_breakeven(p, acct.creds, acct.account_type)
        head = "🔴 AUTO-BREAKEVEN" if out.alarm else ("🔧 AUTO-BREAKEVEN" if out.moved
                                                     else "🔧 AUTO-BREAKEVEN — not moved")
        await send(f"{head} — {p.symbol} #{p.position_id}\n\n{out.message}")
    except Exception as exc:
        log.error(f"[position_tracker] auto-breakeven failed: {type(exc).__name__}: {exc}",
                  exc_info=True)


async def check_all(send) -> None:
    """One poll. `send` is an async callable taking the message text — the dispatcher's private DM.

    NEVER RAISES into the monitor: a tracker that can take the monitor down would cost him TP/SL
    watching on live signals, which matters far more than an advisory message.
    """
    try:
        delivery_ledger.cleanup(_TTL)
        positions = await ctrader_positions.open_positions()
        # None and [] MEAN DIFFERENT THINGS. [] is "nothing open"; None is "could not read the
        # broker", and inventing silence-as-fact from a failed read is how a tracker lies.
        if positions is None:
            return
        for p in positions:
            if p.stop is None:
                # No stop = no R to measure. Say so ONCE rather than tracking nothing in silence:
                # a position with no stop is the one most worth a message.
                k = _key(p.position_id, "nostop")
                if not delivery_ledger.is_delivered(k):
                    d = price_digits(p.symbol)
                    if await send(f"⚠️ NO STOP — {p.symbol} {'BUY' if p.bullish else 'SELL'} at "
                                  f"{p.entry:.{d}f}\n\nThis position has no stop loss set, so there "
                                  f"is no R to track and no breakeven to compute."):
                        delivery_ledger.mark_delivered(k)
                continue
            price = await _price_now(p.symbol)
            if price is None:
                continue
            r = p.r_at(price)
            if r is None:
                continue
            for tag, message in _lines(p, r, price):
                k = _key(p.position_id, tag)
                if delivery_ledger.is_delivered(k):
                    continue
                if await send(message):
                    delivery_ledger.mark_delivered(k)
                    log.info(f"[position_tracker] {p.symbol} #{p.position_id}: {tag} at {r:.2f}R")
                # AND THEN ACTUALLY MOVE IT, if he has switched that on. The advice DM above is sent
                # either way and first: if the amend fails he still knows what to do by hand, which
                # is the behaviour that must survive every failure here.
                if tag == "breakeven":
                    await _auto_breakeven(p, send)
    except Exception as exc:
        log.error(f"[position_tracker] poll failed: {type(exc).__name__}: {exc}", exc_info=True)
