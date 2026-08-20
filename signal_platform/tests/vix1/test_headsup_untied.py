"""VIX.1 — THE HEADS-UP IS NOT TIED TO THE ENTRY.

His instruction, 2026-08-20: *"the headsup signal should not be tied to entry, it should be fired
immediately the momentum candle closes."*

WHAT WAS WRONG. The heads-up lived inside `if not raw:` — the ELSE-branch of the 1M entry search. So
it was not a message in its own right at all, it was "we looked for an entry and did not find one".
Two consequences, both bad for a message whose whole job is to be early:

  * it could only be emitted AFTER `m1_signals` had run, never before
  * on a tick where the entry DID exist it was cancelled outright — the one case where the momentum
    candle mattered most produced no heads-up at all

DRIVES THE REAL `analyze`. The bias detector and the entry search have their own suites and are
stubbed here on purpose: what is under test is the WIRING between them — that the heads-up is
emitted on the strength of the closed momentum candle alone, whatever the entry search says.
"""
from _harness import Suite, body, flat_series

import asyncio

from core.types import Direction, MTFCandles, NewsContext, Session, TF
from core.strategy_context import StrategyContext
from core.indicator_types import IndicatorBundle
from core.pattern_types import PatternBundle
from strategies import vix1 as vix1_mod
from strategies.vix1 import Vix1Strategy
from strategies.vix1_state import Bias

s = Suite("VIX.1 — the heads-up is emitted on the CANDLE, not on the entry")

SYM = "EUR/USD"

# ── a feed with a real closed momentum candle at the end ─────────────────────
h1 = flat_series(300, tf="H1")
MC = body(1.1000, 1.1070, tf="H1", t=300)          # the momentum candle, closed
h1 = h1 + [MC]
h4 = flat_series(300, tf="H4")
m1 = flat_series(400, tf="M1")

BIAS = Bias(bullish=True, mc_idx=len(h1) - 1, origin="trend", run_len=1, reason="test leg")


def ctx():
    return StrategyContext(
        symbol=SYM,
        candles=MTFCandles(_data={TF.M1: list(m1), TF.H1: list(h1), TF.H4: list(h4)}),
        indicators=IndicatorBundle(), patterns=PatternBundle(),
        session=[Session.LONDON], news=NewsContext(events=[]),
    )


def run(entry_returns, bias="default"):
    """Drive the real `analyze` with the bias granted and the entry search canned."""
    use = BIAS if bias == "default" else bias
    vix1_mod.detect_bias = lambda *a, **k: use
    vix1_mod.m1_signals = lambda *a, **k: list(entry_returns)
    vix1_mod.vix1_spacing.check = lambda *a, **k: (True, "")
    vix1_mod.is_news_candle = lambda *a, **k: False
    vix1_mod.in_news_window = lambda *a, **k: False
    # A fresh strategy each run: the delivery ledger and _debut are per-instance state, and a second
    # run reusing the first one's ledger would dedup the very signal being asserted.
    st = Vix1Strategy()
    st._debut.note(SYM, h1[-1].time - 10 * 3600)   # not a cold start — see core/instrument_debut
    return asyncio.run(st.analyze(ctx())).signals


def stages(sigs):
    return sorted(x.stage for x in sigs)


# ── 1. NO ENTRY YET — the heads-up fires, as it always did ───────────────────
no_entry = run([])
s.check("with no 1M entry, exactly one signal comes out", len(no_entry), 1)
s.check("...and it is the heads-up", no_entry[0].stage, "building")
s.check("...as a DM, not the channel", no_entry[0].strategy_id, "vix1_watch")
s.check("...with no entry price on it", no_entry[0].entry_price, 0.0)
# The heads-up IS a real setup being watched, so it keeps its Assets-board row — unlike the pre-close
# forecast, which must not take that row from it.
s.check("...and it DOES claim the watching row", no_entry[0].persist_watch, True)

# ── 2. THE ENTRY IS AVAILABLE ON THE SAME TICK — the regression ──────────────
# THIS is the case that used to produce no heads-up at all. It must now produce BOTH.
ENTRY = [{"kind": "pullback", "entry": 1.1075, "sl": 1.1055}]
both = run(ENTRY)
s.check("with an entry on the same tick, BOTH signals come out", len(both), 2)
s.check("...one heads-up and one ready entry", stages(both), ["building", "ready"])
s.check("THE HEADS-UP COMES FIRST — it is the earlier moment", both[0].stage, "building")
s.check("...and the entry second", both[1].stage, "ready")
s.check("the entry is the real one, with a price on it", both[1].entry_price, 1.1075)
s.check("the entry goes to the CHANNEL (no _watch suffix)", both[1].strategy_id, "vix1")

# ── 3. the heads-up is identical either way ─────────────────────────────────
# It must describe the CANDLE, so nothing about it may change because an entry happened to exist.
a, b = no_entry[0], both[0]
s.check("same direction whether or not an entry existed", a.direction == b.direction, True)
s.check("same headline", a.headline == b.headline, True)
s.check("same dedup key — one heads-up per candle either way", a.dedup_key == b.dedup_key, True)
s.check("the key is on the momentum candle's time", str(MC.time) in a.dedup_key, True)

# ── 4. it names ITS OWN moment, not another strategy's ──────────────────────
s.check("the headline is VIX.1's own", a.headline, "BUY — MOMENTUM CANDLE CLOSED")
s.check("the chip says what is actually being waited for", a.label, "WAIT FOR 1M ENTRY")
s.check("...and not the zone vocabulary that used to leak onto it",
        "AWAIT THE RETURN" not in (a.label or ""), True)

# ── 5. a SELL bias mirrors ──────────────────────────────────────────────────
BIAS = Bias(bullish=False, mc_idx=len(h1) - 1, origin="trend", run_len=1, reason="test leg")
sell = run([{"kind": "pullback", "entry": 1.0930, "sl": 1.0950}])
s.check("a SELL bias also emits both", stages(sell), ["building", "ready"])
s.check("...and the heads-up is a SELL", sell[0].direction, Direction.SELL)
s.check("...with the SELL headline", sell[0].headline, "SELL — MOMENTUM CANDLE CLOSED")

# ── TEETH ───────────────────────────────────────────────────────────────────
BIAS = Bias(bullish=True, mc_idx=len(h1) - 1, origin="trend", run_len=1, reason="test leg")
s.teeth("the entry path is genuinely reached (2 signals, not 1)", len(run(ENTRY)) == 2)

# NO BIAS -> NO HEADS-UP. The heads-up is untied from the ENTRY, not from the momentum candle: a tick
# on which the 1HR decided nothing must stay silent, or "untied" would have quietly become "fires on
# every tick".
s.teeth("a tick with no bias emits nothing at all", len(run(ENTRY, bias=None)) == 0)

s.done()
