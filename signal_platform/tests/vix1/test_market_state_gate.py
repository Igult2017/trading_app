"""test_market_state_gate.py — run with:
    cd signal_platform && python tests/vix1/test_market_state_gate.py

HIS INSTRUCTION, 2026-11-14: *"I have noticed signals are sent to the channel without market state
qualifying. That is the market state is CHOP and the signal is still sent to the channel. Can you
fix that and then enable autotrader and let it only take trades that have qualified all the
requirements including Market state and stomach rule. Remove Gold from autotrading. Also let
autotrader only take trades in the busy and active hours of London and New York Sessions… from
Tokyo London overlap to New York but not late hours of New York… which is from 7 pm Kenyan time."*

He was right, and the code admitted it in its own words — `vix1_state.py` opens with "THE MARKET
STATE IS MEASURED, NOT ENFORCED… Neither number gates anything yet", while `vix1_regime.Regime`
carried a `tradeable` property that nothing ever read.

⚠ A VETO LIVED IN `vix1_regime` AND WAS DELETED ON 2026-09-08. That one worked out its OWN
direction and could call a market a trend while meaning the opposite way. What is enforced now is
the REFUSING half only — "is it a trend at all" — which cannot approve anything, so it cannot bring
that back. Section 1 pins that distinction so nobody restores the other half by accident.

MEASURED BEFORE SHIPPING: GBP/USD H1, sampled every 5 bars over 4,000, through the real
`detect_bias` — 17 signals, of which 13 TREND, 2 RANGE, 2 CHOP. The gate refuses 23.5% of what
fired. Fewer trades is the intent; the number is here so a later session can tell a working gate
from one that has started eating everything.
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

from _harness import Suite, load  # noqa: F401

from strategies import vix1_bias, vix1_regime          # noqa: E402
from execution import guards                           # noqa: E402
from config.settings import settings                   # noqa: E402

s = Suite("VIX.1 MARKET-STATE GATE + AUTOTRADE SCOPE")

bars = load("EURUSD_H1_live_sep04.csv", "H1")

# ⚠ ABSOLUTE, NOT RELATIVE. `run_all.py` launches each test with cwd=tests/vix1, so a bare
# "strategies/…" path passes standalone and dies in the suite — which is exactly what it did.
ROOT = Path(__file__).resolve().parents[2]


def fires(i, state=None):
    """Does the main route produce a signal at bar `i`, with the regime forced to `state`?"""
    real = vix1_regime.classify
    if state is not None:
        vix1_regime.classify = lambda *a, **k: vix1_regime.Regime(state, "forced by the test")
    try:
        win = bars[max(0, i + 1 - 3000):i + 1]
        return vix1_bias.detect_bias(win, [], "EUR/USD") is not None
    finally:
        vix1_regime.classify = real


# ── 1. THE GATE ITSELF ────────────────────────────────────────────────────────────────────────
print()
print("1. a market the regime calls CHOP or RANGE cannot produce a signal:")
# A bar that DOES signal when the market state is a trend — found by asking, not assumed.
live = next((i for i in range(len(bars) - 1, len(bars) - 1200, -1)
             if fires(i, vix1_regime.TREND)), None)
s.check("   a bar that signals when the state is TREND was found", live is not None, True)
if live is not None:
    s.check("   ...the same bar, state CHOP  -> no signal", fires(live, vix1_regime.CHOP), False)
    s.check("   ...the same bar, state RANGE -> no signal", fires(live, vix1_regime.RANGE), False)
    s.check("   ...and UNCERTAIN refuses too", fires(live, vix1_regime.UNCERTAIN), False)
    s.teeth("the ONLY difference between those answers is the market state",
            fires(live, vix1_regime.TREND) is True and fires(live, vix1_regime.CHOP) is False)

# ⚠ THE HALF THAT STAYS DELETED. `tradeable` must be a pure "is it a trend", with no opinion of its
# own about direction — that is what makes restoring this safe after the 2026-09-08 removal.
s.teeth("the verdict reads ONLY the kind, never a direction",
        vix1_regime.Regime(vix1_regime.TREND, "x").tradeable is True
        and vix1_regime.Regime(vix1_regime.CHOP, "x").tradeable is False
        and vix1_regime.Regime(vix1_regime.RANGE, "x").tradeable is False)

# ── 2. THE REASON REACHES THE LOG AND THE SCREEN ──────────────────────────────────────────────
print()
print("2. the refusal names the state, so it is readable on the Autotrade screen:")
src = (ROOT / "strategies/vix1_bias.py").read_text(encoding="utf-8")
s.teeth("the gate sits in the SHARED veto list, not a private return",
        "regime.tradeable" in src
        and src.index("regime.tradeable") < src.index("trend_reproven(mstate, at_mc"))
s.teeth("the reason says 'the market state is <STATE>'",
        'f"the market state is {regime.kind.upper()}' in src)

# ── 3. GOLD IS OUT OF AUTOTRADING ─────────────────────────────────────────────────────────────
print()
print("3. gold may still SIGNAL, but it may not be auto-traded:")
s.check("   XAU/USD is not in the autotrade allow-list",
        "xau/usd" in settings.autotrade_symbols.lower(), False)
for sym in ("EUR/USD", "GBP/USD", "GBP/JPY"):
    s.check(f"   {sym} is still allowed", sym.lower() in settings.autotrade_symbols.lower(), True)
s.teeth("the list is not empty — empty means EVERY symbol, which is how gold got in",
        bool(settings.autotrade_symbols.strip()))

# ── 4. THE DAY'S HARD STOP — 7pm Kenyan = 16:00 UTC ───────────────────────────────────────────
print()
print("4. trading stops at 7pm Kenyan time (16:00 UTC), every day of the year:")
s.check("   the cut-off is 16:00 UTC", settings.autotrade_cutoff_utc, "16:00")


def at_utc(hh, mm):
    """Ask the guard as if the clock read this UTC time. Only the kill switch is stood aside."""
    class _Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 11, 14, hh, mm, tzinfo=timezone.utc)
    real_dt, real_on = guards.datetime, settings.autotrade_enabled
    settings.autotrade_enabled = True
    guards.datetime = _Clock
    try:
        return guards.check("EUR/USD", "buy", "vix1", "demo", 10000.0, 0.10)
    finally:
        guards.datetime, settings.autotrade_enabled = real_dt, real_on


late = at_utc(16, 30)
s.check("   16:30 UTC (7:30pm Kenyan) is refused", bool(late and "cut-off" in late), True)
s.teeth("...and the refusal says the Kenyan time, not just a UTC number",
        bool(late and "Kenyan" in late))
early = at_utc(14, 0)
s.teeth("14:00 UTC (5pm Kenyan, London-New York overlap) is NOT refused by the clock",
        not (early and "cut-off" in early))
s.teeth("exactly at 16:00 UTC is already too late — the cut-off is the stop, not the last minute",
        bool((at_utc(16, 0) or "") and "cut-off" in (at_utc(16, 0) or "")))

# ── 5. THE STOMACH RULE IS IN THE CHAIN ───────────────────────────────────────────────────────
# He asked for "all the requirements including Market state and stomach rule". The stomach rule has
# decided since 2026-11-10 inside `qualifies_for_trade`, which the entry asks through
# `momentum_run` — so this checks the CHAIN exists rather than re-testing the rule itself.
print()
print("5. the stomach rule still decides, and the entry still asks through it:")
mom = (ROOT / "strategies/vix1_momentum.py").read_text(encoding="utf-8")
s.teeth("qualifies_for_trade asks the stomach rule",
        "vix1_open_rule.verdict(" in mom)
s.teeth("...and the entry (momentum_run) asks qualifies_for_trade",
        "if i < 1 or not qualifies_for_trade(h1, i, bullish, symbol)" in mom)

s.done()
