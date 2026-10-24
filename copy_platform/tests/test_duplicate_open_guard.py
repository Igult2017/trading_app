"""TWO OPENS FOR ONE POSITION MUST PRODUCE ONE COPY — the guard the reconcile fix leans on.

WHY THIS EXISTS. On 2026-10-25 the 30s reconcile was changed to emit an OPEN for a position it had
never seen, because the live execution event is sometimes dropped and the entry was being lost
silently (`providers/ctrader.py`, and `test_reconcile_recovers_opens.py` for that half).

The comment that previously justified the silence said emitting OPEN would risk *"double-copying"*.
It does not, because `_claim_event` already refuses a second OPEN while one is open — but that
guard had NO TEST, and the whole safety of the change rests on it. If it were ever broken, the
reconcile would place a REAL SECOND ORDER on his account every 30 seconds. That is a money fault,
so it is pinned here rather than taken on trust.

THE RULE, from `dispatcher.py`: count this master's OPEN rows against its CLOSE rows for the same
position id; refuse when opens > closes. A re-open after a close is allowed, because by then the
counts are level again.

Drives the REAL `_claim_event` with a stand-in session, so the SQL-shaped logic is the real one.
"""
from _harness import Suite
import dispatcher as D
from providers.ctrader import PositionSnapshot

s = Suite("DISPATCH — the duplicate-OPEN guard the reconcile recovery depends on")

MASTER = "m-1"


class FakeMaster:
    source_type = "ctrader"


class Q:
    """Just enough of a SQLAlchemy query for the guard: filter_by -> count/first."""

    def __init__(self, rows, model):
        self._rows = [r for r in rows if type(r).__name__ == model.__name__]

    def filter_by(self, **kw):
        self._rows = [r for r in self._rows
                      if all(getattr(r, k, None) == v for k, v in kw.items())]
        return self

    def filter(self, *a, **k):      # the follower read — returns nothing here
        self._rows = []
        return self

    def count(self):
        return len(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return self._rows


class FakeSession:
    """One shared store across `with Session() as db:` blocks, like a real table would be."""
    store: list = []

    def __enter__(self): return self
    def __exit__(self, *a): return False
    def get(self, model, pk): return FakeMaster()
    def query(self, model): return Q(FakeSession.store, model)
    def add(self, obj): FakeSession.store.append(obj)
    def commit(self): pass


D.Session = FakeSession


def snap(pid=42):
    return PositionSnapshot(position_id=pid, symbol="EURUSD", action="BUY",
                            volume_lots=0.1, entry_price=1.1, stop_loss=None, take_profit=None)


def rows(event_type):
    return [r for r in FakeSession.store if getattr(r, "event_type", None) == event_type]


# ── 1. THE LIVE EVENT ARRIVES FIRST, THEN THE RECONCILE REPEATS IT ─────────
# This is the exact sequence the fix creates: a live OPEN, then 30s later a reconcile OPEN for the
# same position because it is still on the books.
FakeSession.store = []
first = D._claim_event(MASTER, snap(42), "OPEN")
second = D._claim_event(MASTER, snap(42), "OPEN")

s.check("the first OPEN is accepted", first is not None, True)
s.check("the SECOND OPEN for the same position is refused", second, None)
s.check("...so exactly ONE master trade row exists", len(rows("OPEN")), 1)


# ── 2. A RE-OPEN AFTER A CLOSE IS A GENUINELY NEW TRADE ────────────────────
# The guard must not become a permanent ban on a position id — he can trade the same symbol again.
FakeSession.store = []
D._claim_event(MASTER, snap(7), "OPEN")
D._claim_event(MASTER, snap(7), "CLOSE")
reopen = D._claim_event(MASTER, snap(7), "OPEN")
s.check("after a close, the same position may open again", reopen is not None, True)
s.check("...giving two OPEN rows in total", len(rows("OPEN")), 2)


# ── 3. A DIFFERENT POSITION IS NEVER BLOCKED BY ANOTHER ────────────────────
FakeSession.store = []
D._claim_event(MASTER, snap(1), "OPEN")
other = D._claim_event(MASTER, snap(2), "OPEN")
s.check("a different position id is unaffected", other is not None, True)
s.check("...two separate rows", len(rows("OPEN")), 2)


# ── TEETH ──────────────────────────────────────────────────────────────────
# If the guard were removed, check 1 would show two rows. Prove the store really can hold two, so
# "1" above is the guard working and not the fake quietly dropping writes.
FakeSession.store = []
D._claim_event(MASTER, snap(5), "OPEN")
D._claim_event(MASTER, snap(6), "OPEN")
s.teeth("the store can hold two OPENs, so the count of 1 above was the guard",
        len(rows("OPEN")) == 2)

s.done()
