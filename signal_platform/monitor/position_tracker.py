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

THE LADDER LIVES IN `monitor/rungs.py` AND IS PER STRATEGY. It used to be two ladders with
different numbers — this file at 1R, `vix1_manage` at 2R — for the same trade.

VIX.1, his numbers of 2026-09-02 (superseding 2026-08-21, which had withdrawn the 2.5R rung):

    0.4R  ->  BREAKEVEN     the stop goes to the NET-ZERO price
    2.0R  ->  LOCK +1R
    2.1R+ ->  TRAIL, keeping the stop 0.1R behind, in 0.1R steps, until it is hit

Everything else — and any position that cannot be attributed to a strategy — keeps the older
1R/2R/3R/4R ladder unchanged. A take profit resting on the ORDER still performs the exit; the top
rung exists so a failed exit still banks the locked gain.

2R IS NOT THE TARGET ANY MORE: *"when the trade has the momentum to keep going we take up to where
the momentum starts dying down so 2R is not a rule but only applies where there is no momentum."* The
"momentum dying" case is the 1M structure exit that `vix1_manage` already owns.

Each rung sends its own message and moves the stop for real when the switch is on — he asked for
both: *"for now it should send me these signals so that I can do everything manually"*, then
*"can you create it such that it is moved automatically"*.

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
from notifications import titles
from data import ctrader_positions, ctrader_spread
from data.candle_fetcher import fetch_candles
from shared.pip import price_digits

log = logging.getLogger(__name__)

# THE LADDER NOW LIVES IN ONE PLACE — `monitor/rungs.py`. It used to be defined here AND, with
# different numbers, in `vix1_manage`: this file broke even at 1R, that one did nothing below 2R.
# So the DM advising him and the code moving his stop could disagree about the same position. He
# asked for them merged; the table is the merge.
#
# HIS LADDER, 2026-09-02: breakeven at 0.4R, lock +1R at 2.0R, then TRAIL 0.1R behind in 0.1R steps
# ("when price moves to 2.1R lock 2R... and go with that math until we are stopped out"). The old
# fixed 2.5R -> lock 2R rung is gone: the trail protects +2R from 2.1R, earlier and higher. Trailing
# tenths move the stop QUIETLY — see `Rung.quiet` in rungs.py.
#
# PER STRATEGY, because a broker `Position` carries no strategy and a global constant would apply
# VIX.1's numbers to every other strategy's trades. `fill_watch.owner_of` answers it; an
# unattributed position keeps the OLD defaults.
from execution.fill_watch import owner_of
from monitor import rungs
from notifications import safe_notify as notify
from monitor.rungs import EPS as _EPS

_TTL = 7 * 24 * 3600     # forget a position's alerts a week after they were sent

# WHAT THE TRACKER SAW LAST TIME, so a line is logged when it CHANGES and not on every 30s poll.
#
# WHY THIS EXISTS. On the night it shipped it worked perfectly — sent the right DM at the right
# moment — and I reported it BROKEN, because it logged nothing at all and silence looked identical
# to failure. I could not tell "no positions", "could not read the broker", "nothing has reached a
# rung" and "working fine" apart from the outside. That is the same defect as a heartbeat nobody can
# read: a thing whose success and failure look the same cannot be operated.
_last_seen: str = ""


def _key(position_id: int, tag: str) -> str:
    """One alert per position per milestone, for the life of that position."""
    return f"postrack_{position_id}_{tag}"


async def _price_now(symbol: str, bullish: bool | None = None) -> float | None:
    """The price this position's stop would actually trigger on. LIVE, and the correct SIDE of it.

    WHAT THIS USED TO DO, AND WHY IT WAS WRONG (fixed 2026-08-30). It returned the last M1 close and
    its docstring claimed that was "the still-forming bar". It was not. The feed serves CLOSED bars
    ONLY — `candle_cache.py:43`, verified against the live broker over 14 polls — and a forming bar
    is appended by the STRATEGY RUNNER alone, opt-in, for `wants_forming = [TF.H1]`. This module
    calls `fetch_candles` directly, so it got the last completed minute. Stacked up:

        up to 60s   the M1 bar only closes once a minute
        up to 20s   the M1 cache (`_FAST_TF_TTL`)
        up to 30s   the monitor's own poll interval

    — a trigger price that could be nearly two minutes old, while `ctrader_spread.quote_for()` sat
    in the same codebase describing itself as "the platform's ONLY genuinely current price".

    AND THE SIDE MATTERS AS MUCH AS THE AGE. A buy's stop triggers on the BID, a sell's on the ASK.
    That is not a refinement — `breakeven.py:78` records a real demo position CLOSED INSTANTLY on
    2026-08-21 because a stop was set the wrong side of the market. `why_not` refuses exactly that,
    by comparing against the price handed to it, so handing it a stale mid-ish candle close made the
    guard check something the market had already left.

    FALLS BACK to the old M1 close if the quote is unavailable. A tracker that goes silent because a
    quote missed is worse than one reading a slightly older price, and `quote_for` returns None on
    any failure by design.
    """
    if bullish is not None:
        quote = await ctrader_spread.quote_for(symbol)
        if quote is not None:
            bid, ask = quote
            return bid if bullish else ask
    bars = await fetch_candles(symbol, "M1", 2)
    return bars[-1].close if bars else None


def _lines(p, r: float, price: float, strategy: str | None = None) -> list[tuple[str, str]]:
    """(tag, price, message) for every milestone this position has reached. Lowest rung first.

    THE RUNGS COME FROM THE SHARED TABLE, keyed on which strategy opened this position, so the DM
    written here and the amend performed by `_auto_move` can never be built from different numbers.
    `strategy` of None means we could not attribute it, and `ladder_for` then returns the OLD
    defaults — never VIX.1's.
    """
    d = price_digits(p.symbol)
    side = "BUY" if p.bullish else "SELL"
    risk = abs(p.entry - p.stop) if p.stop else 0.0
    out: list[tuple[str, str]] = []

    for rung in rungs.reached(rungs.ladder_for(strategy), r, rungs.trail_for(strategy)):
        if rung.lock_r is None:
            be = p.breakeven()
            where = (f"{be:.{d}f}" if be is not None else "your entry + costs")
            out.append((rung.tag, be,
                        titles.header(titles.MOVE_TO_BREAKEVEN, titles.TRADE_MANAGEMENT,
                                      p.symbol, side) + "\n\n"
                        f"+{r:.1f}R reached. Move your stop to {where}.\n\n"
                        f"That is the price where closing nets ZERO — it covers the round-trip "
                        f"commission and swap, not just your entry. A stop at {p.entry:.{d}f} would "
                        f"still take the costs off you."))
            continue
        lock_at = rungs.stop_price_for(rung, p.entry, risk, p.bullish)
        if rung.quiet:
            # A trailing tenth. The stop still moves; his phone does not ring. `None` for the
            # message is the caller's signal to skip the send and go straight to the amend.
            out.append((rung.tag, lock_at, None))
            continue
        tail = ("\n\nThe take profit sits on the ORDER, so the broker does the exit — this locks the "
                "gain first so a failed exit still banks it." if rung.at_r >= 4.0 else "")
        out.append((rung.tag, lock_at,
                    titles.header(titles.lock(rung.lock_r), titles.TRADE_MANAGEMENT, p.symbol, side,
                                  emoji=titles.LOCK_EMOJI) + "\n\n"
                    f"+{r:.1f}R reached. Move your stop to {lock_at:.{d}f}.{tail}"))
    return out


# How many times a lock may quietly fail before he is told out loud. A retry is cheap and usually
# succeeds on the next pass; three in a row means something is actually wrong.
_ESCALATE_AFTER = 3
# position_id + tag -> how many times the amend has failed. In memory: after a restart the count
# resets, which only costs a later escalation and never a missed retry.
_fails: dict[str, int] = {}


async def _auto_move(p, tag: str, new_sl: float | None, send, price: float | None = None,
                     quiet: bool = False) -> bool | None:
    """Move the stop for real, when the switch says so.

    RETURNS whether the stop is now AT OR BEYOND the target — True = protected, False = it is not,
    None = the switch is off so there is nothing to confirm. **The caller uses this to decide
    whether the rung is finished.** Before 2026-09-02 this returned nothing and the caller marked
    the rung done BEFORE calling here, so a refused or timed-out amend was never retried: the
    platform said "+2.4R locked", the stop stayed where it was, and the market could take back
    everything above it. His instruction — *"make sure whatever is locked is never taken by the
    market"* — is this return value.

    `quiet` SUPPRESSES THE ROUTINE SUCCESS MESSAGE ONLY. He asked for no "+1R locked" DMs. A FAILURE
    is always reported, however quiet the rung: a silent lock that did not happen is the exact thing
    this change exists to prevent.

    ONE PATH FOR THE WHOLE LADDER. Breakeven and each lock differ only in the price they aim at;
    every guard lives in `execution.breakeven.move_stop_to` and applies identically. A separate
    branch per rung would be a separate place for the both-legs rule to be forgotten.

    SILENT WHEN SWITCHED OFF. `why_not` returns a reason for every refusal, but the ordinary one —
    "auto-breakeven is off" — must not become a message on every trade; only a refusal that happened
    while the feature was ON is worth telling him about.
    """
    from config.settings import settings as _s
    if not _s.auto_breakeven_enabled:
        return None
    k = f"{p.position_id}:{tag}"
    try:
        from execution.account import load_account
        from execution import breakeven
        acct = await load_account()
        if acct is None:
            log.warning("[position_tracker] auto-move ON but no usable account")
            return False
        label = "breakeven, net of costs" if tag == "breakeven" else tag.replace("_", " ")
        # THE LIVE PRICE GOES WITH IT. A stop on the wrong side of the market is a market close, not
        # a stop — proved on a real demo position, 2026-08-21. The tracker already has the price it
        # measured R from, so the guard costs nothing.
        out = await breakeven.move_stop_to(p, new_sl if tag != "breakeven" else None,
                                           label, acct.creds, acct.account_type, price)
        # THE STOP BEING ALREADY THERE IS SUCCESS, NOT FAILURE. `move_stop_to` is ratchet-only and
        # returns moved=False with "already at or beyond" when there is nothing to do; treating that
        # as a failure would retry it for ever.
        settled = bool(out.moved) or "already at or beyond" in (out.message or "")
        if settled:
            _fails.pop(k, None)
        else:
            _fails[k] = _fails.get(k, 0) + 1

        kind = (titles.TAKE_PROFIT_MISSING if out.alarm
                else titles.STOP_MOVED if out.moved else titles.STOP_NOT_MOVED)
        # Say nothing when a quiet rung simply worked. Everything else speaks.
        if not (quiet and settled and not out.alarm):
            # BOUNDED. The amend has already happened by this point, but a stalled send here would
            # hold up the NEXT position in the same pass — `tell` caps it at 3s and never raises.
            notify.tell_soon(send, titles.header(kind, titles.TRADE_MANAGEMENT, p.symbol,
                                                "BUY" if p.bullish else "SELL",
                                                extra=f"#{p.position_id}") + f"\n\n{out.message}")

        # THREE FAILURES IN A ROW AND HE IS TOLD PLAINLY, once. Retrying quietly for ever would be
        # its own kind of silence, which is what he asked me to design out.
        if _fails.get(k, 0) == _ESCALATE_AFTER:
            d = price_digits(p.symbol)
            target = f"{new_sl:.{d}f}" if new_sl is not None else "breakeven"
            notify.tell_soon(send, titles.header(titles.STOP_NOT_MOVED, titles.TRADE_MANAGEMENT,
                                     p.symbol,
                                     "BUY" if p.bullish else "SELL",
                                     extra=f"#{p.position_id}") + "\n\n"
                       f"<b>This stop has failed to move {_ESCALATE_AFTER} times.</b> It should be "
                       f"at <code>{target}</code> and it is not, so that gain is NOT protected.\n\n"
                       f"Broker's reason: {out.message}\n\n"
                       f"<i>It keeps retrying — but move it by hand if you can.</i>")
        return settled
    except Exception as exc:
        _fails[k] = _fails.get(k, 0) + 1
        log.error(f"[position_tracker] auto-move failed: {type(exc).__name__}: {exc}",
                  exc_info=True)
        return False


async def check_all(send) -> None:
    """One poll. `send` is an async callable taking the message text — the dispatcher's private DM.

    NEVER RAISES into the monitor: a tracker that can take the monitor down would cost him TP/SL
    watching on live signals, which matters far more than an advisory message.
    """
    global _last_seen
    try:
        delivery_ledger.cleanup(_TTL)
        positions = await ctrader_positions.open_positions()
        # DID AN AUTOTRADE ORDER FILL? Same poll, same positions, no extra broker read — the
        # fill price lives on the position and this is the only place it is already fetched.
        from monitor import exit_watch
        # None and [] MEAN DIFFERENT THINGS. [] is "nothing open"; None is "could not read the
        # broker", and inventing silence-as-fact from a failed read is how a tracker lies.
        if positions is None:
            if _last_seen != "unreadable":
                _last_seen = "unreadable"
                log.warning("[position_tracker] could not read the broker — NOT the same as "
                            "'no positions open'; nothing will be tracked until it answers")
            return
        # ONE LINE WHEN THE PICTURE CHANGES — every position, its R and what is holding it back.
        # Logged before any alert, so the record exists even when nothing is sent, which is exactly
        # the case that was unreadable before.
        summary = []
        for p in positions:
            if p.stop is None:
                summary.append(f"{p.symbol}#{p.position_id} NO-STOP @{p.entry}")
                continue
            px = await _price_now(p.symbol, p.bullish)
            r = p.r_at(px) if px else None
            summary.append(f"{p.symbol}#{p.position_id} {'BUY' if p.bullish else 'SELL'} "
                           f"{r:+.2f}R stop={p.stop}" if r is not None
                           else f"{p.symbol}#{p.position_id} R=? (no price)")
        line = "; ".join(summary) or "no open positions"
        if line != _last_seen:
            _last_seen = line
            log.info(f"[position_tracker] {len(positions)} position(s): {line}")

        # The R each position reached this poll, handed to `exit_watch` at the end so the exit
        # message can report how far the trade actually ran before it closed.
        r_seen: dict[int, float] = {}
        for p in positions:
            if p.stop is None:
                # No stop = no R to measure. Say so ONCE rather than tracking nothing in silence:
                # a position with no stop is the one most worth a message.
                k = _key(p.position_id, "nostop")
                if not delivery_ledger.is_delivered(k):
                    d = price_digits(p.symbol)
                    if await notify.tell(send, titles.header(titles.NO_STOP, titles.TRADE_MANAGEMENT, p.symbol,
                                                "BUY" if p.bullish else "SELL") + "\n\n"
                                  f"Opened at {p.entry:.{d}f}. This position has no stop loss set, "
                                  f"so there is no R to track and no breakeven to compute."):
                        delivery_ledger.mark_delivered(k)
                        log.info(f"[position_tracker] {p.symbol} #{p.position_id}: "
                                 f"no-stop notice sent")
                continue
            price = await _price_now(p.symbol, p.bullish)
            if price is None:
                continue
            r = p.r_at(price)
            if r is None:
                continue
            r_seen[int(p.position_id)] = r
            for tag, new_sl, message in _lines(p, r, price, owner_of(p.position_id)):
                k = _key(p.position_id, tag)
                if delivery_ledger.is_delivered(k):
                    continue
                # THE TRADE FIRST, THE MESSAGE AFTER — his rule, 2026-09-02: *"the logic that
                # places trades, moves it to BE and locks Rs... should not be affected by telegram
                # messages or telegram not working. It is the lifeline of a trade."*
                #
                # The send used to be awaited HERE, before the amend, and `dispatcher._send_text`
                # can take ~25s against a dead Telegram (3 retries, 5s sleeps, 5s client timeouts).
                # The message now goes out immediately AFTER the amend — and carries the amend's
                # real outcome rather than a prediction of it.
                moved = await _auto_move(p, tag, new_sl, send, price, quiet=(message is None))

                # NOT AWAITED WHEN THE PLATFORM IS MANAGING THE TRADE. With auto-move ON the rung is
                # decided by the broker's confirmation, so Telegram's answer is not needed — and
                # waiting even 3s for it would queue up in front of the NEXT position's amend.
                # With auto-move OFF the DM is the whole job, so its result is needed and is waited
                # for; nothing is being traded on that path anyway.
                if moved is None:
                    told = await notify.tell(send, message)
                else:
                    notify.tell_soon(send, message)
                    told = True

                # THE RUNG IS ONLY DONE WHEN THE STOP IS REALLY AT THE BROKER.
                #
                # This used to mark it done BEFORE the amend, so a refused or timed-out amend was
                # never retried — the platform reported "+2.4R locked" while the stop sat where it
                # was, and the market could take back everything above it. His instruction: *"make
                # sure whatever is locked is never taken by the market"*.
                #
                # `moved is None` means auto-move is OFF, so the DM is pure advice and being sent IS
                # the whole job. Otherwise the broker's confirmation decides, and a False leaves the
                # rung unmarked so the next pass tries again.
                done = told if moved is None else bool(moved)
                if done:
                    delivery_ledger.mark_delivered(k)
                    log.info(f"[position_tracker] {p.symbol} #{p.position_id}: {tag} at {r:.2f}R"
                             f"{' (quiet)' if message is None else ''}")
                else:
                    log.warning(f"[position_tracker] {p.symbol} #{p.position_id}: {tag} at {r:.2f}R "
                                f"NOT protected — will retry next poll")

        # THE REPORTING HAPPENS AFTER EVERY AMEND. Both of these await Telegram — they need its
        # answer to know whether to retry — and both used to run BEFORE the stop moves, putting a
        # bounded 3-second wait in front of every trade action in the poll. His rule, 2026-09-02:
        # *"the logic that places trades, moves it to BE and locks Rs... should not be affected by
        # telegram messages or telegram not working."* Neither report is time-critical; the amends
        # are.
        from execution.fill_watch import check_fills
        await check_fills(positions, send)

        # ARE WE OUT? Nothing used to answer that: a position closing at a MOVED stop — breakeven,
        # +1R, a trailed level — touches none of the SIGNAL's original levels, so `signal_monitor`
        # stayed silent and the position simply stopped appearing here.
        #
        # THIS RUNS LAST, AFTER EVERY AMEND, and that ordering is deliberate. It is the one send on
        # this path that is AWAITED — it needs Telegram's answer to know whether to retry the only
        # notice he gets that a trade is over. Running it first (as it did) put a bounded 3-second
        # wait in front of every stop move in the poll; running it last costs the trading path
        # nothing. It still only needs to happen before `observe`, which is right below it.
        await exit_watch.announce_closed(positions, send)

        # REMEMBER WHAT WE JUST SAW, with the R each position reached, so that when one disappears
        # the exit message can say what its stop was protecting and how far it ran.
        exit_watch.observe(positions, r_seen)
    except Exception as exc:
        log.error(f"[position_tracker] poll failed: {type(exc).__name__}: {exc}", exc_info=True)
