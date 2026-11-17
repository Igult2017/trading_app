"""test_chaos.py — run with:
    cd signal_platform && python tests/vix1/test_chaos.py

His CHAOTIC-MOVE check (17 Nov 2026), pinned on HIS two pictures — real GBP/USD H1 broker candles:
  picture 2, 5-10 Nov — "directional and intentional candles" — the market to KEEP;
  picture 1, 11-17 Nov — tug-of-war — "the market we want to avoid".
Times below are UTC+3, as on his charts. Reported on the DM only; the last block fails if anything
but the DM announcement reads the module before he says "switch it on".
"""
import datetime
from pathlib import Path

from _harness import Suite, load

from strategies import vix1_chaos as ch          # noqa: E402
from strategies import vix1_momentum_watch as mw  # noqa: E402
from strategies.vix1_momentum import qualifies_for_trade  # noqa: E402

s = Suite("VIX.1 CHAOTIC-MOVE CHECK — his two GBP/USD pictures")
SYM = "GBP/USD"
BARS = load("GBPUSD_H1_nov17_chaos.csv", "H1")


def at(local: str) -> int:
    """Index of the bar opening at this UTC+3 time on his chart."""
    t = int((datetime.datetime.strptime(local, "%Y-%m-%d %H:%M") - datetime.timedelta(hours=3))
            .replace(tzinfo=datetime.timezone.utc).timestamp())
    return next(i for i, c in enumerate(BARS) if c.time == t)


# His 14 momentum candles: (time UTC+3, BUY?, picture, what the check must say)
GOOD = [("2026-11-06 10:00", False), ("2026-11-06 16:00", False),
        ("2026-11-09 19:00", True), ("2026-11-09 22:00", True), ("2026-11-10 12:00", False)]
# Thu 5 Nov 21:00, first of picture 2: since 17 Nov (one whole-candle test — his "test one is enough") it reads
# CHAOTIC (1.8%). The 12 candles before it swing +8.6/-26.2/+9.8/-17.6 pips. Accepted; another rule refuses it anyway.
EDGE = ("2026-11-05 21:00", False)
CHAOS = [("2026-11-12 05:00", False), ("2026-11-12 17:00", False), ("2026-11-12 20:00", False),
         ("2026-11-13 17:00", True), ("2026-11-16 09:00", False), ("2026-11-16 11:00", True),
         ("2026-11-16 17:00", False)]
MISS = ("2026-11-11 16:00", False)   # the drop INTO the chaos after a clean fall — no look-back sees it

print("0. the whole-candle measure, on hand-built candles (known answers):")
from core.types import Candle  # noqa: E402


def _c(o, h, lo, c):
    return Candle(time=0, open=o, high=h, low=lo, close=c, volume=0, timeframe="H1")


_end = [_c(0, 0, 0, 0)]                                   # the candle judged — never read
stacked = [_c(1 + k * .1, 1 + k * .1 + .1, 1 + k * .1, 1 + k * .1 + .1) for k in range(12)] + _end
s.check("12 wickless candles stacked one after another -> 100%", round(ch.clean_travel(stacked, 12), 6), 1.0)
wicky = [_c(1 + k * .1, 1 + k * .1 + .2, 1 + k * .1 - .1, 1 + k * .1 + .1) for k in range(12)] + _end
s.check("the same move, every candle with wicks both sides -> 20% (wicks are travel)",
        round(ch.clean_travel(wicky, 12), 6), 0.2)
saw = [_c(1, 1.1, 1, 1.1) if k % 2 == 0 else _c(1.1, 1.1, 1, 1) for k in range(12)] + _end
s.check("up, down, up, down -> 0% -> chaotic", (ch.clean_travel(saw, 12), ch.is_chaotic(saw, 12)), (0.0, True))
s.check("inside one candle the SHORTER route is counted (open 1.0, high 1.3, low 0.9, close 1.2 -> 0.6)",
        round(ch._travelled(_c(1.0, 1.3, 0.9, 1.2)), 6), 0.6)
s.check("too little history -> not judged", ch.clean_travel(stacked[:5], 4), None)

if not BARS:
    print("   SKIP — GBPUSD_H1_nov17_chaos.csv not present")
else:
    print("\n1. they really are momentum candles (the strategy's own qualifies_for_trade):")
    for when, bull in GOOD + [EDGE] + CHAOS + [MISS]:
        i = at(when)
        s.check(f"{when} {'BUY' if bull else 'SELL'} qualifies", qualifies_for_trade(BARS[:i + 1], i, bull, SYM), True)

    print("\n2. picture 2 (the market to keep) reads CLEAN — 5 of 6 (5 Nov 21:00 accepted as chaotic):")
    for when, bull in GOOD:
        s.check(f"{when} clean", ch.is_chaotic(BARS, at(when)), False)
    s.check(f"{EDGE[0]} — reads chaotic (1.8%), accepted 17 Nov", ch.is_chaotic(BARS, at(EDGE[0])), True)

    print("\n3. picture 1 (the market to avoid) reads CHAOTIC — 7 of 8:")
    for when, bull in CHAOS:
        s.check(f"{when} chaotic", ch.is_chaotic(BARS, at(when)), True)
    s.check(f"{MISS[0]} — the known miss: the 12 candles before it were a clean fall",
            ch.is_chaotic(BARS, at(MISS[0])), False)

    print("\n4. in his chaotic move no 2nd or 3rd momentum candle came — the reason waiting saves money:")
    for when, bull in CHAOS + [MISS]:
        i = at(when)
        s.check(f"{when}: next two candles are not momentum candles",
                [qualifies_for_trade(BARS[:j + 1], j, bull, SYM) for j in (i + 1, i + 2)], [False, False])

    print("\n5. the verdict the DM card carries:")
    tag, line = ch.verdict(BARS, at("2026-11-16 09:00"), False, SYM)
    s.check("chaotic candle -> WAIT tag", tag, "CHAOTIC MOVE · WAIT FOR 2ND/3RD")
    s.check("...and says what would let a trade happen", "No trade unless one of the next 2 candles is momentum too" in line, True)
    s.check("THE GATE refuses his chaotic candle (Mon 16 09:00 SELL)",
            ch.refusal(BARS[:at("2026-11-16 09:00") + 1], False, SYM) is not None, True)
    s.check("THE GATE lets his clean candle through (Fri 06 16:00 SELL)",
            ch.refusal(BARS[:at("2026-11-06 16:00") + 1], False, SYM), None)
    s.check("clean candle -> CLEAN MOVE tag", ch.verdict(BARS, at("2026-11-06 16:00"), False, SYM)[0], "CLEAN MOVE")
    win = BARS[:at("2026-11-16 09:00") + 1]
    got = mw.check(win, SYM)
    s.check("the DM announcement carries it as its fifth item", got is not None and got[4][0], "CHAOTIC MOVE · WAIT FOR 2ND/3RD")
    note = mw.note(SYM, got[1], got[0], 0.0001, "VIX.1", got[2], got[3], got[4])
    # 17 Nov: *"in the DM, i cant tell whether it is passed or not"* — so the card leads with PASSED/FAILED.
    s.check("...the card's FIRST detail says FAILED, plainly", note.technical_reasons[0].startswith(
        "❌ Chaotic market"), True)
    s.check("...the stomach rule gets its own PASSED/FAILED line second",
            note.technical_reasons[1][:1] in ("✅", "❌") and "Stomach rule" in note.technical_reasons[1], True)
    s.check("...line 2 is the verdicts at a glance", note.label.startswith("SELL · ❌ CHAOTIC MARKET · "), True)
    s.check("...less wordy: every detail is one short line", max(len(r) for r in note.technical_reasons) <= 120, True)
    s.check("...and the card stays within the five details shown", len(note.technical_reasons) <= 5, True)
    from notifications.telegram_formatter import format_setup_alert  # noqa: E402
    text = format_setup_alert(note)
    s.check("...the message no longer says '✅ QUALIFIED' (it read as 'passed every test')", "QUALIFIED" in text, False)
    s.check("...it says it is not a trade signal", "Not a trade signal" in text, True)

print("\n5b. HIS EUR/USD candle of 17 Nov, 08:00 EAT — the DM he could not read:")
EUR = load("EURUSD_H1_nov17_chaos.csv", "H1")
if not EUR:
    print("   SKIP — EURUSD_H1_nov17_chaos.csv not present")
else:
    e = len(EUR) - 1
    s.check("the candle is the 08:00 EAT BUY (05:00 UTC)", EUR[e].time, 1794891600)
    s.check("the real check: chaotic (got 0.2% of its travel)",
            (ch.is_chaotic(EUR, e), round(ch.clean_travel(EUR, e), 3)), (True, 0.002))
    got = mw.check(EUR, "EUR/USD")
    n = mw.note("EUR/USD", got[1], got[0], 0.0001, "VIX.1", got[2], got[3], got[4])
    s.check("his card now opens with FAILED", n.technical_reasons[0].startswith("❌ Chaotic market"), True)

print("\n5c. GBP/JPY 17 Nov, 11:00 EAT SELL — the trade that ended at breakeven; the old two-test rule let it in:")
GJ = load("GBPJPY_H1_nov17_chaos.csv", "H1")
if not GJ:
    print("   SKIP — GBPJPY_H1_nov17_chaos.csv not present")
else:
    g = len(GJ) - 1
    s.check("the candle is the 11:00 EAT SELL (08:00 UTC)", (GJ[g].time, GJ[g].close < GJ[g].open), (1794902400, True))
    s.check("it qualifies as a momentum candle", qualifies_for_trade(GJ, g, False, "GBP/JPY"), True)
    s.check("by hand: 16.3 pips got / 339.9 pips travelled = 4.8% -> chaotic",
            (round(ch.clean_travel(GJ, g), 3), ch.is_chaotic(GJ, g)), (0.048, True))
    s.check("THE GATE refuses it", ch.refusal(GJ, False, "GBP/JPY") is not None, True)
    from strategies.vix1_bias import detect_bias  # noqa: E402
    s.check("...and so does the real trade decision", detect_bias(GJ, [], "GBP/JPY"), None)
    _gate = ch.refusal
    try:
        ch.refusal = lambda *a, **k: None
        b = detect_bias(GJ, [], "GBP/JPY")
    finally:
        ch.refusal = _gate
    s.check("...and it is THIS check that refuses it: switched off, the trend route trades the SELL",
            None if b is None else (b.origin, b.bullish), ("trend", False))
    # TEETH: the bodies-only measure that let it in must not come back
    body_only = abs(GJ[g - 1].close - GJ[g - 12].open) / sum(abs(c.close - c.open) for c in GJ[g - 12:g])
    s.teeth("the old bodies-only reading (24%) would NOT have called it chaotic", body_only >= ch.CHAOS_MAX)

print("\n6. the 2nd/3rd-candle exemption (hand-built):")
_real = ch.qualifies_for_trade
try:
    ch.qualifies_for_trade = lambda h1, j, bull, sym: j == 7
    bars = [Candle(time=k, open=1, high=1, low=1, close=1, volume=0, timeframe="H1") for k in range(10)]
    s.check("a momentum candle 1 before -> this is the 2nd", ch.is_second_or_third(bars, 8, True, SYM), True)
    s.check("2 before -> this is the 3rd", ch.is_second_or_third(bars, 9, True, SYM), True)
    ch.qualifies_for_trade = lambda h1, j, bull, sym: j == 6
    s.check("3 before -> too far, it waits", ch.is_second_or_third(bars, 9, True, SYM), False)
finally:
    ch.qualifies_for_trade = _real

print("\n7. it DECIDES (ON since 17 Nov) — on BOTH trading routes, and nowhere else:")
root = Path(__file__).resolve().parents[2]
users = sorted(f.relative_to(root).as_posix() for f in root.rglob("*.py")
               if not f.relative_to(root).as_posix().startswith("tests/") and f.name != "vix1_chaos.py"
               and "vix1_chaos" in f.read_text(encoding="utf-8", errors="replace"))
s.teeth("exactly two readers: the trade decision (vix1_bias) and the DM card (vix1_momentum_watch)",
        users == ["strategies/vix1_bias.py", "strategies/vix1_momentum_watch.py"])
bias_src = (root / "strategies/vix1_bias.py").read_text(encoding="utf-8")
# the CALLS, matched as calls — `def refusal(` lives in another file, so a deleted call cannot hide here
s.teeth("the change-of-character route does NOT ask it (his option A — it refused his 28 Jul trade)",
        bias_src.count("vix1_chaos.refusal(") == 1)
s.teeth("the main route asks it in its refusal list", "vix1_chaos.refusal(h1, bullish, symbol)," in bias_src)
s.teeth("the DM card only DESCRIBES (verdict), never decides (refusal)",
        "vix1_chaos.refusal(" not in (root / "strategies/vix1_momentum_watch.py").read_text(encoding="utf-8"))

s.done()
