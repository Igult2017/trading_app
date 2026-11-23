"""PIX OPTIONS — THE MAP MESSAGE for the channel (his order 23 Nov 2026: "The first info send after dealer mapping are only
the levels we are watching for the day and reason for watching each level. Also include what has qualified a level and
what has not qualified"). Laid out like his picture (`Option 2 .png`): top to bottom as on the chart — sell zones, the
ignored ATM, buy zones. The channel takes HTML, so every piece of text is escaped."""
from __future__ import annotations

from datetime import datetime, timezone
from html import escape

SLOT = {"asia": "Sydney open", "ln": "London open", "ny": "New York open"}
DIGITS = {"XAU/USD": 2, "EUR/USD": 5, "GBP/USD": 5}


def _p(market: str, v: float) -> str:
    return f"{v:.{DIGITS.get(market, 5)}f}"


def _bc(lv: dict, market: str) -> str:
    p = lv.get("barchart")
    if not p or lv.get("label") == "Barchart level":        # a Barchart-only level already says so in its reason
        return ""
    mark = "✅ every measure" if not p.get("fails") else "⚠️ near miss: " + "; ".join(p["fails"])
    return f"Barchart backs it — strike {p['strike']:g} → {_p(market, p['spot'])} ({mark})"


def market_block(market: str, m: dict, spot: float, expiry: str) -> list[str]:
    out = [f"<b>{escape(market)}</b> — our price {_p(market, spot)} · overnight options expiring {escape(expiry or '?')}"]
    if m["status"] != "mapped":
        return out + [f"<i>{escape(m['note'])}</i>"]
    rows = sorted(m["levels"], key=lambda x: -x["strike"])
    mid = m["atm"] if m.get("atm") is not None else spot          # a Barchart-only map has no ATM strike
    above = [x for x in rows if x["strike"] > mid]
    below = [x for x in rows if x["strike"] < mid]
    for lv in above + [None] + below:
        if lv is None:
            out.append(f"⚪ {_p(market, m['atm'])} — at the money, ignored (the guide never trades it)"
                       if m.get("atm") is not None else f"⚪ {_p(market, spot)} — our price now")
            continue
        icon = ("🔴 SELL" if lv["side"] == "sell" else "🟢 BUY") if lv["qualified"] else "❌ not watched"
        how = " · buy only after a sweep below + close back above" if lv.get("sweep") and lv["qualified"] else ""
        out.append(f"{icon} <b>{_p(market, lv['strike'])}</b> — {escape(lv['label'])} · grade {lv.get('grade', 'C')}{how}")
        for why in lv["why"]:
            out.append(f"   ✓ {escape(why)}")
        for why in lv["why_not"]:
            out.append(f"   ✗ {escape(why)}")
        if lv.get("speed") and lv["qualified"]:
            out.append(f"   ⚡ {escape(lv['speed'])}")
        if _bc(lv, market):
            out.append(f"   📊 {escape(_bc(lv, market))}")
    for note in (m.get("note"), m.get("barchart_note")):
        if note:
            out.append(f"<i>{escape(note)}</i>")
    return out


def render(slot: str, when: datetime, blocks: list[list[str]]) -> list[str]:
    """ONE MESSAGE PER MARKET (Telegram stops at 4,096 characters; three markets of reasons can pass it, and a cut map
    would silently lose levels). The heading rides on the first."""
    head = [f"🗺 <b>PIX — options dealer map</b> · {SLOT.get(slot, escape(slot or ''))} · "
            f"{when.astimezone(timezone.utc):%a %d %b %H:%M} UTC",
            "Levels watched until the next open. Each is traded ONCE: a 1M touch, then a 1M close back "
            "(the sweep trap: below, then a close back above). Grade A = Barchart agrees fully, B = partly, C = not.", ""]
    out = []
    for i, b in enumerate(blocks):
        out.append("\n".join((head if i == 0 else []) + b)[:4000])
    return out
