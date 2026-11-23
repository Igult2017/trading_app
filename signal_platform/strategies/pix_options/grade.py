"""PIX OPTIONS — BARCHART'S GRADE on the dealer map (his order 23 Nov 2026: "use barchart data to add any confluence and
grade for the signals … In case there is a good strike from barchart that we don't have on investing.com, you will
calculate its spot price separately … and then send it as signal").

Barchart's picks arrive already judged by his Barchart guide (`server/python/barchart_levels.py`) and already converted
to the level on his chart (strike × spot ÷ futures): each {side "buy"|"sell", strike, spot, fails: [why]} — no fails =
a full qualifier ✅, 1-2 fails = a near miss ⚠️.

BACKING (approved plan, Q3 = A): a Barchart level on the SAME side backs an Investing.com level when it lies within HALF
the gap to the neighbouring Investing.com strike on that side (an outer strike uses the gap on its inner side).
  A = backed by a Barchart full qualifier · B = backed by a near miss · C = no Barchart backing.
A full qualifier that backs NO Investing.com level becomes its own "Barchart level" (grade B — one source), unless it
sits next to the ignored ATM strike or on the wrong side of price (a buy level must be below price, a sell above).
"""
from __future__ import annotations


def _window(strikes: list[float], s: float, toward: float) -> float:
    """Half the gap from strike `s` to its neighbour in the direction of `toward`."""
    i = strikes.index(s)
    up = strikes[i + 1] - s if i + 1 < len(strikes) else None
    dn = s - strikes[i - 1] if i > 0 else None
    gap = (up if toward >= s else dn) or up or dn or 0.0
    return gap / 2


def backing(level: dict, strikes: list[float], picks: list[dict]) -> dict | None:
    """The best Barchart pick backing this level (a full qualifier before a near miss, then the closest), or None."""
    s = level["strike"]
    near = [p for p in picks if p["side"] == level["side"] and abs(p["spot"] - s) <= _window(strikes, s, p["spot"])]
    near.sort(key=lambda p: (bool(p["fails"]), abs(p["spot"] - s)))
    return near[0] if near else None


def grade(m: dict, strikes: list[float], picks: list[dict] | None, live: float) -> dict:
    """Adds `grade` + `barchart` to every level of map `m` (from `mapping.map_market`) and appends Barchart-only levels.
    `picks` None = Barchart did not answer this open → every level C, said in `m["barchart_note"]`."""
    if picks is None:
        for lv in m["levels"]:
            lv["grade"], lv["barchart"] = "C", None
        m["barchart_note"] = "Barchart had no data this open — every level graded C"
        return m
    used = set()
    for lv in m["levels"]:
        p = backing(lv, strikes, picks)
        lv["barchart"] = p
        lv["grade"] = "C" if p is None else ("B" if p["fails"] else "A")
        if p is not None:
            used.add(id(p))
    atm = m.get("atm")
    for p in picks:
        if p["fails"] or id(p) in used:
            continue
        if atm is not None and abs(p["spot"] - atm) <= _window(strikes, atm, p["spot"]):
            continue                                            # next to the ATM strike, which the guide ignores
        if (p["side"] == "buy" and p["spot"] >= live) or (p["side"] == "sell" and p["spot"] <= live):
            continue                                            # a buy level must be below price, a sell above
        m["levels"].append({"label": "Barchart level", "side": p["side"], "strike": p["spot"], "iv": None,
                            "iv_class": "", "delta": None, "speed": "", "sweep": False, "qualified": True,
                            "why": [f"Barchart: every measure qualifies — strike {p['strike']:g} is {p['spot']:g} on "
                                    f"your chart; Investing.com has no level here"],
                            "why_not": [], "grade": "B", "barchart": p})
    m["barchart_note"] = ""
    return m
