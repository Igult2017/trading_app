"""ONE DEAD ACCOUNT MUST NOT TAKE THE PLATFORM DOWN.

WHAT HAPPENED, 25 Oct 2026. The cTrader account that serves historical candles could not hand over
a token. `main.py` called `sys.exit(1)` on the failed probe, the watchdog restarted the whole
platform every 60 seconds — **20 times in half an hour** — and in all that time there was no
scanning, no monitoring, and no live prices in the journal either, because this same process is
what publishes them (production served `{"prices":[]}` throughout).

HIS INSTRUCTION: *"Signal platform should not be going off when the account that provides data for
signal is not there because we also have FIX data which provides real time signals."*

⚠ AND THE LIMIT OF THAT, WHICH THIS FILE ALSO PINS. FIX genuinely survives — it logs on with an
account number and a password, so a dead Open API login cannot touch it. But FIX cannot MAKE a
signal: VIX.1 reads 3,000 H1 bars and BX-S/D 1,000 H4, months of history, while FIX starts empty
and builds forward a minute at a time. So the correct degraded state is: prices, ticker and
monitoring alive; scanning paused and SAYING SO. A test that asserted "signals keep coming" would
be pinning a lie.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

import asyncio  # noqa: E402
import logging  # noqa: E402

from core import ctrader_probe as probe  # noqa: E402

count, failed = 0, []


def check(label, got, want=True):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if not ok:
        failed.append(label)


class _Settings:
    ctrader_account_id = "47535327"
    ctrader_env = "demo"
    ctrader_signal_account_id = "47535363"


SET = _Settings()

print("\nDEGRADED, NOT DEAD\n")

# ── 1. THE HINT NAMES THE ACCOUNT, NOT A SETTING THAT WAS NEVER WRONG ────────────────────
# The old hint fired "CTRADER_REFRESH_TOKEN is stale. ADMIN_SECRET must be set..." whenever the
# error merely CONTAINED the word "token" — and on 25 Oct that is exactly what it did while the
# admin secret was working perfectly. Node had answered 409, not 401. Twenty minutes went into
# checking a secret that was not the problem.
real = "[cTrader] EUR/USD H1: [ctrader] could not get a live token from Node after retries"
hint = probe.hint_for(real, SET)
check("the real failure names the account to reconnect", "47535363" in hint)
check("...and says plainly it is NOT an ADMIN_SECRET problem", "NOT an ADMIN_SECRET" in hint)
check("...and the old misleading advice is gone", "ADMIN_SECRET must be set" not in hint)

# The other branches still answer their own cases.
check("a wrong app credential still points at the app",
      "CTRADER_CLIENT_ID" in probe.hint_for("app auth failed", SET))
check("zero bars still points at the account id",
      "ctid" in probe.hint_for("Spotware returned 0 bars", SET))

# ── 2. THE FLAG THE SCANNER READS ────────────────────────────────────────────────────────
check("the feed is assumed usable before anything has been checked",
      probe.market_data_ready(), True)


class _Spy:
    """Stands in for the real probe and for write_status, so no network and no Telegram."""

    def __init__(self, results):
        self.results = list(results)
        self.status = []

    async def probe(self, _settings):
        return self.results.pop(0)

    def write_status(self, status, error="", hint=""):
        self.status.append(status)


async def _bootstrap(_settings):
    return None


async def scenario_outage():
    spy = _Spy([(False, "could not get a live token from Node")])
    probe._probe_once = spy.probe                      # type: ignore[assignment]
    # A retry task would run for ever in a test; the outage path is what is under test here.
    probe._retry_forever = lambda *a, **k: asyncio.sleep(0)   # type: ignore[assignment]
    ok = await probe.ensure_market_data(SET, spy.write_status, _bootstrap)
    return ok, spy


ok, spy = asyncio.run(scenario_outage())
check("a dead account does NOT raise and does NOT exit — it returns", ok, False)
check("...the scanner is told to stop asking", probe.market_data_ready(), False)
check("...and exactly one alert is raised, not one per attempt", spy.status, ["error"])

# ── 3. THE NOTE IS RATE-LIMITED ──────────────────────────────────────────────────────────
# The scan tick runs every 45s. An unlimited line here would bury the alert that matters under
# eighty copies an hour of something nobody can act on twice.
seen = []


class _Log:
    def warning(self, msg, *a):
        seen.append(msg)


probe._LAST_NOTE = 0.0
probe.degraded_note(_Log())
probe.degraded_note(_Log())
probe.degraded_note(_Log())
check("three scan ticks produce ONE line, not three", len(seen), 1)
# ⚠ THE WORDING IS PINNED BECAUSE IT IS A CLAIM, NOT DECORATION. It tells him what is still
# working during an outage, and an inaccurate one here is an alert that lies. It must say FIX is
# carrying the series, which strategy keeps running, which one pauses, and that anything that
# cannot be brought up to date is refused rather than served stale.
check("...it says FIX is carrying the series on", "carrying the series on" in seen[0])
check("...it names the strategy that PAUSES rather than implying all is well",
      "BX-S/D pauses" in seen[0])
check("...and promises stale bars are refused, not served",
      "refused rather than served stale" in seen[0])

# ── 4. RECOVERY PUTS IT BACK ─────────────────────────────────────────────────────────────


async def scenario_recovery():
    spy = _Spy([(True, "")])
    probe._probe_once = spy.probe                      # type: ignore[assignment]
    ok = await probe.ensure_market_data(SET, spy.write_status, _bootstrap)
    return ok, spy


ok, spy = asyncio.run(scenario_recovery())
check("a healthy feed reports ready", ok, True)
check("...the scanner is allowed to scan again", probe.market_data_ready(), True)
check("...and nothing is alerted when all is well", spy.status, [])

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
