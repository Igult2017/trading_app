"""PIX — the price-tick buy/sell ESTIMATE, PER SYMBOL (`pix_tickflow`): the tick rule, its coverage rules, and that one
market's count never touches another's. Hand-built ticks with known answers. (Split out of test_flow.py.)
Run: python tests/pix/test_tickflow.py
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
import strategies.pix_tickflow as TF  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


T0 = 1_600_000_000 // 300 * 300
print("BROKER-STREAMED MARKETS — the price-tick estimate, PER SYMBOL (gold today, any forex pair the moment it is added)")
TF.reset()
base = T0 + 3600
TF.on_tick("XAU/USD", 4000.00, base + 30)                         # first minute: we joined part-way
for i, b in enumerate([4000.10, 4000.20, 4000.20, 4000.10]):     # next minute: up, up, unchanged, down
    TF.on_tick("XAU/USD", b, base + 60 + i)
TF.on_tick("EUR/USD", 1.1000, base + 31)
for i, b in enumerate([1.1001, 1.1000, 1.0999]):                  # EUR/USD: up, down, down
    TF.on_tick("EUR/USD", b, base + 61 + i)
src, m1f = TF.flows("XAU/USD", "M1", now=base + 400)
check("the minute we joined part-way is NOT used", base in m1f, False)
check("gold: up, up, unchanged, down → 2 buyer ticks, 1 seller tick (unchanged not counted)", m1f.get(base + 60), (2.0, 1.0))
check("EUR/USD has its OWN count, untouched by gold's ticks (1 up, 2 down)",
      TF.flows("EUR/USD", "M1", now=base + 400)[1].get(base + 60), (1.0, 2.0))
check("a market with no ticks at all → no figures, no source", TF.flows("GBP/USD", "M1", now=base + 400), ("", {}))
check("...labelled as an estimate", src, "price-tick estimate")
TF.on_tick("XAU/USD", 4000.30, base + 300)                       # 4 minutes of silence → stream was down
check("after a silence of over a minute, the minute where counting resumes is not used",
      (base + 300) in TF.flows("XAU/USD", "M1", now=base + 1000)[1], False)
TF.reset()
s5 = (T0 // 300 + 20) * 300
TF.on_tick("XAU/USD", 4000.0, s5 - 1)
for m in range(5):
    TF.on_tick("XAU/USD", 4000.0 + m + 0.1, s5 + m * 60 + 1)
    TF.on_tick("XAU/USD", 4000.0 + m + 0.05, s5 + m * 60 + 30)
check("a 5M candle = its five 1M counts added (5 up, 5 down)", TF.flows("XAU/USD", "M5", now=s5 + 400)[1].get(s5), (5.0, 5.0))
check("a 5M candle missing one of its minutes is not given a figure",
      TF.flows("XAU/USD", "M5", now=s5 + 250)[1].get(s5), None)
TF.reset()


print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
