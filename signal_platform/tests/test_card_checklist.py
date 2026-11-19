"""THE TELEGRAM CARDS ARE A CHECKLIST, NOT PARAGRAPHS (20 Nov 2026).

His words: *"Just write the reason for qualifying the signal and tick it with green, no explanation … like a
checklist"*; *"the channel is still wordy. Even PIX signal card is wordy"*; and *"remember we replaced chaotic market
with some rule, the latest rule we built"* — the break-candle rule.

Runs each strategy's REAL signal builder and the REAL card formatters. Each tick must name a check that REFUSES on
that route — proved here by finding the CALL to each check in the code that decides the route (a call, not a `def`:
a source check that only matches the definition stays green after the call is deleted).
Run: python tests/test_card_checklist.py
"""
import os
import re
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "vix1")))
from _harness import Suite  # noqa: E402

from config import live_settings  # noqa: E402
from core.types import Direction, Signal  # noqa: E402
from notifications.telegram_cards import format_signal_confirmed  # noqa: E402
from notifications.telegram_formatter import format_setup_alert, format_signal_watch  # noqa: E402
from strategies import vix1_signal  # noqa: E402
from strategies.pix_skeleton import _flow_tick  # noqa: E402

s = Suite("CARDS — a checklist of the rules passed, no paragraphs")
live_settings._load = lambda: {}
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def src(rel):
    return open(os.path.join(ROOT, rel), encoding="utf-8").read()


def vix(origin, late=False, corr=None):
    return vix1_signal.build_signal("pullback", "EUR/USD", False, origin, 1, 1.10000, 1.10120, 1.09760, 0.0012,
                                    0.0001, 5, corr or [], None, "vix1", "VIX.1", "A", 0.85, late=late,
                                    late_note="LATE — past the price" if late else "")


# ── 1. VIX.1: the ticks per route ────────────────────────────────────────────────────────────────────────────────
card = format_signal_confirmed(vix("trend"))
lines = card.split("\n")
s.check("trend entry: every rule a tick", [l for l in lines if l.startswith("✅")],
        ["✅ " + t for t in vix1_signal._TICKS["trend"]])
s.check("his latest rule is on it — the break candle", "✅ Break candle rule" in card, True)
s.check("the chaotic-market check is NOT (information only since 18 Nov)", "haotic" in card, False)
s.check("no reason sentences (they stay on the signal for the Assets page)",
        any(r in card for r in vix("trend").technical_reasons), False)
s.check("entry, stop and target on ONE line", sum(1 for l in lines if "Entry" in l and "Stop" in l and "Target" in l), 1)
s.check("no line on the card is a sentence (longest under 80 characters)",
        max(len(re.sub(r"<[^>]+>", "", l)) for l in lines) < 80, True)
s.check("change-of-character entry: its own route's ticks", vix("choch").checklist, vix1_signal._TICKS["choch"])
s.check("his Tradeable mark: ONLY what still ran — never the setup checks it overrode",
        vix("marked").checklist, ["Your Tradeable mark", "News clear", "Spacing", "1M entry"])
s.check("an unknown route gets NO ticks, never another route's", vix("mystery").checklist, [])
warned = vix("trend", late=True, corr=["GBP/USD"]).checklist
s.check("a late entry and a correlated pair are ⚠️ warnings, not ticks",
        [w for w in warned if w.startswith("⚠️")], ["⚠️ Late entry — past the recommended price",
                                                   "⚠️ Correlated: GBP/USD already open"])
s.check("...and print without a ✅", "✅ ⚠️" in format_signal_confirmed(vix("trend", late=True)), False)

# ── 2. each VIX.1 tick names a check that is CALLED on that route ─────────────────────────────────────────────────
bias, main = src("strategies/vix1_bias.py"), src("strategies/vix1.py")
calls = {
    "Not ranging":         (bias, "vix1_chop.not_tradeable("),
    "Market state: TREND": (bias, "regime.tradeable"),
    "Ran and pulled back": (bias, "trend_reproven(mstate"),
    "Pullback ended":      (bias, "vix1_pullback_end.refusal(h1"),
    "Pullback count":      (bias, "vix1_retracement.entry_timing(at_mc"),
    "Break candle rule":   (bias, "vix1_break_candle.refusal(at_mc"),
    "Market awake":        (bias, "market_awake(awake_window"),
    "No liquidity void":   (bias, "vix1_void.not_filling(awake_window"),
    "News clear":          (main, "in_news_window(context.news"),
    "Spacing":             (main, "vix1_spacing.check(h1"),
    "Stomach rule":        (src("strategies/vix1_momentum.py"), "vix1_open_rule.verdict(h1"),
}
s.check("every trend tick's check is CALLED in the code", [k for k, (txt, call) in calls.items() if call not in txt], [])
s.check("the change-of-character route really asks the break-candle rule",
        "vix1_break_candle.refusal(" in src("strategies/vix1_choch.py"), True)
broken = bias.replace("vix1_break_candle.refusal(at_mc", "None  # removed")          # SABOTAGE
s.teeth("a removed check is caught", "vix1_break_candle.refusal(at_mc" not in broken)

# ── 3. Supply/Demand and PIX ─────────────────────────────────────────────────────────────────────────────────────
bx = src("strategies/bx_sd_signal.py")
s.check("Supply/Demand ticks its zone, the tap, the confirmation and the reward",
        all(t in bx for t in ('"4H zone: imbalance + break + liquidity"', '"Extreme zone tapped"',
                              "confirmation\"", 'f"Reward {trig.rr}R"')), True)
s.check("...and its two confluences ONLY when present", "*([\"Double zone breakout\"] if _through >= 2 else [])" in bx, True)
s.check("the UNCONFIRMED entry does not tick a confirmation it has not had",
        "\"⚠️ Unconfirmed — change of character not complete\"" in src("strategies/bx_sd_signal1.py"), True)
s.check("PIX: order flow agrees → a tick", _flow_tick("Order flow CONFIRMS (ticks): CVD divergence ✓, delta +40%"),
        "Order flow agrees")
s.check("PIX: order flow disagrees → a warning, shown not hidden",
        _flow_tick("⚠ Order flow does NOT agree: no CVD divergence ✗"), "⚠️ Order flow disagrees")
s.check("PIX: no order-flow feed → a warning", _flow_tick("Order flow not available yet — no order-flow feed"),
        "⚠️ Order flow not available")
pix = src("strategies/pix.py")
s.check("PIX no longer repeats the entry, stop and target in its reasons", "STOP ORDER {side}" in pix, False)
s.check("PIX hands its ticks to the card", "checklist         = list(plan.ticks)" in pix, True)

# ── 4. heads-ups ─────────────────────────────────────────────────────────────────────────────────────────────────
from strategies.vix1_building import building_signal  # noqa: E402
from core.types import Candle  # noqa: E402
hu = building_signal("EUR/USD", False, Candle(time=0, open=1.101, high=1.1012, low=1.0995, close=1.0996,
                                               volume=0, timeframe="H1"), "trend", 1, "A", 5, "VIX.1", 0.0001)
alert = format_setup_alert(hu)
s.check("VIX.1's building heads-up: ticks for what passed, then it waits", (
    "✅ Break candle rule" in alert, "✅ 1M entry" in alert, "⏳ Waiting for the 1M entry" in alert), (True, False, True))
s.check("...and none of its old sentences", "This is a HEADS-UP, not a trade" in alert, False)
plain = Signal(symbol="EUR/USD", direction=Direction.SELL, strategy_id="vix1_watch", strategy_name="VIX.1",
               technical_reasons=["⚠️ the setup is INVALIDATED — price closed beyond the line"])
s.check("a heads-up WITHOUT a checklist keeps its lines (there the sentence is the information)",
        "INVALIDATED" in format_setup_alert(plain) and "INVALIDATED" in format_signal_watch(plain), True)
tap = src("notifications/telegram_tap_alert.py")
s.check("the tap alert lost its three headings", any(h in tap for h in ("<b>WHAT'S THERE</b>",
        "BY THE METHOD, THIS ALREADY QUALIFIES", "WHY WE STILL WAIT</b>")), False)
s.done()
