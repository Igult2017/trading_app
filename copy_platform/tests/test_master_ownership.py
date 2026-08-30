"""THE ENGINE MAY ONLY SWITCH OFF A MASTER IT ACTUALLY RUNS.

WHY. To stop an orphaned master logging every 30-60s, the engine was given the power to set
`is_active = False` on a master whose broker account is missing. That test was placed BEFORE the
test for whether the master belongs to this engine at all — and MT5 masters legitimately have no
`broker_account_id`. They link through `account_id` -> `copy_accounts` and are run by a SEPARATE
external bridge, which fetches its work from `/api/internal/active-providers` filtered on
`is_active = TRUE`.

So the engine switched off providers it does not run and cannot see, and the bridge simply stopped
being given them. Nothing failed loudly; the trades just stopped. `/api/copy/deploy` still creates
exactly those rows, so this was not confined to old data.

The ORDER of the two tests is the whole defect, which is why `classify_master` exists as a pure
function and is asserted here directly rather than through a database.
"""
from _harness import Suite

from engine import (classify_master, SUPPORTED_PLATFORMS,
                    VERDICT_TELEGRAM, VERDICT_NOT_OURS, VERDICT_DEACTIVATE, VERDICT_START)

s = Suite("MASTER OWNERSHIP — the engine disables only what it runs")

LIVE = {"acct-1", "acct-2"}          # broker accounts the engine loaded


# ── THE REGRESSION ITSELF ───────────────────────────────────────────────────
# An MT5 master has no broker account BY DESIGN. Before the fix this returned "deactivate".
s.check("MT5 master, no broker account -> left alone (the regression)",
        classify_master("mt5", None, LIVE), VERDICT_NOT_OURS)
s.check("MT5 master with a stale broker account -> STILL left alone",
        classify_master("mt5", "deleted-acct", LIVE), VERDICT_NOT_OURS)
s.check("an unknown future source is left alone too, not disabled",
        classify_master("some_new_broker", None, LIVE), VERDICT_NOT_OURS)


# ── WHAT THE DEACTIVATION WAS BUILT FOR — still works ───────────────────────
s.check("cTrader master whose account is gone -> deactivate (a true orphan)",
        classify_master("ctrader", "deleted-acct", LIVE), VERDICT_DEACTIVATE)
s.check("cTrader master with no account id at all -> deactivate",
        classify_master("ctrader", None, LIVE), VERDICT_DEACTIVATE)


# ── THE NORMAL PATHS ────────────────────────────────────────────────────────
s.check("cTrader master with a live account -> start",
        classify_master("ctrader", "acct-1", LIVE), VERDICT_START)
s.check("Telegram is decided FIRST — it has no broker account either",
        classify_master("telegram", None, LIVE), VERDICT_TELEGRAM)
s.check("...and Telegram stays Telegram even with an account attached",
        classify_master("telegram", "acct-1", LIVE), VERDICT_TELEGRAM)
s.check("source_type is matched case-insensitively",
        classify_master("CTrader", "acct-1", LIVE), VERDICT_START)
s.check("a missing source_type is not ours to disable",
        classify_master(None, None, LIVE), VERDICT_NOT_OURS)

# Every platform the engine claims to support must be able to reach a start verdict — otherwise
# SUPPORTED_PLATFORMS and this function have drifted apart.
for platform in sorted(SUPPORTED_PLATFORMS):
    s.check(f"supported platform {platform!r} can start",
            classify_master(platform, "acct-1", LIVE), VERDICT_START)


# ── TEETH ───────────────────────────────────────────────────────────────────
# Restore the old ordering and confirm this suite goes red. A test that cannot fail proves nothing.
def _old_order(source_type, broker_account_id, known):
    """The buggy version: broker-account test before the ownership test."""
    if (source_type or "").lower() == "telegram":
        return VERDICT_TELEGRAM
    if not broker_account_id or broker_account_id not in known:
        return VERDICT_DEACTIVATE           # <- the defect
    if (source_type or "").lower() not in SUPPORTED_PLATFORMS:
        return VERDICT_NOT_OURS
    return VERDICT_START


s.teeth("the MT5 case", _old_order("mt5", None, LIVE) == VERDICT_DEACTIVATE)

s.done()
