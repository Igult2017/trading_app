"""PIX OPTIONS — THE DEALER MAP, his guide applied to the Investing.com overnight table (23 Nov 2026).

His guide: `Desktop\\Options_Dealer_Mapping_Guide.docx`; the rules in plain words: `docs/options-levels.md`. Pure — the
table and our live price in, the map out. The table is the Sentry Derivatives panel Investing.com embeds ("O/N" tab):
its strikes are ALREADY spot levels (his point — no conversion here).

  * ATM = the strike closest to OUR live price → ignored, never plotted or traded (guide Step 1.3).
  * SELL zones above it, outward: Active Dealer Resistance, Main Reclaim Pivot, Main Dealer Ceiling (Step 2).
  * BUY zones below it, outward: Active Dealer Support, Stabilization Support, Sweep Trap Zone (Step 3). DYNAMIC IV SHIFT:
    the 2nd buy strike carrying the highest IV of the three becomes the Sweep Trap; the lowest becomes Stabilization.
  * IV is judged against the strikes DIRECTLY above and below (guide 1.B): above both = HIGH, below both = LOW, between =
    MODERATE; an outer strike against its one neighbour. IV 0, or any negative price, = a data error (guide: "Ignore any
    strike showing 0 IV").
  * QUALIFIED — a sell: put price > call price and IV not HIGH (high IV = a breakout above, not a reversal; the guide
    gives sells no sweep rule, so none is invented). A buy: call price > put price; a buy with HIGH IV (or the Sweep Trap)
    is traded only the sweep way — below, then a close back above (guide matrix: "expect downward sweep first").
  * SPEED from delta (guide 1.B): past ±0.50 = fast, aggressive reaction; otherwise calm.
  * SPOT CHECK (Step 1.2): our live price must lie between the strikes just below and just above the ATM — else
    "spot mismatch", nothing mapped.
"""
from __future__ import annotations

SELL_LABELS = ("Active Dealer Resistance", "Main Reclaim Pivot", "Main Dealer Ceiling")
BUY_LABELS = ("Active Dealer Support", "Stabilization Support", "Sweep Trap Zone")


def iv_class(rows: list[dict], i: int) -> str:
    """HIGH / LOW / MODERATE against the strikes directly above and below (rows sorted by strike)."""
    me = rows[i]["iv"]
    nb = [rows[j]["iv"] for j in (i - 1, i + 1) if 0 <= j < len(rows) and rows[j]["iv"] > 0]
    if not nb:
        return "MODERATE"
    if all(me > v for v in nb):
        return "HIGH"
    if all(me < v for v in nb):
        return "LOW"
    return "MODERATE"


def _bad(r: dict) -> str:
    if not r["iv"] or r["iv"] <= 0:
        return "IV is 0 — a data error, ignored"
    if r["put_price"] < 0 or r["call_price"] < 0:
        return "a negative option price — a data error, ignored"
    return ""


def _speed(delta: float) -> str:
    return "fast, aggressive reaction expected" if abs(delta) > 0.50 else "calm reaction expected"


def _level(rows: list[dict], i: int, side: str, label: str) -> dict:
    r = rows[i]
    cls = iv_class(rows, i)
    why_not, why = [], []
    err = _bad(r)
    sweep = False
    if err:
        why_not.append(err)
    elif side == "sell":
        if r["put_price"] > r["call_price"]:
            why.append(f"put price {r['put_price']:g} > call price {r['call_price']:g} — sellers' side")
        else:
            why_not.append(f"put price {r['put_price']:g} is not above call price {r['call_price']:g}")
        if cls == "HIGH":
            why_not.append(f"IV {r['iv']:.2f}% is HIGH against its neighbours — a breakout above is expected, "
                           f"not a reversal")
        else:
            why.append(f"IV {r['iv']:.2f}% is {cls} against its neighbours — a reversal can hold")
    else:
        if r["call_price"] > r["put_price"]:
            why.append(f"call price {r['call_price']:g} > put price {r['put_price']:g} — buyers' side")
        else:
            why_not.append(f"call price {r['call_price']:g} is not above put price {r['put_price']:g}")
        sweep = label == "Sweep Trap Zone" or cls == "HIGH"
        if sweep:
            why.append(f"IV {r['iv']:.2f}% ({cls}) — expect a sweep BELOW first; buy only after a close back above")
        else:
            why.append(f"IV {r['iv']:.2f}% is {cls} against its neighbours — a clean bounce can hold")
    delta = r["put_delta"] if side == "sell" else r["call_delta"]
    return {"label": label, "side": side, "strike": r["strike"], "iv": r["iv"], "iv_class": cls,
            "delta": delta, "speed": _speed(delta), "sweep": sweep,
            "qualified": not why_not, "why": why, "why_not": why_not}


def map_market(rows: list[dict], live: float) -> dict:
    """{"status": "mapped" | "spot mismatch" | "no data", "atm": strike, "levels": [...], "note": str}."""
    rows = sorted((r for r in rows if r.get("strike")), key=lambda r: r["strike"])
    if len(rows) < 3 or not live:
        return {"status": "no data", "atm": None, "levels": [], "note": "the options table or our price is missing"}
    a = min(range(len(rows)), key=lambda k: abs(rows[k]["strike"] - live))
    lo = rows[a - 1]["strike"] if a > 0 else None
    hi = rows[a + 1]["strike"] if a + 1 < len(rows) else None
    if lo is None or hi is None or not (lo <= live <= hi):
        return {"status": "spot mismatch", "atm": rows[a]["strike"], "levels": [],
                "note": f"our price {live:g} is not between the strikes around the ATM {rows[a]['strike']:g} — the "
                        f"table does not match the market, nothing mapped"}
    above = list(range(a + 1, len(rows)))[:3]
    below = list(range(a - 1, -1, -1))[:3]
    buy_labels = list(BUY_LABELS[:len(below)])
    if len(below) == 3 and rows[below[1]]["iv"] > max(rows[below[0]]["iv"], rows[below[2]]["iv"]):
        buy_labels[1], buy_labels[2] = "Sweep Trap Zone", "Stabilization Support"       # the Dynamic IV Shift
    levels = [_level(rows, i, "sell", SELL_LABELS[k]) for k, i in enumerate(above)]
    levels += [_level(rows, i, "buy", buy_labels[k]) for k, i in enumerate(below)]
    shifted = buy_labels[1] == "Sweep Trap Zone"
    return {"status": "mapped", "atm": rows[a]["strike"], "levels": levels,
            "note": "Dynamic IV Shift: the 2nd buy strike has the highest IV, so it is the Sweep Trap" if shifted else ""}
