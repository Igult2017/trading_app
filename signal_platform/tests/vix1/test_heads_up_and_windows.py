"""Two contradictions found in the 2026-09-08 audit — and one that was DELIBERATELY NOT "fixed".

His instruction before the fixes: *"reason from the underlying so that you dont end up fixing what
does not need a fix and is working only that you dont understand it."*

1. THE HEADS-UP ONLY CLOSED HALF ITS LOOP. A pre-close notification can end in no trade two ways:
   the candle fails to qualify (a stand-down was already sent), or it QUALIFIES and a later gate
   refuses the setup (nothing was sent at all). The second is what happened to him — EUR/USD 6-7 Sep
   logged `qualified=True told=True` nine times and produced no signal, with no message explaining
   it.

2. A MOMENTUM QUESTION WAS GIVEN THE TREND'S WINDOW. `market_awake` asks "has this market produced
   any momentum candle lately" using `is_momentum_candle`, but received `at_mc` — cut from the
   1,500-bar TREND window. The momentum test needs 1,800+ bars or its four-month size floor SILENTLY
   SKIPS, which `vix1_momentum` itself calls "what admitted the 10-Aug 7.5-pip candle".

3. ⛔ WHAT WAS NOT CHANGED, AND MUST NOT BE. `_could_trade` still ignores the leg gate, the shape and
   the quiet test. Tightening it looks like the obvious fix for (1) and would be WRONG: the
   notification fires at T-6, before the candle closes, and the closing bar can itself confirm the
   swing that puts the trend back in shape. Measured on 800 real EUR/USD closing bars, that rescues
   **2.2%** of them (763 unchanged, 18 rescued, 19 broken). Filtering the heads-up on those gates
   would silence exactly those setups.

NOT A BACKTEST: no P&L, no win rate, no trades simulated.
"""
import inspect

from _harness import Suite, load

from strategies import vix1_log, vix1_preclose
from strategies.vix1_bias import _H1_TREND_BARS, _upto
from strategies.vix1_momentum import _LONG_MIN_BARS, long_baseline

s = Suite("VIX.1 — the heads-up closes its loop; momentum gets the momentum window")

# ── 1. THE SECOND STAND-DOWN EXISTS AND TELLS THE TRUTH ────────────────────
print("   a qualified candle whose setup was refused now produces a message:")

sig = inspect.signature(vix1_preclose.standdown_signal)
s.check("standdown_signal can carry a refusal reason", "refused_because" in sig.parameters, True)
s.check("...and it is optional, so the original case is untouched",
        sig.parameters["refused_because"].default, None)

bars = load("EURUSD_H1_live_sep04.csv", "H1")
if bars:
    bar = bars[-1]
    failed = vix1_preclose.standdown_signal("EUR/USD", bar, True, 0.0001, "VIX.1")
    refused = vix1_preclose.standdown_signal("EUR/USD", bar, True, 0.0001, "VIX.1",
                                             refused_because="the uptrend has lost its shape")
    fail_text = " ".join(failed.technical_reasons)
    ref_text = " ".join(refused.technical_reasons)

    s.check("the ORIGINAL message still says the candle did not qualify",
            "did not qualify" in fail_text, True)
    # THE LIE THIS PREVENTS: the original wording on a candle that DID qualify would tell him the
    # opposite of what happened, and its "gave back the move" numbers describe a candle that failed.
    s.check("the NEW message says it DID qualify", "DID qualify" in ref_text, True)
    s.check("   ...and never claims it did not", "did not qualify" in ref_text, False)
    s.check("   ...and names the actual refusal", "lost its shape" in ref_text, True)
    s.check("both go to the DM, never the channel",
            (failed.strategy_id, refused.strategy_id), ("vix1_watch", "vix1_watch"))
    s.check("both are alerts, so neither can be traded",
            (failed.alert_only, refused.alert_only), (True, True))
else:
    print("      SKIP — no local data")

# THE REASON COMES FROM THE LOG, so the message and the log can never tell different stories.
print()
print("   the reason is the one the log just gave:")
vix1_log._last_reason.clear()
s.check("nothing said yet -> no reason", vix1_log.last_reason("EUR/USD"), None)
vix1_log._last_reason["EUR/USD"] = ("[vix1] EUR/USD bias=NONE: the uptrend has lost its shape — it "
                                    "needs a higher high and a higher low | some state block")
s.check("the prefix and the state block are stripped",
        vix1_log.last_reason("EUR/USD"),
        "the uptrend has lost its shape — it needs a higher high and a higher low")
# RECORDED EVEN WHEN THE LINE IS SUPPRESSED. `say` prints on change only; his nine EUR/USD refusals
# were the same reason, so eight of them printed nothing — and every one of those still needs an
# answer to "why is nothing happening".
src = inspect.getsource(vix1_log.say)
s.check("the reason is stored BEFORE the throttle can suppress the line",
        src.index("_last_reason[symbol]") < src.index("stage_tracker.emit"), True)

# ── 2. THE QUIET TEST GETS THE MOMENTUM WINDOW ─────────────────────────────
print()
print("   the quiet test is judged on the momentum window, not the trend window:")
if bars:
    h1 = bars[-3000:]
    mc = len(h1) - 1
    old = _upto(h1[-_H1_TREND_BARS:], h1, mc)     # what it used to get
    new = h1[:mc + 1]                              # what it gets now

    s.check("the old window was BELOW the momentum floor", len(old) >= _LONG_MIN_BARS, False)
    s.check("the new window is at or above it", len(new) >= _LONG_MIN_BARS, True)
    s.check("the four-month yardstick was switched off before", long_baseline(old, len(old) - 1), 0.0)
    s.check("...and is on now", long_baseline(new, len(new) - 1) > 0, True)
    # CAUSALITY IS THE POINT OF `at_mc` AND IT IS KEPT — the window still ENDS at the momentum
    # candle, so the judgement is still about the candle rather than about what came after it.
    s.check("both windows still end on the SAME bar", old[-1].time == new[-1].time, True)

    bias_src = (__import__("pathlib").Path(__file__).resolve().parents[2]
                / "strategies" / "vix1_bias.py").read_text(encoding="utf-8")
    s.check("vix1_bias passes the momentum window to the quiet test",
            "market_awake(awake_window" in bias_src, True)
    # NOTHING ELSE MOVED. Lengthening at_mc globally would change the trend read, which is pinned.
    s.check("the leg gate still gets the trend window", "leg_state(at_mc" in bias_src, True)
    s.check("the trend read still gets the trend window", "trend_state(at_mc" in bias_src, True)
else:
    print("      SKIP — no local data")

# ── 3. ⛔ THE HEADS-UP MUST STAY LOOSE ──────────────────────────────────────
print()
print("   the notification must NOT be tightened — 2.2% of setups are rescued by the close:")
could = inspect.getsource(vix1_preclose._could_trade)
for gate in ("leg_state", "in_shape", "market_awake", "trend_reproven"):
    s.check(f"_could_trade still ignores {gate}", gate in could, False)

s.teeth("the refusal message really carries its reason",
        "lost its shape" in " ".join(
            vix1_preclose.standdown_signal("EUR/USD", bars[-1], True, 0.0001, "VIX.1",
                                           refused_because="the uptrend has lost its shape"
                                           ).technical_reasons) if bars else True)
s.teeth("the plain stand-down really does NOT carry one",
        "lost its shape" not in " ".join(
            vix1_preclose.standdown_signal("EUR/USD", bars[-1], True, 0.0001, "VIX.1"
                                           ).technical_reasons) if bars else True)

s.done()
