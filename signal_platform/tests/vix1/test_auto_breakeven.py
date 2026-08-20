"""AUTO-BREAKEVEN — the first code that changes his account, so every guard is asserted.

His ask: *"Can you create it such that it is moved automatically to BE when the trade is at 1R."*

The design goal is that the WORST realistic failure is "it did nothing". These checks are the proof
of that claim, one rule at a time:

  1. BOTH LEGS on every amend — cTrader's REST surface DELETES a leg omitted from an amend
     (`Q-R10`), and the protobuf request can tell omitted from set, so the current target is always
     re-passed rather than relying on which behaviour applies.
  2. RATCHET ONLY — a stop moves toward safety or not at all.
  3. NO STOP, NO TOUCH.
  4. RE-READ AFTERWARDS — a vanished take profit is an alarm, not a log line.

Plus: off by default, and refuses a live account.
"""
import asyncio

from _harness import Suite
from config.settings import settings
from data.ctrader_positions import Position
from execution import breakeven
from execution.orders import build_amend

s = Suite("AUTO-BREAKEVEN — the guards on the first code that touches the account")


def P(bullish=True, entry=1.10000, stop=1.09900, target=1.10200, commission=0.35,
      volume=10_000, pid=7):
    return Position(position_id=pid, symbol="EUR/USD", bullish=bullish, volume=volume,
                    entry=entry, stop=stop, target=target, commission=commission, swap=0.0,
                    opened_at=0)


# ── RULE 1: the request carries BOTH legs ───────────────────────────────────
req = build_amend(1, 99, "EUR/USD", 1.10007, 1.10200)
s.check("the amend sets the stop", req.stopLoss, 1.10007)
s.check("...and RE-PASSES the target rather than omitting it", req.HasField("takeProfit"), True)
s.check("...at the value it already had", req.takeProfit, 1.10200)
s.check("a position with genuinely no target leaves the field unset",
        build_amend(1, 99, "EUR/USD", 1.10007, None).HasField("takeProfit"), False)
s.check("prices are rounded to the symbol's precision, not passed raw",
        build_amend(1, 99, "EUR/USD", 1.100071234, 1.102).stopLoss, 1.10007)

# ── the switch: OFF by default ──────────────────────────────────────────────
s.check("shipped OFF — nothing is amended until he sets it",
        settings.auto_breakeven_enabled, False)
s.check("...and `why_not` says exactly that", breakeven.why_not(P(), "demo"), "auto-breakeven is off")

settings.auto_breakeven_enabled = True          # from here on, as if he had switched it on
try:
    # ── RULE 3: no stop, no touch ───────────────────────────────────────────
    s.check("a position with NO stop is left alone",
            "no stop" in (breakeven.why_not(P(stop=None), "demo") or ""), True)

    # ── demo only ───────────────────────────────────────────────────────────
    s.check("a LIVE account is refused",
            "not demo" in (breakeven.why_not(P(), "live") or ""), True)
    s.check("...and demo is allowed", breakeven.why_not(P(), "demo"), None)

    # ── RULE 2: the ratchet ─────────────────────────────────────────────────
    # breakeven for this position is entry + (2 x 0.35) / 10,000 = 1.10007
    s.check("a stop BELOW breakeven may be moved up", breakeven.why_not(P(stop=1.09900), "demo"), None)
    s.check("a stop ALREADY at breakeven is left alone",
            "already at or beyond" in (breakeven.why_not(P(stop=1.10007), "demo") or ""), True)
    s.check("a stop already BEYOND breakeven is left alone",
            "already at or beyond" in (breakeven.why_not(P(stop=1.10050), "demo") or ""), True)
    sell = P(bullish=False, entry=1.10000, stop=1.10100, target=1.09800)
    s.check("SELL mirrors — a stop above breakeven may be moved down",
            breakeven.why_not(sell, "demo"), None)
    s.check("SELL: a stop already below breakeven is left alone",
            "already at or beyond" in (breakeven.why_not(
                P(bullish=False, stop=1.09900, target=1.09800), "demo") or ""), True)
    s.check("unknown size -> no breakeven -> refuse rather than guess",
            "not readable" in (breakeven.why_not(P(volume=0), "demo") or ""), True)

    # ── the ratchet helper itself, both directions ──────────────────────────
    s.check("BUY: higher is safer", breakeven._better(1.1001, 1.1000, True), True)
    s.check("BUY: lower is NOT", breakeven._better(1.0999, 1.1000, True), False)
    s.check("SELL: lower is safer", breakeven._better(1.0999, 1.1000, False), True)
    s.check("SELL: higher is NOT", breakeven._better(1.1001, 1.1000, False), False)
    s.check("equal is not safer — never re-amend to the same price",
            breakeven._better(1.1000, 1.1000, True), False)

    # ── RULE 4: believe the position, not the call ──────────────────────────
    class _Client:
        def __init__(self, creds, account_type):
            pass

        async def amend_sltp(self, position_id, symbol, sl, tp):
            class R:
                ok, error = True, None
            return R()

    import execution.broker as _b
    _b.StopOrderClient = _Client

    def _after(positions):
        async def _f():
            return positions
        breakeven.ctrader_positions.open_positions = _f

    before = P(stop=1.09900)
    _after([P(stop=1.10007, target=1.10200)])
    out = asyncio.run(breakeven.move_to_breakeven(before, {}, "demo"))
    s.check("a good amend reports moved", out.moved, True)
    s.check("...and says the target is intact", "intact" in out.message, True)
    s.check("...and is not an alarm", out.alarm, False)

    _after([P(stop=1.10007, target=None)])          # the TP vanished
    lost = asyncio.run(breakeven.move_to_breakeven(before, {}, "demo"))
    s.check("A VANISHED TAKE PROFIT RAISES THE ALARM", lost.alarm, True)
    s.check("...and says what to do about it", "Re-set it" in lost.message, True)
    s.check("...and tells him to switch the feature off", "switched off" in lost.message, True)

    _after([P(stop=1.09900, target=1.10200)])       # broker said ok but nothing moved
    noop = asyncio.run(breakeven.move_to_breakeven(before, {}, "demo"))
    s.check("a success that did not move the stop is reported as NOT moved", noop.moved, False)

    _after(None)                                     # could not re-read
    blind = asyncio.run(breakeven.move_to_breakeven(before, {}, "demo"))
    s.check("an unverifiable amend says so rather than claiming success",
            "could not be re-read" in blind.message, True)

    # ── TEETH ───────────────────────────────────────────────────────────────
    s.teeth("the ratchet genuinely blocks a backwards move",
            breakeven.why_not(P(stop=1.10050), "demo") is not None)
    s.teeth("the live-account refusal genuinely fires",
            breakeven.why_not(P(), "live") is not None)
    s.teeth("the alarm path is genuinely reachable", lost.alarm is True)
finally:
    settings.auto_breakeven_enabled = False          # leave the switch as we found it

s.check("the switch is restored to OFF after the test", settings.auto_breakeven_enabled, False)
s.done()
