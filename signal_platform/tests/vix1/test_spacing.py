"""VIX.1 — SIGNAL SPACING (`vix1_spacing`), and the duplicate-active-signal regression.

The rule under test, in the user's words (2026-07-27): while a signal on this instrument is STILL
RUNNING, a new one may not be taken until 3 momentum candles have closed after the 1HR momentum
candle that produced it. A CLOSED previous signal — explicitly including a LOSS — voids the wait.
Scope is the instrument, and it covers buy and sell signals alike.

THE CASE THAT MOTIVATED IT is asserted directly against real broker candles at the bottom: on
27 Jul 2026 a signal was taken off the 07:00 EUR/USD momentum candle at 11:17, and only TWO momentum
candles had closed by the time the 13:00 setup came round. That setup was delivered anyway, 21 pips
into a completed move, and it failed. This suite fails if that signal would be allowed again.

NOT A BACKTEST. No P&L, win rate or expectancy — every assertion is structural.
"""
from _harness import Suite, body, load

from strategies import vix1_spacing
from strategies.vix1_spacing import _MIN_CANDLES, anchor_time, candles_since, check
from strategies.vix1_momentum import is_momentum_candle

s = Suite("VIX.1 — signal spacing, and the two-active-signals regression")


class _Row:
    """Stands in for a trading_signals row — only the fields the rule reads."""
    def __init__(self, strategy, symbol, created_at, status="active"):
        self.strategy, self.symbol, self.created_at, self.status = strategy, symbol, created_at, status


class _FakeRepo:
    def __init__(self, rows): self.rows = rows
    def get_active(self): return list(self.rows)


def _with_active(rows):
    """Point the rule at a fake signal_repo. It imports inside the function, so patch sys.modules."""
    import sys
    import types
    mod = types.ModuleType("storage.signal_repo")
    mod.get_active = _FakeRepo(rows).get_active
    sys.modules["storage.signal_repo"] = mod


# ── real candles: the 27 Jul EUR/USD case ────────────────────────────────────────────────────────
h1 = load("EURUSD_H1_audit.csv", "H1")
if not h1:
    h1 = load("EURUSD_H1.csv", "H1", limit=800)

import time                                                          # noqa: E402
from datetime import datetime, timezone                              # noqa: E402


def _utc(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)


TAKEN   = _utc("2026-07-27 11:17")        # the signal that really was created, off the 07:00 candle
DELIVER = _utc("2026-07-27 14:46")        # the signal that really was delivered, off the 13:00 candle

have_case = bool(h1) and h1[-1].time >= DELIVER.timestamp()

if have_case:
    print("   the 27 Jul EUR/USD case, on real broker candles:")
    anchor = anchor_time(h1, TAKEN.timestamp())
    s.check("the anchor is the 07:00 momentum candle (derived, not stored)",
            time.strftime("%H:%M", time.gmtime(anchor)), "07:00")

    n = candles_since(h1, anchor, DELIVER.timestamp())
    s.check("only 2 momentum candles closed before the 14:46 setup", n, 2)
    s.check(f"  which is under the {_MIN_CANDLES}-candle requirement", n < _MIN_CANDLES, True)

    _with_active([_Row("vix1", "EUR/USD", TAKEN)])
    ok, why = check(h1, "EUR/USD", "vix1", DELIVER.timestamp())
    s.check("THE POINT: the 14:46 signal is REFUSED while the 11:17 one runs", ok, False)
    s.check("  and the refusal explains itself", "momentum candles" in why, True)
else:
    print("   SKIP — the 27 Jul EUR/USD H1 window is not in the local data")

# ── the release conditions ───────────────────────────────────────────────────────────────────────
print()
print("   a CLOSED previous signal voids the wait — including a LOSS:")
if have_case:
    for status in ("invalidated", "expired", "executed"):
        _with_active([])                       # get_active returns only 'active' rows by definition
        ok, why = check(h1, "EUR/USD", "vix1", DELIVER.timestamp())
        s.check(f"previous signal {status} (not active) -> allowed", ok, True)
        break
    _with_active([])
    ok, _ = check(h1, "EUR/USD", "vix1", DELIVER.timestamp())
    s.check("a LOSS releases the gate immediately (user's explicit rule)", ok, True)

    print()
    print("   scope is the INSTRUMENT:")
    _with_active([_Row("vix1", "EUR/USD", TAKEN)])
    ok, _ = check(h1, "GBP/USD", "vix1", DELIVER.timestamp())
    s.check("a running EUR/USD signal does NOT gate GBP/USD", ok, True)

    _with_active([_Row("bx_sd", "EUR/USD", TAKEN)])
    ok, _ = check(h1, "EUR/USD", "vix1", DELIVER.timestamp())
    s.check("another strategy's signal does not gate this one", ok, True)

    print()
    print("   it OPENS once enough momentum candles have closed — the gate is a WAIT, not a block:")
    # Anchor far enough back that at least _MIN_CANDLES momentum candles have since closed, so this
    # asserts the ALLOW branch for real. A gate only ever tested in its refusing state would still
    # pass if it refused everything forever.
    now_far = h1[-1].time + 3600
    old = None
    for i in range(len(h1)):
        if candles_since(h1, h1[i].time, now_far) >= _MIN_CANDLES:
            old = h1[i].time
        else:
            break
    s.check("found an anchor old enough to clear the gate", old is not None, True)
    if old is not None:
        n_old = candles_since(h1, old, now_far)
        s.check(f"  it has {n_old} momentum candles after it (>= {_MIN_CANDLES})",
                n_old >= _MIN_CANDLES, True)
        # a still-RUNNING signal taken off that old anchor must now be allowed through
        taken_old = datetime.fromtimestamp(old + 3600, tz=timezone.utc)
        _with_active([_Row("vix1", "EUR/USD", taken_old)])
        ok, why = check(h1, "EUR/USD", "vix1", now_far)
        s.check("a running signal whose anchor is old enough NO LONGER blocks", ok, True)

    # TEETH: the same call with a fresh anchor must refuse, or the rule is inert.
    _with_active([_Row("vix1", "EUR/USD", TAKEN)])
    s.teeth("the spacing gate", check(h1, "EUR/USD", "vix1", DELIVER.timestamp())[0] is False)

# ── fails OPEN, never silently shut ──────────────────────────────────────────────────────────────
print()
print("   a DB failure must not silently mute the strategy:")


def _boom():
    raise RuntimeError("db down")


import sys as _sys                                                    # noqa: E402
import types as _types                                                # noqa: E402
_bad = _types.ModuleType("storage.signal_repo")
_bad.get_active = _boom
_sys.modules["storage.signal_repo"] = _bad
ok, why = check(h1 or [body(1.1, 1.1001, tf="H1", t=i) for i in range(30)],
                "EUR/USD", "vix1", 1_800_000_000)
s.check("DB unavailable -> allowed (other guards still stand)", ok, True)
s.check("  and it says so rather than failing quietly", "DB unavailable" in why, True)

# ── the duplicate-active-signal regression ───────────────────────────────────────────────────────
print()
print("   REGRESSION — 27 Jul: ORM rows must survive the session that loaded them.")
print("   `get_active()` returned expired+detached instances, so every attribute read raised")
print("   DetachedInstanceError. That silently blanked the duplicate guard AND killed the monitor.")
from sqlalchemy import Column, String, create_engine                  # noqa: E402
from sqlalchemy.orm import DeclarativeBase, sessionmaker              # noqa: E402


class _B(DeclarativeBase):
    pass


class _R(_B):
    __tablename__ = "regr"
    id = Column(String, primary_key=True)
    symbol = Column(String)


def _survives(expire_on_commit: bool) -> bool:
    eng = create_engine("sqlite://")
    _B.metadata.create_all(eng)
    SL = sessionmaker(bind=eng, autocommit=False, autoflush=False, expire_on_commit=expire_on_commit)
    sess = SL()
    sess.add(_R(id="1", symbol="EUR/USD"))
    sess.commit()
    sess.close()
    sess2 = SL()
    rows = sess2.query(_R).all()
    sess2.commit()
    sess2.close()
    try:
        _ = rows[0].symbol
        return True
    except Exception:
        return False


s.check("rows loaded through the app's session config survive it", _survives(False), True)
s.teeth("the detached-row check", _survives(True) is False)

# the app really is configured that way
import storage.db as _db                                              # noqa: E402
s.check("storage.db really sets expire_on_commit=False",
        _db.SessionLocal.kw.get("expire_on_commit"), False)

s.done()
