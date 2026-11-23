"""sentry_options.parse_panel on the panel text captured LIVE on 23 Nov 2026 (gold and GBP/USD, overnight tab).
Run: cd server/python && python sentry_options_test.py"""
import sys

from sentry_options import parse_panel

BAD = []


def check(name, got, want):
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


GOLD = ("XAU/USD Options expiring 2026-11-24\nEUR/USD\n1.0993\nXAU/USD\n3585.2\nVols\nUSD Pips\nO/N\n1W\n"
        "PUT OPTIONS\t\tCALL OPTIONS\t\nDelta\tPrice\tStrike\tPrice\tDelta\tImp Vol.\n"
        "-0.10\t4.870\t3462.5\t127.60\t0.90\t51.82%-0.25\t14.02\t3524.6\t74.64\t0.75\t49.13%"
        "-0.35\t21.31\t3552.0\t54.56\t0.65\t47.57%-0.50\t34.76\t3586.1\t33.89\t0.50\t45.91%"
        "-0.65\t52.99\t3618.6\t19.68\t0.35\t44.75%-0.76\t69.54\t3642.5\t12.35\t0.24\t44.00%"
        "-0.90\t111.22\t3692.4\t4.153\t0.10\t42.77%\nImplied\nvolatility\nCurrent")
GBP = ("GBP/USD Options expiring 2026-11-24\nEUR/USD\n1.0993\n PUT OPTIONS CALL OPTIONS Delta Price Strike Price Delta "
       "Imp Vol. -0.09 -0.0004 1.3020 0.01708 0.91 10.14%-0.24 -0.0011 1.3065 0.01190 0.76 9.68%-0.34 -0.0014 1.3085 "
       "0.00960 0.66 9.45%-0.49 -0.0017 1.3110 0.00680 0.51 9.22%-0.65 -0.0017 1.3134 0.00445 0.35 9.09%-0.75 -0.0013 "
       "1.3152 0.00304 0.25 9.04%-0.90 0.00064 1.3191 0.00114 0.10 9.07% Implied volatility")

g = parse_panel(GOLD)
check("gold: market and expiry from the heading", (g["market"], g["expiry"]), ("XAU/USD", "2026-11-24"))
check("gold: 7 strikes, low to high", [r["strike"] for r in g["rows"]],
      [3462.5, 3524.6, 3552.0, 3586.1, 3618.6, 3642.5, 3692.4])
check("gold: the 3618.6 row read exactly", g["rows"][4], {"put_delta": -0.65, "put_price": 52.99, "strike": 3618.6,
                                                         "call_price": 19.68, "call_delta": 0.35, "iv": 44.75})
check("the side list's prices (1.0993, 3585.2) are never taken for rows", all(r["strike"] > 3000 for r in g["rows"]), True)
b = parse_panel(GBP)
check("GBP: 7 rows, the negative put prices kept as they are (the map calls them data errors)",
      (len(b["rows"]), b["rows"][0]["put_price"], b["rows"][6]["put_price"]), (7, -0.0004, 0.00064))
check("no table → no rows, no guess", parse_panel("Sentry Derivatives"), {"market": None, "expiry": None, "rows": []})

# ── A TABLE ONLY WHEN IT HAS STOPPED CHANGING (23 Nov 2026 dry run: GBP/USD read mid-redraw, 3 strikes of 7) ───────────
import sentry_options as SO  # noqa: E402

HALF = GBP.replace("-0.09 -0.0004 1.3020 0.01708 0.91 10.14%-0.24 -0.0011 1.3065 0.01190 0.76 9.68%-0.34 -0.0014 1.3085 "
                   "0.00960 0.66 9.45%-0.49 -0.0017 1.3110 0.00680 0.51 9.22%", "")


class Page:
    def __init__(self, texts):
        self.texts, self.n = list(texts), 0

    def evaluate(self, js):
        t = self.texts[min(self.n, len(self.texts) - 1)]
        self.n += 1
        return t

    def wait_for_timeout(self, ms):
        pass


check("the half-drawn GBP table really is 3 rows (the dry run's fault reproduced)", len(parse_panel(HALF)["rows"]), 3)
got = SO._settled_table(Page([HALF, GBP, GBP]), "GBP/USD")
check("half-drawn, then two identical full reads → the full 7-row table", got and len(got["rows"]), 7)
check("a table that never settles on 7 rows → nothing (the next try takes it)",
      SO._settled_table(Page([HALF] * 6), "GBP/USD"), None)
check("the right number of rows but for ANOTHER market (switch not done) → nothing",
      SO._settled_table(Page([GBP] * 6), "EUR/USD"), None)
print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} FAILED'}")
sys.exit(1 if BAD else 0)
