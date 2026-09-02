"""THE ORDER cTRADER REFUSED, AND WHY THE NUMBER WAS WRONG.

01 Sep 2026, the first gold order autotrade ever sent:

    Order volume = 13000.00 is bigger than maximum allowed volume = 5000.00

The risk maths was right — 0.13 lots on a ~42-pip gold stop. The CONVERSION was wrong.
`execution/sizing.py` held one constant, `LOT_UNITS = 100_000`, which is the size of a **currency**
lot. **A gold lot is 100 ounces.** So 0.13 lots was sent as 13,000 units instead of 13, a factor of
1,000, and the broker refused it outright.

WHY NOTHING CAUGHT IT. The symbol list the order path already loads is `ProtoOALightSymbol` — id,
name, enabled, asset ids, category, description. It carries no `lotSize` and no volume limits, so
there was nothing to check the constant against and no reason for anyone to doubt it while only
currency pairs were traded. Adding an instrument re-opened a constant calibrated for the old ones.

THE FIX HAS TWO HALVES, and this file asserts both:
  1. the volume is derived from the broker's OWN `lotSize` (`ProtoOASymbolByIdReq` -> `ProtoOASymbol`)
     when it can be read, and from a per-instrument-class table when it cannot;
  2. the size is fitted to the broker's own step / min / max BEFORE the request leaves, so a size it
     would refuse is refused here with a readable reason instead of arriving as a broker error.

Over the maximum is REFUSED rather than capped. A capped size is not the risk that was asked for.
"""
from _harness import Suite
from execution.orders import build_stop
from execution.sizing import (clamp_to_broker, contract_size_for, lot_units_for, lots_to_volume,
                              plan_size)

s = Suite("ORDER VOLUME — a gold lot is 100 ounces, not 100,000 units")

BROKER = {"GBPUSD": 2, "EURUSD": 1, "USDJPY": 4, "GBPJPY": 7, "XAUUSD": 41}

# WHERE THESE FIXTURE NUMBERS COME FROM, and what is verified versus derived. The live account's
# FULL symbol record could not be read while writing this: the hosted read-only MCP's `get_symbols`
# returns the same `ProtoOALightSymbol` the platform already had (checked against the live demo
# account, 02 Sep 2026 — 1,940 symbols, and XAUUSD came back as exactly
# `{symbolId, symbolName, enabled, baseAssetId, quoteAssetId, symbolCategoryId, description}`,
# which is itself the direct proof of the root cause), and the protobuf token in the local env is
# stale (`CH_ACCESS_TOKEN_INVALID` — Node holds the live one).
#
#   VERIFIED, from the broker's own refusal on 01 Sep 2026:
#     "Order volume = 13000.00 is bigger than maximum allowed volume = 5000.00"
#     The old code put 1,300,000 on the wire for 0.13 lots. The broker printed that as 13,000.00, so
#     the wire figure is hundredths and the broker's ceiling is 5,000 oz -> maxVolume 500,000.
#   DERIVED: a gold lot is 100 oz (the universal contract), so lotSize = 100 * 100 = 10,000.
#   ASSUMED, and labelled as such: min and step at 0.01 lot, which is simply the smallest size
#     `size_lots` can ever produce (MIN_LOTS/LOT_STEP). The RUNNING code never uses these numbers —
#     it reads the broker's own; they exist only to exercise the arithmetic here.
XAU_SPEC = {"lotSize": 10_000, "minVolume": 100, "maxVolume": 500_000, "stepVolume": 100}
EUR_SPEC = {"lotSize": 10_000_000, "minVolume": 100_000,
            "maxVolume": 50_000_000_000, "stepVolume": 100_000}
# A DELIBERATELY COARSE STEP, to prove the quantisation is visible rather than silent.
XAU_COARSE = dict(XAU_SPEC, stepVolume=1_000)


# ── THE EXACT ORDER THAT WAS REFUSED ────────────────────────────────────────
s.check("0.13 lots of gold WAS 13,000 units — the refused number",
        round(0.13 * 100_000 * 100) // 100, 13_000)
s.check("...and is now 1,300 (13 ounces, in hundredths)",
        lots_to_volume(0.13, "XAU/USD"), 1_300)
s.check("...identical when the broker states its own lotSize",
        lots_to_volume(0.13, "XAU/USD", lot_size=XAU_SPEC["lotSize"]), 1_300)

# CURRENCY PAIRS MUST NOT MOVE. His one real filled trade went out at 8,100,000 for 0.81 lots.
s.check("0.81 lots of EUR/USD is unchanged", lots_to_volume(0.81, "EUR/USD"), 8_100_000)
s.check("...and unchanged again from the broker's lotSize",
        lots_to_volume(0.81, "EUR/USD", lot_size=EUR_SPEC["lotSize"]), 8_100_000)
s.check("no symbol at all reproduces the old forex behaviour exactly",
        lots_to_volume(0.81), 8_100_000)
s.check("1.00 lot forex is still 10,000,000 — the documented wire figure",
        lots_to_volume(1.0, "GBP/USD"), 10_000_000)

# EACH METAL HAS ITS OWN CONTRACT. Silver is 5,000 oz, not 100 — assuming gold's would be wrong by
# a factor of 50 in the OTHER direction.
s.check("gold's fallback contract is 100 oz", lot_units_for("XAU/USD"), 100)
s.check("silver's is 5,000 oz, not gold's", lot_units_for("XAG/USD"), 5_000)
s.check("a currency pair falls through to 100,000", lot_units_for("GBP/USD"), 100_000)
s.check("...however it is spelled", lot_units_for("GBPUSD"), 100_000)

# THE FALLBACK NOW SAYS "I DON'T KNOW" INSTEAD OF GUESSING FOREX — the real root cause. The old
# version ended in `return LOT_UNITS`, so every unrecognised instrument was treated as a currency
# pair. Gold was 1,000x out; an index would be 100,000x out. Values from the skill's own
# `assets/symbol_precision_table.json`.
s.check("an index lot is 1 contract, not 100,000 units", contract_size_for("US30"), 1)
s.check("...and so is a crypto lot", contract_size_for("BTCUSD"), 1)
s.check("oil is 1,000 barrels", contract_size_for("USOIL"), 1_000)
s.check("a six-letter currency pair is known", contract_size_for("EURUSD"), 100_000)
s.check("...and the slashed spelling too", contract_size_for("EUR/USD"), 100_000)
s.check("an instrument we have NO figure for returns None", contract_size_for("HK50"), None)
s.check("...and so does no symbol at all", contract_size_for(""), None)

# plan_size is the caller. It must pass the symbol through — the whole defect was that it did not.
_lots, _vol, _pips = plan_size(equity=10_000.0, entry=3_400.00, stop=3_395.80, symbol="XAU/USD",
                               risk_pct=1.0, fixed_lots=0.13)
s.check("plan_size sizes gold in gold's units", _vol, 1_300)
s.check("...and still reports the lots it sized", _lots, 0.13)


# ── THE BROKER'S OWN LIMITS, CHECKED BEFORE THE REQUEST LEAVES ──────────────
_v, _why = clamp_to_broker(1_300, XAU_SPEC)
s.check("a valid gold size passes the broker's limits untouched", (_v, _why), (1_300, None))

_v, _why = clamp_to_broker(1_350, XAU_SPEC)
s.check("a size off the step is quantised DOWN to it", (_v, _why), (1_300, None))

# A COARSE STEP COSTS REAL RISK, and the reduction must be logged, not swallowed. 0.13 lots against
# a 0.1-lot step becomes 0.10 — a quarter of the intended position gone.
_v, _why = clamp_to_broker(1_300, XAU_COARSE)
s.check("a coarse step still quantises down", (_v, _why), (1_000, None))

# THE EXACT NUMBER THE BROKER REFUSED. Even if the lotSize were somehow wrong again, the clamp is a
# second net: 1,300,000 is what went out on 01 Sep and it is now stopped before it leaves.
_v, _why = clamp_to_broker(1_300_000, XAU_SPEC)
s.check("the 01 Sep volume is refused HERE, before the broker sees it",
        "exceeds the broker's maximum" in (_why or ""), True)
s.check("...and is not capped to something he never asked for", _v > 500_000, True)

_v, _why = clamp_to_broker(50, XAU_SPEC)
s.check("under the minimum is refused", "below the broker's minimum" in (_why or ""), True)

_v, _why = clamp_to_broker(13_000, None)
s.check("no spec means no clamping — never invent a limit", (_v, _why), (13_000, None))
_v, _why = clamp_to_broker(1_337, {"lotSize": 10_000})
s.check("a spec with no limits stated clamps nothing", (_v, _why), (1_337, None))


# ── END TO END THROUGH THE REAL REQUEST BUILDER ─────────────────────────────
# The volume the caller computed is the WRONG one on purpose here: 13,000, exactly what was sent on
# 01 Sep. With the broker's spec present, build_stop must discard it and re-derive from the lots.
req, err = build_stop(acct=1, symbol="XAU/USD", side="BUY", volume=13_000,
                      stop_price=3_400.00, sl=3_395.80, tp=3_408.40,
                      expiry_ms=None, symbol_map=BROKER, spec=XAU_SPEC, lots=0.13)
s.check("the gold order now builds", err, None)
s.check("...on the right instrument", req.symbolId if req else None, 41)
s.check("...at 1,300, NOT the 13,000 the broker refused",
        req.volume if req else None, 1_300)

# THE SAME CALL WITHOUT A SPEC still has to produce a sane number, because the spec fetch is allowed
# to fail and must never take a trade down on its own.
req2, err2 = build_stop(acct=1, symbol="XAU/USD", side="BUY", volume=1_300,
                        stop_price=3_400.00, sl=3_395.80, tp=3_408.40,
                        expiry_ms=None, symbol_map=BROKER, spec=None, lots=0.13)
s.check("with no spec the caller's own volume is used unchanged", req2.volume if req2 else None, 1_300)

# A CURRENCY ORDER MUST BE BIT-FOR-BIT WHAT IT WAS. This is the regression that matters most: the
# pairs are what trade every day and nothing about them changed.
req3, err3 = build_stop(acct=1, symbol="GBP/USD", side="SELL", volume=100_000,
                        stop_price=1.35508, sl=1.35538, tp=1.35388,
                        expiry_ms=None, symbol_map=BROKER)
s.check("a currency order with no spec and no lots is untouched",
        (err3, req3.volume if req3 else None), (None, 100_000))
req4, err4 = build_stop(acct=1, symbol="EUR/USD", side="BUY", volume=8_100_000,
                        stop_price=1.16048, sl=1.15986, tp=1.16295,
                        expiry_ms=None, symbol_map=BROKER, spec=EUR_SPEC, lots=0.81)
s.check("...and with the broker's spec it is still 8,100,000",
        (err4, req4.volume if req4 else None), (None, 8_100_000))

# AN INSTRUMENT NOBODY CAN SIZE IS REFUSED, not guessed at as a currency pair. This is the check
# that would have stopped gold BEFORE the broker did, and it is what stops the next new instrument.
_unk, _unk_why = build_stop(acct=1, symbol="HK50", side="BUY", volume=100_000,
                            stop_price=25_000.0, sl=24_900.0, tp=25_200.0,
                            expiry_ms=None, symbol_map={"HK50": 77}, spec=None, lots=0.5)
s.check("an instrument with no known contract size is refused", _unk, None)
s.check("...saying it will not assume a currency pair",
        "Refusing rather than assuming" in (_unk_why or ""), True)
# ...but the broker STATING the size is enough on its own — no table entry needed.
_ok, _ok_why = build_stop(acct=1, symbol="HK50", side="BUY", volume=0,
                          stop_price=25_000.0, sl=24_900.0, tp=25_200.0, expiry_ms=None,
                          symbol_map={"HK50": 77}, spec={"lotSize": 100}, lots=0.5)
s.check("...while the broker's own lotSize lets the same order through", _ok_why, None)
s.check("...at the size the broker's figure gives", _ok.volume if _ok else None, 50)

# A SIZE THE BROKER WOULD REFUSE IS REFUSED HERE, WITH THE REASON. This is the difference between
# "the signal produced no order and nothing says why" and a DM naming the limit.
req5, err5 = build_stop(acct=1, symbol="XAU/USD", side="BUY", volume=0,
                        stop_price=3_400.00, sl=3_395.80, tp=3_408.40,
                        expiry_ms=None, symbol_map=BROKER, spec=XAU_SPEC, lots=60.0)
s.check("60 lots of gold is refused before it is sent", req5, None)
s.check("...naming the broker's maximum", "maximum" in (err5 or ""), True)


# ── TEETH — the assertions can fail ─────────────────────────────────────────
# Without teeth, "gold sizes correctly" would also pass against the broken constant for any symbol
# the table does not know, which is exactly how the defect survived.
s.teeth("gold is not sized as a currency pair", lots_to_volume(0.13, "XAU/USD") != 1_300_000)
_old_v, _old_why = clamp_to_broker(1_300_000, XAU_SPEC)
s.teeth("the volume the broker actually refused is caught here", _old_why is not None)
# And the same order, sized correctly, must NOT be caught — a net that refuses everything is not a
# net. This is the check that would fail if someone "fixed" the clamp by refusing more.
_ok_v, _ok_why = clamp_to_broker(lots_to_volume(0.13, "XAU/USD"), XAU_SPEC)
s.teeth("...while the correctly-sized one passes", _ok_why is None and _ok_v == 1_300)

s.done()
