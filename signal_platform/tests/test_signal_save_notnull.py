"""A STAGE-1 HEADS-UP MUST BE STORABLE — and a malformed row must never look like a duplicate.

THE DEFECT, found 2026-08-22 while answering *"BX-S/D recorded zero signals this week while sending
14 Telegram messages."*

`trading_signals` has FOUR NOT NULL money columns — `entry_price`, `stop_loss`, `take_profit`,
`risk_reward_ratio` (`shared/schema.ts`). `signal_repo.save` mapped them through `X or None`, so a
signal carrying 0.0 became NULL. A BX signal 1 carries no entry, stop or target BY DESIGN — the
architecture doc: *"carries no entry/stop/target — the reaction, not a trade."*

An earlier fix (2026-08-20) rescued `entry_price` with a `ref_price` fallback and left the other
three. So the INSERT still died on `stop_loss`.

AND NOTHING REPORTED IT. `save` caught `IntegrityError` and returned "", which the caller reads as
"a row is already there" — so the failure was indistinguishable from normal operation. No log, no
event, no row, for the whole life of the feature.

These tests use a FAKE session that enforces the real NOT NULL constraints, because a live DB is not
reachable from here. The columns asserted are the ones `shared/schema.ts` marks `.notNull()`.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from sqlalchemy.exc import IntegrityError                      # noqa: E402
from core.types import Signal, Direction, TF                   # noqa: E402
from storage import signal_repo                                # noqa: E402

failed, count = [], 0

# The four columns `shared/schema.ts` declares .notNull() on the money side.
NOT_NULL = ("entry_price", "stop_loss", "take_profit", "risk_reward")


def check(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def teeth(name, broke_it: bool):
    global count
    count += 1
    print(f"   {'PASS' if broke_it else 'FAIL'}  TEETH — {name}: {broke_it}")
    if not broke_it:
        failed.append(f"TEETH:{name}")


class _PgError(Exception):
    """Stands in for psycopg2's error object — `save` reads `.pgcode` off `exc.orig`."""
    def __init__(self, pgcode, msg):
        super().__init__(msg)
        self.pgcode = pgcode


class _FakeSession:
    """Enforces the REAL constraints: NOT NULL on the four money columns, then the unique index."""
    def __init__(self, duplicate=False):
        self.duplicate, self.added, self.rolled_back = duplicate, None, False

    def add(self, row):
        self.added = row

    def flush(self):
        for col in NOT_NULL:
            if getattr(self.added, col, None) is None:
                raise IntegrityError("INSERT", {}, _PgError(
                    "23502", f'null value in column "{col}" violates not-null constraint'))
        if self.duplicate:
            raise IntegrityError("INSERT", {}, _PgError(
                "23505", "duplicate key value violates unique constraint"))
        # The real engine applies SignalModel's `default=lambda: uuid4()` at flush; a fake session
        # does not, so without this `save` returns a falsy id and the harness reports a failure the
        # code does not have. (Caught exactly that way — the bent yardstick, not the code.)
        if getattr(self.added, "id", None) is None:
            self.added.id = "row-id-assigned-at-flush"

    def rollback(self):
        self.rolled_back = True

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def install(duplicate=False):
    sess = _FakeSession(duplicate)
    signal_repo.get_session = lambda: sess
    return sess


def stage1_alert() -> Signal:
    """A BX signal 1 exactly as `bx_sd_mitigation.mitigation_signal` builds it: no trade levels."""
    return Signal(
        symbol="EUR/USD", direction=Direction.SELL,
        strategy_id="bx_sd", strategy_name="BX-S/D",
        alert_only=True, primary_timeframe=TF.H4,
        technical_reasons=["4H supply zone MITIGATED"],
        market_context="BX-S/D heads-up",
    )


print()
print("STAGE-1 HEADS-UP — the row BX could never write")

s = stage1_alert()
check("it really does carry no entry", float(s.entry_price or 0), 0.0)
check("...no stop", float(s.stop_loss or 0), 0.0)
check("...and no target", float(s.take_profit or 0), 0.0)

# `ref_price` is what the runner passes: the price being WATCHED.
install()
row_id = signal_repo.save(s, signal_repo.STATUS_WATCHING, 1.16220)
check("it SAVES — this is the whole defect", bool(row_id), True)

sess = install()
signal_repo.save(stage1_alert(), signal_repo.STATUS_WATCHING, 1.16220)
stored = sess.added
for col in NOT_NULL:
    check(f"  {col} is not NULL", getattr(stored, col, None) is not None, True)
check("the watched price is used, not an invented level", float(stored.entry_price), 1.16220)
check("stop and target sit at the watched price — no distance is claimed",
      (float(stored.stop_loss), float(stored.take_profit)), (1.16220, 1.16220))
check("risk_reward is 0 — there is no ratio, and 0 says so", float(stored.risk_reward), 0.0)
check("and it is stored as WATCHING, not a live trade", stored.status, "watching")

# ── TEETH: the OLD mapping, reproduced, must fail this ───────────────────────
print()
print("TEETH — would this catch the bug coming back?")
sess = install()
old = stage1_alert()
try:
    # exactly the pre-fix expression for the three columns that were left behind
    sess.add(type("R", (), {
        "entry_price": old.entry_price or 1.16220 or None,
        "stop_loss":   old.stop_loss or None,
        "take_profit": old.take_profit or None,
        "risk_reward": old.risk_reward or None,
    })())
    sess.flush()
    broke = False
except IntegrityError as exc:
    broke = "stop_loss" in str(exc)
teeth("the old `or None` mapping dies on stop_loss", broke)

# ── A REAL DUPLICATE MUST STILL BE QUIET ─────────────────────────────────────
print()
print("A DUPLICATE IS NOT A FAULT — the two must stay distinguishable")
sess = install(duplicate=True)
dup_id = signal_repo.save(stage1_alert(), signal_repo.STATUS_WATCHING, 1.16220)
check("a genuine unique-index hit still returns ''", dup_id, "")
check("...and rolls back, so the session stays usable", sess.rolled_back, True)

# A malformed row must NOT be reported as a duplicate. Force one by withholding ref_price, so
# entry_price has nothing to fall back to.
sess = install()
bad_id = signal_repo.save(stage1_alert(), signal_repo.STATUS_WATCHING, None)
check("a malformed row also returns '' (callers are unchanged)", bad_id, "")
teeth("...but it took the ERROR path, not the duplicate path — it is no longer silent",
      sess.rolled_back is True)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
