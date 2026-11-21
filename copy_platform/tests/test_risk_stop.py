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

# ── a stop that PROTECTS PROFIT is kept exactly (fixed 21 Nov 2026) ───────────────────────────────────
# Live: XAU/USD #265272334 SELL, 20 Nov 02:12 — the master went to breakeven 3551.76 (entry 3552.61) and the follower
# was reset to its 1% loss stop 3577.73 with "master had no stop". Its own numbers, gold pip 0.1, $10 a pip a lot:
sl, why, no = R.follower_stop("SELL", 3552.61, 3551.76, 0.04, BAL, 1.0, 0.1, 10.0)
S.check("SELL: master at breakeven 3551.76 -> follower KEPT there, not reset to 1%", (sl, no), (3551.76, False))
S.check("...and says why", why, "master's stop kept — protects profit")
sl, _, _ = R.follower_stop("BUY", 1.1000, 1.1020, LOTS, BAL, 1.0, PS, PV)
S.check("BUY: master locked +20 pips (stop 1.1020) -> kept", sl, 1.102)
sl, _, _ = R.follower_stop("BUY", 1.1000, 1.1000, LOTS, BAL, 1.0, PS, PV)
S.check("BUY: stop exactly at entry -> kept (it risks nothing)", sl, 1.1)
sl, _, _ = R.follower_stop("SELL", 1.1000, 1.1020, LOTS, BAL, 1.0, PS, PV)
S.check("SELL: a LOSING-side stop is still capped at 1%", sl, 1.101)
_real = R._on_stop_side
R._on_stop_side = lambda a, e, l: False                                   # SABOTAGE: every stop read as profit-side
S.check("TEETH — only a WINNING-side stop escapes the 1% cap (a 2% losing stop must not)",
        R.follower_stop("SELL", 1.1000, 1.1020, LOTS, BAL, 1.0, PS, PV)[0] != 1.101, True)
R._on_stop_side = _real

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

# ── the broker SAYING NO is an answer, not a 20-second wait (21 Nov 2026) ───────────────────────────────
import asyncio  # noqa: E402
from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAOrderErrorEvent  # noqa: E402
refusal = ProtoOAOrderErrorEvent(ctidTraderAccountId=1, errorCode="TRADING_BAD_STOPS",
                                 description="Stop loss is the same as before")
msg = NS(payloadType=refusal.payloadType)
_real_extract = EX.Protobuf.extract
EX.Protobuf.extract = lambda m: refusal
loop = asyncio.new_event_loop()
ex2 = EX.CTraderExecutor(creds={"ctraderId": "1"}, account_type="demo")
ex2._pending_cmd = ("modify", 1, 3577.73, None)
ex2._result_future = loop.create_future()
ex2._on_message(None, msg)
res = ex2._result_future.result() if ex2._result_future.done() else None
S.check("an order-error reply resolves AT ONCE as a failure", (res is not None, res and res.ok), (True, False))
S.check("...with the broker's own code and words",
        res and res.error, "cTrader refused: TRADING_BAD_STOPS — Stop loss is the same as before")
_handler = EX.CTraderExecutor._on_message
src = open(EX.__file__, encoding="utf-8").read()
S.check("TEETH — the handler is what answers it (the call, not a def)",
        "elif ptype in (ProtoOAOrderErrorEvent().payloadType, ProtoOAErrorRes().payloadType):" in src, True)
EX.Protobuf.extract = _real_extract

# ── a MODIFY to the levels the follower already has is not sent ─────────────────────────────────────
import dispatcher as D  # noqa: E402
S.check("same stop and target -> nothing to change", D.same_levels((3577.73, 3495.74), 3577.73, 3495.74), True)
S.check("a new stop -> sent", D.same_levels((3577.73, 3495.74), 3551.76, 3495.74), False)
S.check("no record of the follower's levels -> sent", D.same_levels(None, 3551.76, 3495.74), False)
S.check("both targets absent and the stop equal -> nothing to change", D.same_levels((1.1, None), 1.1, None), True)

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
