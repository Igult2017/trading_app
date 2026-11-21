"""
HIS OPTIONS GUIDE AS CODE — which near-the-money strikes are BUY levels (calls) and which are SELL levels (puts).
Pure functions: no browser, no network, nothing stored. `docs/barchart-levels-plan.md` holds his guide verbatim and
his answers of 21 Nov 2026, which override the guide where they differ:

  * DELTA — "Delta is literally above 0.5 both for sells and buys … -0.56, -0.57, -0.65 are above -0.5": a buy needs
    delta >= +0.50, a sell delta <= -0.50.
  * VEGA — "Low Vega favors reversal for both put and calls": LOW for both sides (the guide's tables said High).
  * Signs are as strict for sells as for buys: a buy needs POSITIVE IV skew, a sell NEGATIVE.
  * "Prioritize those that qualify first but for those that have not qualified because of one or 2 factors state clearly
    what failed it and what it was supposed to be." Near the money only (Barchart's Near the Money view).

LOW / HIGH ARE RELATIVE (his guide: "we measure the highness or lowness … by comparing with the numbers above and below
it or the range of the numbers we have"; 17.20 / 18.40 / 18.70 = low / moderate / high). Each measure is ranked within
the strikes of the SAME SIDE: the bottom third by rank is "low", the top third "high". IV 0.00 is an error, never low.
THETA "HIGH" = the bigger number after the minus sign (-20 is higher than -5).
"""
import math

BUY, SELL = "buy", "sell"


def _third(values: list[float]) -> int:
    return max(1, math.ceil(len(values) / 3))


def is_low(value: float | None, pool: list[float]) -> bool:
    if value is None or not pool:
        return False
    s = sorted(pool)
    return value <= s[_third(s) - 1]


def is_high(value: float | None, pool: list[float]) -> bool:
    if value is None or not pool:
        return False
    s = sorted(pool)
    return value >= s[len(s) - _third(s)]


def _bound(pool: list[float], low: bool) -> float:
    s = sorted(pool)
    return s[_third(s) - 1] if low else s[len(s) - _third(s)]


def judge(rows: list[dict], side: str) -> list[dict]:
    """Every strike of one side with what it passed and what failed it, in his words. `rows` are one side's rows
    (`barchart_parse.parse_options`, type Call for BUY, Put for SELL)."""
    ivs = [r["iv"] for r in rows if r.get("iv")]                 # 0.00 / missing IV is an error — not in the pool
    gam = [r["gamma"] for r in rows if r.get("gamma") is not None]
    the = [abs(r["theta"]) for r in rows if r.get("theta") is not None]
    veg = [r["vega"] for r in rows if r.get("vega") is not None]
    out = []
    for r in rows:
        fails = []
        iv = r.get("iv")
        if not iv:
            fails.append("IV 0.00 — an error, cannot be low")
        elif not is_low(iv, ivs):
            fails.append(f"IV {iv:.2f}% — should be low (≤ {_bound(ivs, True):.2f}%)")
        d = r.get("delta")
        if d is None or (d < 0.50 if side == BUY else d > -0.50):
            want = "≥ +0.50" if side == BUY else "≤ -0.50"
            fails.append(f"Delta {'—' if d is None else f'{d:+.2f}'} — should be {want}")
        if not is_high(r.get("gamma"), gam):
            fails.append(f"Gamma {r.get('gamma') or 0:.4f} — should be high (≥ {_bound(gam, False):.4f})")
        t = r.get("theta")
        if t is None or not is_high(abs(t), the):
            fails.append(f"Theta {t or 0:.2f} — should be high (≤ -{_bound(the, False):.2f})")
        if not is_low(r.get("vega"), veg):
            fails.append(f"Vega {r.get('vega') or 0:.2f} — should be low (≤ {_bound(veg, True):.2f})")
        sk = r.get("ivSkew")
        if sk is None or (sk <= 0 if side == BUY else sk >= 0):
            fails.append(f"IV skew {'—' if sk is None else f'{sk * 100:+.2f}%'} — should be "
                         f"{'positive' if side == BUY else 'negative'}")
        out.append({**r, "side": side, "fails": fails})
    return out


def pick(rows: list[dict], side: str, spot_now: float) -> tuple[list[dict], list[dict]]:
    """(full qualifiers, near misses failing 1 or 2 measures) — each sorted closest to price first."""
    judged = judge(rows, side)
    near = lambda r: abs(r["strike"] - spot_now)                        # noqa: E731
    full = sorted([r for r in judged if not r["fails"]], key=near)
    almost = sorted([r for r in judged if 1 <= len(r["fails"]) <= 2], key=near)
    return full, almost


def spot_level(strike: float, futures: float, spot: float) -> float:
    """The level on his cTrader chart: strike × spot ÷ futures (EUR, GBP and gold futures are quoted like spot)."""
    return strike * spot / futures


# ── WHICH WEEK, AND NEAR THE MONEY (read from the live page, 21 Nov 2026) ─────────────────────────────────────
# Each weekday has its own menu entry ("Monday Weekly Options"); its week menu lists the expiries it has, as
# "Week 4: Nov 2026" with a link like /futures/quotes/GCZ26/volatility-greeks/IY4X26 (the futures contract it sits on,
# then the options code). "Week N" = the Nth such weekday of that month: Monday "Week 4: Nov 2026" = Mon 23 Nov 2026.
# The data request has no near-the-money setting — the page cuts it itself — so the cut is made here, the same way:
# "Near the Money" = 10 strikes either side of the futures price.
import re as _re
from datetime import date as _date, timedelta as _td

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
_MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov",
                                        "Dec"], start=1)}
NEAR = 10


def week_expiry(label: str, weekday: int) -> _date | None:
    """'Week 4: Nov 2026' on the Monday menu (weekday 0) → date(2026, 11, 23). None if it cannot be read."""
    m = _re.match(r"\s*Week\s+(\d)\s*:\s*([A-Z][a-z]{2})\w*\s+(\d{4})", label or "")
    if not m or m.group(2) not in _MONTHS:
        return None
    first = _date(int(m.group(3)), _MONTHS[m.group(2)], 1)
    d = first + _td(days=(weekday - first.weekday()) % 7) + _td(weeks=int(m.group(1)) - 1)
    return d if d.month == first.month else None


def choose_week(entries: list[tuple[str, str]], weekday: int, target: _date) -> tuple[str, _date] | None:
    """(link, expiry) — the entry expiring ON `target`, else the first one after it (said in the post). None if none."""
    dated = sorted((d, link) for label, link in entries if (d := week_expiry(label, weekday)) and d >= target)
    return (dated[0][1], dated[0][0]) if dated else None


def near_the_money(rows: list[dict], futures: float, n: int = NEAR) -> list[dict]:
    """One side's rows cut to the n strikes below and the n at or above the futures price."""
    rows = sorted(rows, key=lambda r: r["strike"])
    below = [r for r in rows if r["strike"] < futures][-n:]
    above = [r for r in rows if r["strike"] >= futures][:n]
    return below + above
