"""His copy-risk rules (15 Nov 2026): every copy carries a stop; risk 1% by default, never above 3%;
partial closes copied; a market order's stop sent as a DISTANCE (cTrader rejects prices on market orders).

Runs the real functions: risk_stop, risk_guard.check_trade_risk, the provider's partial-close test, and
the executor's real market-order builder with its send captured.
"""
from types import SimpleNamespace as NS

from _harness import Suite

import risk_stop as R
import risk_guard
from providers.ctrader import _reduced_fraction
import executors.ctrader as EX

S = Suite("copy — every copy carries a stop inside the follower's risk, 1% default, 3% ceiling")
BAL, LOTS, PS, PV = 10_000.0, 1.0, 0.0001, 10.0       # $10k, 1 lot EUR/USD: $10 a pip, 1% = $100 = 10 pips

# ── the risk setting ───────────────────────────────────────────────────────────────────────────────
S.check("no setting -> 1%", R.effective_risk_pct(NS(risk_percent=None)), 1.0)
S.check("2% kept", R.effective_risk_pct(NS(risk_percent=2)), 2.0)
S.check("5% -> 3% (3% is the highest)", R.effective_risk_pct(NS(risk_percent=5)), 3.0)

# ── the stop ───────────────────────────────────────────────────────────────────────────────────────
sl, why, no = R.follower_stop("BUY", 1.1000, None, LOTS, BAL, 1.0, PS, PV)
S.check("master had NO stop -> BUY stop at 1% (10 pips below)", (sl, no), (1.099, False))
sl, why, no = R.follower_stop("BUY", 1.1000, 1.0980, LOTS, BAL, 1.0, PS, PV)
S.check("master stop risks 2% -> moved to 1% (10 pips)", (sl, no), (1.099, False))
sl, why, no = R.follower_stop("BUY", 1.1000, 1.0995, LOTS, BAL, 1.0, PS, PV)
S.check("master stop risks 0.5% -> master's stop kept", (sl, no), (1.0995, False))
sl, why, no = R.follower_stop("SELL", 1.1000, None, LOTS, BAL, 1.0, PS, PV)
S.check("SELL with no stop -> stop ABOVE entry at 1%", (sl, no), (1.101, False))
sl, why, no = R.follower_stop("BUY", 1.1000, None, LOTS, BAL, 3.0, PS, PV)
S.check("a 3% follower gets a 3% stop (30 pips)", (sl, no), (1.097, False))
S.check("a cross with no pip value -> refused, never sent unbounded",
        R.follower_stop("BUY", 0.86, None, LOTS, BAL, 1.0, PS, 0.0)[2], True)
S.check("lots too big for the risk (stop inside 1 pip) -> refused",
        R.follower_stop("BUY", 1.1000, None, 20.0, 1_000, 1.0, PS, PV)[2], True)
S.check("balance not synced -> refused", R.follower_stop("BUY", 1.1, None, 1, None, 1, PS, PV)[2], True)

# ── the 3% ceiling in the guard ────────────────────────────────────────────────────────────────────
acct = NS(balance=BAL)
ok, _ = risk_guard.check_trade_risk(NS(max_trade_risk_pct=10), acct, 1.0, 40, PV)   # 4% of $10k
S.check("a follower who set a 10% cap is still refused at 4% (3% is the ceiling)", ok, False)
ok, _ = risk_guard.check_trade_risk(NS(max_trade_risk_pct=None), acct, 1.0, 10, PV)  # 1%
S.check("a 1% trade passes", ok, True)

# ── a MARKET order's stop is a distance ────────────────────────────────────────────────────────────
S.check("BUY: stop 10 pips below, target 20 above -> distances in 1/100000",
        R.relative_levels("BUY", 1.1000, 1.0990, 1.1020), (100, 200, ""))
S.check("SELL: stop above, target below", R.relative_levels("SELL", 1.1000, 1.1010, 1.0980), (100, 200, ""))
S.check("a stop on the wrong side is refused, not sent", bool(R.relative_levels("BUY", 1.1, 1.2, None)[2]), True)

sent = []
ex = EX.CTraderExecutor(creds={"ctraderId": "1"}, account_type="demo")
ex._symbol_map = {"EURUSD": 1}
ex._volume = lambda symbol, lots: (100000, None)
EX.ctrader_send.send = lambda client, req: sent.append(req)
ex._pending_cmd = ("open", "EURUSD", "BUY", 1.0, 1.0990, 1.1020, "cp-1", 1.1000)
ex._send_command(client=None)
req = sent[-1]
S.check("the real market order carries relativeStopLoss = 100", req.relativeStopLoss, 100)
S.check("...and relativeTakeProfit = 200", req.relativeTakeProfit, 200)
S.check("...and NO absolute stopLoss (cTrader: 'Not supported for MARKET orders')",
        req.HasField("stopLoss"), False)

# ── partial closes ─────────────────────────────────────────────────────────────────────────────────
S.check("master 1.0 -> 0.6 lots = 40% closed", round(_reduced_fraction(1.0, 0.6), 2), 0.4)
S.check("no change -> nothing to copy", _reduced_fraction(1.0, 1.0), None)
S.check("follower 0.50 lots, master closed 40% -> close 0.20", R.reduce_lots(0.5, 0.4), 0.2)
S.check("0.02 lots, 60% closed -> close 0.01, leaving the 0.01 minimum open", R.reduce_lots(0.02, 0.6), 0.01)
S.check("a share above what is held closes all of it", R.reduce_lots(0.30, 1.5), 0.3)

# ── TEETH ──────────────────────────────────────────────────────────────────────────────────────────
saved = R.MAX_RISK_PCT
R.MAX_RISK_PCT = 99
broke = R.effective_risk_pct(NS(risk_percent=5)) != 3.0
R.MAX_RISK_PCT = saved
S.teeth("the 3% ceiling fails when removed", broke)
saved_hard = risk_guard.HARD_MAX_TRADE_RISK_PCT
risk_guard.HARD_MAX_TRADE_RISK_PCT, saved_env = 99, risk_guard.MAX_TRADE_RISK_PCT
risk_guard.MAX_TRADE_RISK_PCT = 99
broke = risk_guard.check_trade_risk(NS(max_trade_risk_pct=10), acct, 1.0, 40, PV)[0] is True
risk_guard.HARD_MAX_TRADE_RISK_PCT, risk_guard.MAX_TRADE_RISK_PCT = saved_hard, saved_env
S.teeth("the guard's ceiling fails when removed", broke)

S.done()
