"""
WHICH DAY'S OPTIONS, AND THE CHANNEL POST — pure functions (no browser, no network).

THE DAY (his guide + answers, 21 Nov 2026): "1-Day Expiration: select the next trading day's expiration. Monday → Tuesday,
Friday → Monday." The session's own day decides: London and New York use their own date; the Asia open (Sydney 08:10)
uses SYDNEY's date — so Monday evening in Kenya (Tuesday in Sydney) reads Wednesday's options. No Sunday Asia open
(`server/scrapers/bcLimits.ts`).

THE POST: per market — the futures and spot used, then BUY levels (calls) and SELL levels (puts) as strike → spot
level. ✅ = every rule passed; ⚠️ = missed by one or two, with what failed and what it should be (his answer 4).
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

SESSION_ZONE = {"asia": "Australia/Sydney", "ln": "Europe/London", "ny": "America/New_York"}
SESSION_NAME = {"asia": "ASIA (SYDNEY)", "ln": "LONDON", "ny": "NEW YORK"}


def session_day(slot: str, now: datetime) -> date:
    return now.astimezone(ZoneInfo(SESSION_ZONE[slot])).date()


def next_trading_day(day: date) -> date:
    nxt = day + timedelta(days=1)
    while nxt.weekday() >= 5:                       # Saturday / Sunday → Monday
        nxt += timedelta(days=1)
    return nxt


def expiry_for(slot: str, now: datetime | None = None) -> date:
    return next_trading_day(session_day(slot, now or datetime.now(timezone.utc)))


def _line(r: dict, futures: float, spot: float, digits: int, ok: bool) -> str:
    lvl = r["strike"] * spot / futures
    sd = 4 if digits >= 4 else 0                     # currency strikes 1.1000, gold strikes 3600
    head = f"{'✅' if ok else '⚠️'} {r['strike']:.{sd}f} → <code>{lvl:.{digits}f}</code>"
    return head if ok else f"{head} — " + "; ".join(r["fails"])


def format_market(name: str, contract: str, futures: float, spot: float, digits: int,
                  buys: tuple[list, list], sells: tuple[list, list], note: str = "") -> list[str]:
    lines = [f"<b>{name}</b> · {contract} {futures:.{digits}f} · spot {spot:.{digits}f}"]
    if note:
        lines.append(f"<i>{note}</i>")
    for title, (full, near) in (("🟢 BUY levels", buys), ("🔴 SELL levels", sells)):
        lines.append(title)
        body = ([_line(r, futures, spot, digits, True) for r in full] +
                [_line(r, futures, spot, digits, False) for r in near])
        lines += body or ["none today"]
    return lines


def format_post(slot: str, now: datetime, expiry: date, markets: list[list[str]]) -> str:
    day = session_day(slot, now)
    head = [f"📊 <b>OPTIONS LEVELS — {SESSION_NAME[slot]} OPEN</b>",
            f"<i>{day:%a %d %b} · options expiring {expiry:%a %d %b}</i>"]
    out = head
    for m in markets:
        out += ["━━━━━━━━━━━━━━━━━━━", *m]
    return "\n".join(out)
