"""PIX OPTIONS — THE TEXT UNDER THE MAP PICTURE for the channel (his order 23 Nov 2026: "The first info send after dealer
mapping are only the levels we are watching for the day and reason for watching each level").

ONLY WHAT QUALIFIED (his word, later the same day: *"only map what qualifies and if nothing does dont. Only map the ones
that have qualified"*). This replaced listing the levels that did not qualify and the "not mapped" lines: a level or a
market that did not qualify is simply not in the message. Top to bottom as on the chart (`charting/levels_map.py`, his
`Option 2 .png`): sell levels, our price, buy levels. The channel takes HTML, so every piece of text is escaped."""
from __future__ import annotations

from datetime import datetime, timezone
from html import escape

SLOT = {"asia": "Sydney open", "ln": "London open", "ny": "New York open"}
DIGITS = {"XAU/USD": 2, "EUR/USD": 5, "GBP/USD": 5}
CAPTION = 1000                       # Telegram's photo caption stops at 1,024 characters; a little kept spare


def _p(market: str, v: float) -> str:
    return f"{v:.{DIGITS.get(market, 5)}f}"


def _bc(lv: dict, market: str) -> str:
    p = lv.get("barchart")
    if not p or lv.get("label") == "Barchart level":        # a Barchart-only level already says so in its reason
        return ""
    mark = "✅ every measure" if not p.get("fails") else "⚠️ near miss: " + "; ".join(p["fails"])
    return f"Barchart backs it — strike {p['strike']:g} → {_p(market, p['spot'])} ({mark})"


def qualified(m: dict) -> list[dict]:
    """The levels of a map that qualified — the only ones mapped, saved, drawn and watched."""
    return [x for x in m.get("levels", []) if x.get("qualified")] if m.get("status") == "mapped" else []


def market_block(market: str, m: dict, spot: float, expiry: str) -> list[str]:
    """The text for ONE market — its QUALIFIED levels only. [] when none qualified: the market is not posted at all."""
    levels = qualified(m)
    if not levels:
        return []
    out = [f"<b>{escape(market)}</b> — our price {_p(market, spot)} · overnight options expiring {escape(expiry or '?')}"]
    rows = sorted(levels, key=lambda x: -x["strike"])
    above = [x for x in rows if x["strike"] > spot]
    below = [x for x in rows if x["strike"] <= spot]
    for lv in above + [None] + below:
        if lv is None:
            out.append(f"⚪ {_p(market, spot)} — our price now")
            continue
        icon = "🔴 SELL" if lv["side"] == "sell" else "🟢 BUY"
        how = " · buy only after a sweep below + close back above" if lv.get("sweep") else ""
        out.append(f"{icon} <b>{_p(market, lv['strike'])}</b> — {escape(lv['label'])} · grade {lv.get('grade', 'C')}{how}")
        for why in lv["why"]:
            out.append(f"   ✓ {escape(why)}")
        if lv.get("speed"):
            out.append(f"   ⚡ {escape(lv['speed'])}")
        if _bc(lv, market):
            out.append(f"   📊 {escape(_bc(lv, market))}")
    for note in (m.get("note"), m.get("barchart_note")):
        if note:
            out.append(f"<i>{escape(note)}</i>")
    return out


def title(market: str, slot: str, when: datetime) -> str:
    """The heading drawn on the picture (plain text — the image is not HTML)."""
    return (f"{market} — PIX options dealer map · {SLOT.get(slot, slot or '')} · "
            f"{when.astimezone(timezone.utc):%a %d %b %H:%M} UTC")


def text(slot: str, when: datetime, block: list[str]) -> str:
    """The whole text that goes under one market's picture."""
    head = [f"🗺 <b>PIX — options dealer map</b> · {SLOT.get(slot, escape(slot or ''))} · "
            f"{when.astimezone(timezone.utc):%a %d %b %H:%M} UTC",
            "Watched until the next open. Each is traded ONCE: a 1M touch, then a 1M close back (the sweep trap: "
            "below, then a close back above). Grade A = Barchart agrees fully, B = partly, C = not.", ""]
    return "\n".join(head + block)


def split(full: str, limit: int = CAPTION) -> tuple[str, str]:
    """(caption under the picture, the rest as a following message) — cut on a line, never mid-line, so no level is
    half-shown. "" for the rest when it all fits."""
    if len(full) <= limit:
        return full, ""
    lines, cap = full.split("\n"), []
    while lines and len("\n".join(cap + [lines[0]])) <= limit:
        cap.append(lines.pop(0))
    return "\n".join(cap), "\n".join(lines)[:4000]
