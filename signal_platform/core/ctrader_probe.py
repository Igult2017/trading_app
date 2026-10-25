"""BOOT PROBE — confirm the broker feed really works, and WAIT rather than die if it does not.

⚠ WHY THIS IS NOT JUST A try/except IN main.py. On 25 Oct 2026 one account's stored login went bad
and `main.py` called `sys.exit(1)` on the failed probe. The watchdog restarted the whole platform
every 60 seconds — **20 times in half an hour** — and in all that time there was no scanning, no
monitoring and no signals, because ONE account could not hand over a token.

His instruction after seeing it: *"If one account logout or failure brings the whole sync platform
down then that is bad user experience."*

So a credential failure now keeps the process UP and retries. Nothing is gained by exiting: the
watchdog only starts the same process again, more slowly and with a full re-import, and the state
in the log reads as a crash rather than as "waiting for a reconnect". Staying up means the platform
recovers on its OWN, within one backoff, the moment the account is reconnected — and says so.

⚠ THE ALERT IS NOT SPAMMED. `write_status("error", ...)` is deduped by its own marker file
(`core/startup_helpers`), so a long wait alerts once; and `write_status("ok")` on recovery clears
that marker and sends the coded recovery message. Both already worked — they were just never given
a process that lived long enough to use them.
"""
import asyncio
import logging
import time

log = logging.getLogger(__name__)

# First wait after a failure, then doubling to the cap. Short at the start because the common case
# is a reconnect happening WHILE we wait, and he should not sit looking at a dead platform for five
# minutes after fixing it.
_FIRST_WAIT_S = 30
_MAX_WAIT_S   = 300

# ── IS THE BROKER'S HISTORY FEED USABLE RIGHT NOW? ───────────────────────────────────────────
# One flag, written only here, read by anything that must not pretend it has data. It starts True
# so that nothing is gated before the first check has even run.
_READY = True
_LAST_NOTE = 0.0
_NOTE_EVERY_S = 900          # one reminder every 15 minutes while degraded, not one per tick


def market_data_ready() -> bool:
    """False while the broker account that serves historical candles is unavailable."""
    return _READY


def degraded_note(log_) -> None:
    """Say we are skipping, at most once every 15 minutes.

    ⚠ RATE-LIMITED ON PURPOSE. The scan tick runs every 45 seconds; an unlimited line here would
    bury the one message that matters - the alert naming the account to reconnect - under eighty
    copies an hour of a thing nobody can act on twice.
    """
    global _LAST_NOTE
    now = time.monotonic()
    if now - _LAST_NOTE < _NOTE_EVERY_S:
        return
    _LAST_NOTE = now
    log_.warning("[scanner] skipped - no broker history feed. Live prices and the journal ticker "
                 "are still running on FIX; scanning and trade monitoring resume by themselves "
                 "when the cTrader account is reconnected.")


def hint_for(raw: str, settings) -> str:
    """Plain words for what to actually DO about this failure.

    ⚠ THE OLD HINT SENT HIM TO THE WRONG PLACE. It chose "CTRADER_REFRESH_TOKEN is stale.
    ADMIN_SECRET must be set..." whenever the error merely CONTAINED the word "token" — and on
    25 Oct that fired while the admin secret was working perfectly. Node had answered 409, not 401:
    the pinned account existed but its login could not be renewed. Twenty minutes went into
    checking a secret that was never the problem.

    The most specific test comes FIRST, because the generic ones match almost anything.
    """
    low = (raw or "").lower()
    pin = str(getattr(settings, "ctrader_signal_account_id", "") or "").strip()
    if "could not get a live token from node" in low:
        who = f"account {pin}" if pin else "the pinned cTrader account"
        return (f"Node has no usable cTrader login for {who}. Reconnect that account in the app "
                f"(Accounts -> reconnect). This is NOT an ADMIN_SECRET problem: Node answered, it "
                f"simply had no token to give.")
    if "app auth failed" in low:
        return ("CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET is wrong, OR the app is not Active in "
                "the cTrader portal")
    if "account auth failed" in low:
        return (f"CTRADER_ACCOUNT_ID={settings.ctrader_account_id} is invalid on the "
                f"{settings.ctrader_env} server")
    if "0 bars" in low:
        return "Confirm CTRADER_ACCOUNT_ID is the ctid numeric ID, not your broker login number"
    if "refresh" in low or "token" in low or "backoff" in low:
        return ("The cTrader login could not be renewed. Reconnect the account in the app; if that "
                "does not help, check CTRADER_ACCESS_TOKEN / CTRADER_REFRESH_TOKEN in Coolify.")
    return "Check CTRADER_ACCESS_TOKEN, CTRADER_REFRESH_TOKEN, CTRADER_ACCOUNT_ID in Coolify"


async def _probe_once(settings) -> tuple[bool, str]:
    """One attempt. Returns (ok, why-it-failed)."""
    from data.data_source import fetch_raw
    try:
        bars = await asyncio.wait_for(fetch_raw("EUR/USD", "H1", 5), timeout=25)
        if bars:
            return True, ""
        return False, (f"Spotware returned 0 bars - CTRADER_ACCOUNT_ID={settings.ctrader_account_id} "
                       f"may be wrong")
    except Exception as exc:
        return False, str(exc)


async def ensure_market_data(settings, write_status, bootstrap_tokens) -> bool:
    """Is the broker's history feed usable? If not, say so ONCE and keep trying in the background.

    ⚠ IT RETURNS INSTEAD OF BLOCKING, and that is the whole point. Boot carries on without the
    Open API so everything that does NOT need it — the FIX price stream, the journal ticker, the
    scheduler, the trade monitor — comes up anyway. His instruction: *"signal platform should not
    be going off when the account that provides data for signal is not there because we also have
    FIX data which provides real time signals."*

    FIX is a different protocol on a different port with its OWN credential (`fix_quotes` logs on
    with an account number and a password), so it is untouched by a dead Open API login.
    """
    global _READY
    ok, why = await _probe_once(settings)
    if ok:
        _READY = True
        log.info("[boot] cTrader OK - history feed is live")
        return True
    _READY = False
    hint = hint_for(why, settings)
    write_status("error", why, hint)              # deduped: one alert per outage, not per attempt
    log.error("[boot] cTrader history feed UNAVAILABLE: %s", why)
    log.error("[boot] hint: %s", hint)
    # ⚠ THIS LIST IS EXACT, not reassuring. Checked: `signal_monitor` reads its M1 bars through
    # `candle_fetcher` and `trade_watcher` gets its positions from `position_book` - BOTH are the
    # Open API, so both pause with it. FIX keeps the live quote stream and the journal ticker, and
    # tick bars keep building. Claiming monitoring survives would be a lie told by an alert.
    log.warning("[boot] DEGRADED, not dead: FIX live prices and the journal ticker keep running, "
                "and tick candles keep building. PAUSED until the account is back: signal "
                "scanning and trade monitoring - both read the broker's own history, which FIX "
                "cannot supply (the strategies want thousands of bars; FIX starts empty).")
    asyncio.create_task(_retry_forever(settings, write_status, bootstrap_tokens))
    return False


async def _retry_forever(settings, write_status, bootstrap_tokens) -> None:
    """Keep asking until the feed returns, then announce it. Never raises - it is a background
    task, and an exception here would vanish into asyncio with the platform none the wiser."""
    global _READY
    wait = _FIRST_WAIT_S
    while True:
        try:
            await asyncio.sleep(wait)
            wait = min(wait * 2, _MAX_WAIT_S)
            try:
                await bootstrap_tokens(settings)   # the fix arrives here, from Node's database
            except Exception as exc:
                log.warning("[recover] could not re-read tokens from Node: %s", exc)
            ok, why = await _probe_once(settings)
            if ok:
                _READY = True
                write_status("ok")                 # clears the marker and sends the recovery message
                log.info("[recover] cTrader history feed is BACK - full signal scanning resumes")
                return
            log.warning("[recover] still waiting on the cTrader account (%s) - retrying in %ds",
                        why[:120], wait)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.error("[recover] retry loop error (continuing): %s", exc)
