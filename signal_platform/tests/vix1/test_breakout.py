"""test_breakout.py — run with:
    cd signal_platform && python tests/vix1/test_breakout.py

HIS RULES OF 23 NOV 2026 on a breakout from a RANGING market's band, proven on HIS day — the broker's real GBP/USD
H1 candles of 23 Nov 2026 (`GBPUSD_H1_nov23_breakout.csv`, the last 3,200 bars to 15:00 UTC). Through the REAL
`detect_bias` and `trend_state`, nothing re-implemented. Times are UTC (his chart is UTC+3).

What he saw: the band 1.30755-1.31289, a failed break UP at 08:00 (back inside at 09:00), then the break DOWN at
13:00 (13 p, not a momentum candle) and a 22-pip SELL momentum candle at 14:00 — autotrade took nothing.
"""
import datetime

from _harness import Suite, load

from strategies import vix1_breakout, vix1_log, vix1_regime, vix1_trend
from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS, detect_bias
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import trend_state

s = Suite("VIX.1 BREAKOUT FROM A RANGING BAND — his 23 Nov GBP/USD")
SYM = "GBP/USD"
BARS = load("GBPUSD_H1_nov23_breakout.csv", "H1")
vix1_log.say = lambda sym, msg, logger=None: True          # the log is not what is tested
vix1_log.note = lambda sym, msg: None


def at(hhmm: str) -> int:
    t = int(datetime.datetime(2026, 11, 23, int(hhmm[:2]), int(hhmm[3:]), tzinfo=datetime.timezone.utc).timestamp())
    return next(k for k, c in enumerate(BARS) if c.time == t)


def bias(hhmm: str):
    return detect_bias(BARS[:at(hhmm) + 1], [], SYM)


def state(hhmm: str):
    h = BARS[:at(hhmm) + 1]
    w = h[-_H1_TREND_BARS:]
    return trend_state(w, n=_H1_SWING_N, turns=structure_turns(w, _H1_SWING_N))


if not BARS:
    print("   SKIP — GBPUSD_H1_nov23_breakout.csv not present")
else:
    print("THE DATA")
    s.check("3,200 bars, ending on the 15:00 UTC candle of 23 Nov", (len(BARS), BARS[-1].time == BARS[at("15:00")].time),
            (3200, True))
    s.check("the candles he described: 08:00 close 1.31344, 09:00 1.31137, 13:00 1.30690, 14:00 1.30471",
            [BARS[at(t)].close for t in ("08:00", "09:00", "13:00", "14:00")], [1.31344, 1.31137, 1.3069, 1.30471])

    print("\nTHE FAILED BREAKOUT UP DOES NOT COUNT (his rule)")
    st8, st9 = state("08:00"), state("09:00")
    s.check("08:00: closed above the band out of a RANGING market — a breakout up, unproven", (st8.breakout, st8.pending),
            (1, 1))
    s.check("09:00: back inside — the downtrend comes back (it did not establish a trend or break structure)",
            st9.direction, -1)
    s.check("...the band stretched on the failed side to how far it reached: 1.31433", (st9.protected, st9.stretched),
            (1.31433, 1.31433))
    s.check("...the other line untouched: 1.30755", st9.bos_price, 1.30755)
    s.check("its OWN high never proved it (the old code 'confirmed' the turn with the breakout candle's high)",
            st8.direction, 0)

    print("\nTHE BREAKOUT DOWN, ON THE OPPOSITE SIDE")
    for t in ("08:00", "09:00", "10:00", "11:00", "12:00"):
        s.check(f"{t}: no trade", bias(t), None)
    s.check("13:00: closed below the band, but NOT a momentum candle by standard — waits, no trade", bias("13:00"), None)
    b14 = bias("14:00")
    s.check("14:00: the SELL momentum candle after the breakout — TRADED, by the breakout route",
            (b14 is not None, b14 and b14.bullish, b14 and b14.origin, b14 and b14.mc_idx == at("14:00")),
            (True, False, "breakout", True))

    print("\nA SAME-SIDE BREAKOUT MUST GO PAST WHERE THE FAILED ONE GOT")
    h9 = BARS[:at("09:00") + 1]
    w9 = h9[-_H1_TREND_BARS:]
    from core.types import Candle

    def with_close(close):
        c = Candle(time=h9[-1].time + 3600, open=1.3120, high=max(close, 1.3120), low=min(close, 1.3120), close=close,
                   volume=0, timeframe="H1")
        return h9 + [c], w9 + [c]
    h, w = with_close(1.31400)        # above the old body top (1.31344) but below the failed breakout's high
    s.check("a close at 1.31400 is still INSIDE the stretched band (1.31433) — not a breakout",
            vix1_breakout.find(h, w, st9, _H1_SWING_N), None)
    h, w = with_close(1.31480)
    got = vix1_breakout.find(h, w, st9, _H1_SWING_N)
    s.check("a close at 1.31480, past 1.31433 — a breakout up", got and got[1], 1)

    print("\nTHE FIRST CANDLE BY STANDARD; LATER CANDLES THE NORMAL WAY (his correction: 'the first candle')")
    k13, k14 = at("13:00"), at("14:00")
    h14 = BARS[:k14 + 1]
    s.check("the 14:00 candle as the FIRST candle: momentum by standard + stomach -> trades",
            vix1_breakout.pick(h14, k14, -1, SYM)[0], k14)
    s.check("the 13:00 candle as the first candle: not momentum -> waits", vix1_breakout.pick(BARS[:k13 + 1], k13, -1,
                                                                                              SYM)[0], None)
    real_mom, real_q = vix1_breakout.is_momentum_candle, vix1_breakout.qualifies_for_trade
    vix1_breakout.is_momentum_candle = lambda *a: False      # passes ONLY the normal way (margin / memory)
    vix1_breakout.qualifies_for_trade = lambda *a: True
    s.check("a FIRST candle that qualifies only by margin/memory does NOT trade", vix1_breakout.pick(h14, k14, -1,
                                                                                                    SYM)[0], None)
    s.check("...the same candle AFTER the first one DOES (normal qualification)", vix1_breakout.pick(h14, k13, -1,
                                                                                                    SYM)[0], k14)
    vix1_breakout.is_momentum_candle, vix1_breakout.qualifies_for_trade = real_mom, real_q

    print("\nTEETH — each rule removed on purpose")
    real_r_t, real_r = vix1_trend.ranging, vix1_regime.ranging
    vix1_trend.ranging = vix1_regime.ranging = lambda highs, lows: False
    s.check("TEETH: if the market is not read as RANGING, the 14:00 SELL is not traded (the old day)", bias("14:00"), None)
    vix1_trend.ranging, vix1_regime.ranging = real_r_t, real_r
    real_entry = vix1_breakout.entry
    vix1_breakout.entry = lambda *a, **k: (None, None)
    s.check("TEETH: without the breakout route, nothing trades 14:00", bias("14:00"), None)
    vix1_breakout.entry = real_entry
    s.check("...and with everything restored it trades again", bias("14:00") is not None, True)
s.done()
