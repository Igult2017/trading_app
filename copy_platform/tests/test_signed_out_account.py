"""SIGNING OUT OF AN ACCOUNT MUST NOT COST ITS COPY SETUP.

HIS INSTRUCTION, 2026-10-26: *"ctrader should also have memory such that when one logs out ctrader
account that was followed or following, when they log back in, the previous settings and setups
are restored."*

Logging out keeps the account row and every copy row attached to it, and deliberately clears the
stored credentials (`server/services/accountDisconnect.ts`). That raises two separate dangers in
the copier, and this file pins both:

  1. THE ENGINE MUST NOT DEACTIVATE IT. There is already a branch that switches a master off when
     its broker account is GONE — correctly, because such a master can never start. A signed-out
     account is NOT gone: the row is still there, `classify_master` therefore says START, and
     without a separate check the engine would start a provider that fails on credentials every
     cycle. Flipping `is_active` there would destroy exactly the setup he asked to keep.

  2. THE DISPATCHER MUST SKIP, NOT FAIL. With no credentials the mirror path would file
     ERROR/FAIL on every single mirrored trade — which reads as the copier being broken and
     buries the real failures among them.

⚠ THE DISTINCTION THESE CHECKS DEFEND is "signed out" (row present, `is_active` false, settings
kept, resumes on sign-in) against "gone" (row deleted, master deactivated on purpose). They look
alike from inside the copier and have opposite correct answers.
"""
from _harness import Suite

from engine import (classify_master, VERDICT_DEACTIVATE, VERDICT_START)

s = Suite("SIGNED OUT — the copy setup is kept, not deactivated")


# ── 1. THE ENGINE'S OWN TEST STILL SEES A SIGNED-OUT ACCOUNT AS PRESENT ─────
# This is what makes the extra check in `_load_masters` necessary: `classify_master` cannot tell
# the two apart, because the row IS there. If this ever returns DEACTIVATE, a sign-out would
# switch his master off and the setup would need rebuilding by hand.
LOADED = {"acct-signed-out", "acct-live"}

s.check("a signed-out account is still LOADED, so the master is not orphaned",
        classify_master("ctrader", "acct-signed-out", LOADED), VERDICT_START)
s.check("...while an account that is really gone is still deactivated",
        classify_master("ctrader", "acct-deleted", LOADED), VERDICT_DEACTIVATE)


# ── 2. THE RULE BOTH PLACES NOW APPLY ───────────────────────────────────────
# Written as the plain test the code uses, so the intent is pinned even though the surrounding
# code needs a database and an event loop to run. `is False` rather than a truthiness test is the
# point: `is_active` is NULL on rows created before the column existed, and NULL means "nobody
# ever switched this off" — treating that as off would silently stop a working account.
def skips_mirroring(is_active):
    return is_active is False


s.check("a signed-out account is skipped",            skips_mirroring(False), True)
s.check("a live account is not",                      skips_mirroring(True),  False)
s.check("an older row with no value is NOT skipped",  skips_mirroring(None),  False)


# ── 3. THE CODE ACTUALLY SAYS SO ────────────────────────────────────────────
# A rule asserted only against a local copy of itself is a rule that can drift out of the code it
# describes. These read the real files.
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))


def _read(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as fh:
        return fh.read()


engine_src = _read("engine.py")
dispatcher_src = _read("dispatcher.py")

s.check("the engine refuses to start a provider for a signed-out account",
        "broker_account.is_active is False" in engine_src, True)
s.check("...and does it WITHOUT deactivating the master",
        engine_src.count("row.is_active = False"), 1)
s.check("the dispatcher skips mirroring to a signed-out account",
        "broker_account.is_active is False" in dispatcher_src, True)
s.check("...as a SKIP, not a FAIL, so it is not read as the copier breaking",
        'this account is signed out' in dispatcher_src
        and '"INFO", "SKIP"' in dispatcher_src, True)

s.done()
