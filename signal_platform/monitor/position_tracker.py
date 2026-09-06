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
different numbers — this file at 1R, `vix1_manage` at 2R — for the same trade. One table now.

VIX.1, his numbers of 2026-09-02 (superseding 2026-08-21, which had withdrawn the 2.5R rung):

    0.4R  ->  BREAKEVEN     the stop goes to the NET-ZERO price
    1.5R  ->  LOCK +1R
    2.1R+ ->  TRAIL, keeping the stop 0.1R behind, in 0.1R steps, until it is hit

THIS IS THE ONLY LADDER. Every position on the account uses it — his ruling, 2026-09-02: *"There is
no fallback, the change was that we use this new ladder and delete the other one."* A take profit
resting on the ORDER still performs the exit; the rungs exist so a failed exit still banks the gain.

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
import time

from core import delivery_ledger
from notifications import titles
from data import ctrader_spread, fix_quotes
from monitor import position_book
from data.candle_fetcher import fetch_candles
from shared.pip import price_digits

log = logging.getLogger(__name__)

# THE LADDER NOW LIVES IN ONE PLACE — `monitor/rungs.py`. It used to be defined here AND, with
# different numbers, in `vix1_manage`: this file broke even at 1R, that one did nothing below 2R.
# So the DM advising him and the code moving his stop could disagree about the same position. He
# asked for them merged; the table is the merge.
#
# HIS LADDER, 2026-09-03: breakeven at 0.4R, lock +1R at 1.5R, then TRAIL 0.1R behind in 0.1R steps
# ("when price moves to 2.1R lock 2R... and go with that math until we are stopped out"). The old
# fixed 2.5R -> lock 2R rung is gone: the trail protects +2R from 2.1R, earlier and higher. Trailing
# tenths move the stop QUIETLY — see `Rung.quiet` in rungs.py.
#
# ONE LADDER FOR EVERY POSITION, and the second one is deleted. It used to be chosen per strategy,
# from a map held in memory — so a restart made a position unattributed and handed it the OLD numbers
# (breakeven 1.0R). His EUR/USD trade of 01 Sep peaked at +0.50R, between the two breakevens, and
# took a full -1R loss where this ladder would have scratched it. See the note in rungs.py.
from monitor import rungs
from notifications import safe_notify as notify
from monitor.rungs import EPS as _EPS

_TTL = 7 * 24 * 3600     # forget a position's alerts a week after they were sent

# HOW OLD A PUSHED PRICE MAY BE AND STILL DECIDE WHERE A STOP GOES.
#
# `fix_quotes._FRESH_S` is 15 seconds, and that is right for what it was written for: enriching a bar
# that would otherwise be up to 80 seconds old. It is far too much rope for a STOP. Three seconds is
# enough to ride out a quiet moment in a slow pair and short enough that a dying stream drops us onto
# the requested quote long before a fast move could take a rung with us none the wiser.
_TICK_FRESH_S = 3.0

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

    THREE SOURCES, BEST FIRST — added 2026-09-06 on his ask: *"Can we make both of them to use FIX
    data and only fallback to late data but immediately FIX data is there it goes back to tick
    data?"*

        1. the PUSHED tick price   in memory, arrives on its own, costs nothing
        2. the REQUESTED quote     a broker round trip, current but not free
        3. the last closed M1 bar  up to ~80s old; only when both above are unavailable

    This is the SAFETY NET, and until now it was the only one of the three stop-watching components
    NOT reading tick prices — it went straight to (2). Falling back and coming back are automatic:
    `live_quote` returns None the instant no stream is healthy, and a real pair again the instant one
    is, so there is no state to manage and nothing to reset.

    THE STALENESS BAR IS TIGHTER HERE THAN THE DEFAULT. `fix_quotes._FRESH_S` is 15 seconds,
    deliberately generous because its original job was beating an 80-second-old bar. This decides
    where a STOP goes, so 15 seconds is far too much rope: anything older than `_TICK_FRESH_S` drops
    through to the requested quote rather than being trusted.

    THE SIDED PRICE, NEVER THE MID. `live_price()` exists and returns the mid — using it here would
    be a bug of exactly the kind `breakeven.py:78` records costing a real position, and
    `fix_quotes.py:110-113` says so in as many words.
    """
    if bullish is not None:
        # 1. the pushed price, read straight out of memory
        tick = fix_quotes.live_quote(symbol, _TICK_FRESH_S)
        if tick is not None:
            bid, ask = tick
            return bid if bullish else ask
        # 2. ask the broker
        quote = await ctrader_spread.quote_for(symbol)
        if quote is not None:
            bid, ask = quote
            return bid if bullish else ask
    # 3. the last closed minute — better than going silent
    bars = await fetch_candles(symbol, "M1", 2)
    return bars[-1].close if bars else None


def _lines(p, r: float, price: float) -> list[tuple[str, str]]:
    """(tag, price, message) for every milestone this position has reached. Lowest rung first.

    THE RUNGS COME FROM THE SHARED TABLE, so the DM written here and the amend performed by
    `_auto_move` can never be built from different numbers. There is ONE table and no selection —
    nothing to get wrong, and nothing to lose across a restart.
    """
    d = price_digits(p.symbol)
    side = "BUY" if p.bullish else "SELL"
    risk = abs(p.entry - p.stop) if p.stop else 0.0
    out: list[tuple[str, str]] = []

    for rung in rungs.reached(rungs.ladder(), r, rungs.trail()):
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
        #
        # AND IT IS TIMED, because "faster" has to become a number. His worry, 2026-09-06: *"sometimes
        # a market moves very fast so if it is not first we can lose money in no time."* Until now
        # nothing recorded how long a rung actually took to reach the broker, so the only answer
        # available was reasoning about the code. This is the measurement — one line per stop move,
        # in milliseconds, whichever path made it.
        _t0 = time.monotonic()
        out = await breakeven.move_stop_to(p, new_sl if tag != "breakeven" else None,
                                           label, acct.creds, acct.account_type, price)
        _ms = (time.monotonic() - _t0) * 1000.0
        log.info(f"[stop-move] {p.symbol} #{p.position_id} {tag}: "
                 f"{'moved' if out.moved else 'NOT moved'} in {_ms:.0f}ms "
                 f"(price {price}, target {new_sl if tag != 'breakeven' else 'breakeven'})")
        # THE STOP BEING ALREADY THERE IS SUCCESS, NOT FAILURE. `move_stop_to` is ratchet-only and
        # returns moved=False with "already at or beyond" when there is nothing to do; treating that
        # as a failure would retry it for ever.
        settled = bool(out.moved) or "already at or beyond" in (out.message or "")
        if settled:
            _fails.pop(k, None)
        else:
            _fails[k] = _fails.get(k, 0) + 1

        # THE CACHED POSITION NOW HAS THE OLD STOP ON IT. Every path shares one view of what is open
        # (`monitor/position_book`), and the ratchet in `execution.breakeven` compares the new target
        # against the stop it can see — so handing it a pre-move copy would make an already-done rung
        # look undone. The delivery ledger stops that being ACTED on twice, but there is no reason to
        # lean on the ledger for a fact we already know here.
        if out.moved:
            position_book.invalidate()

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


async def _one_position(p, send, r_seen: dict) -> None:
    """Everything this poll does for ONE position. Extracted 2026-09-02 so a fault in it can be
    contained — see the guard in `check_all`."""
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
        return          # nothing more to do for THIS position
    price = await _price_now(p.symbol, p.bullish)
    if price is None:
        return          # nothing more to do for THIS position
    r = p.r_at(price)
    if r is None:
        return          # nothing more to do for THIS position
    r_seen[int(p.position_id)] = r
    for tag, new_sl, message in _lines(p, r, price):
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


async def check_all(send) -> None:
    """One poll. `send` is an async callable taking the message text — the dispatcher's private DM.

    NEVER RAISES into the monitor: a tracker that can take the monitor down would cost him TP/SL
    watching on live signals, which matters far more than an advisory message.
    """
    global _last_seen
    try:
        delivery_ledger.cleanup(_TTL)
        # SHARED WITH THE FAST WATCHER, so the two do not each spend a broker request asking the same
        # question at the same moment. `position_book` refreshes on its own slow clock and hands the
        # list out from memory; a failed read still reports None, which this function already handles
        # as "could not find out" rather than "nothing open".
        positions = await position_book.positions()
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
            # ONE BAD POSITION MUST NOT COST THE OTHERS THEIR STOP MOVE.
            #
            # This body used to sit inline inside `check_all`'s single try/except, so anything that
            # raised while handling ONE position — a broker error inside `_price_now`, an odd field
            # while formatting a message — aborted the whole poll and every position AFTER it never
            # had its stop looked at. His rule: *"it is the lifeline of a trade."* Same shape as the
            # copy-platform defect found the same day: a fault reading one thing taking down the
            # loop that reads all of them.
            try:
                await _one_position(p, send, r_seen)
            except Exception as exc:
                log.error(f"[position_tracker] {getattr(p, 'symbol', '?')} "
                          f"#{getattr(p, 'position_id', '?')} failed this poll: "
                          f"{type(exc).__name__}: {exc} — the other positions continue",
                          exc_info=True)

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
        exit_watch.observe(positions, r_seen, persist=True)
    except Exception as exc:
        log.error(f"[position_tracker] poll failed: {type(exc).__name__}: {exc}", exc_info=True)
