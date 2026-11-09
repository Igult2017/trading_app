"""
myfxbook_parse.py — turn a MyFXBook economic-calendar page into rows. PURE: no network, no browser.

Kept apart from the fetching on purpose. The fetch needs a real browser and 3-6 minutes against a
Cloudflare challenge; the parsing is where the data can silently go WRONG, and it has to be testable
against a saved page in milliseconds. `myfxbook_parse.test.py` does exactly that.

WHAT THE PAGE LOOKS LIKE, measured 2026-11-09 — not assumed:

    Date | Time left | flag | currency | Event | Impact | Previous | Consensus | Actual | All None
    Nov 09, 01:30 |  |  | CNY | Inflation Rate YoY (Oct) | High | 0.9% | 0.8% | 0.7% |

⚠ THE COLUMN ORDER IS Previous, Consensus, Actual — AND IT IS COUNTER-INTUITIVE. Most calendars put
the released number FIRST. Reading it the other way round stores the released value as the previous
one, which is wrong in a way nothing downstream can detect. It was cross-checked against an
independent source before being written here: ForexFactory reported that same CNY release as
previous 0.9%, forecast 0.8%, actual 0.7% — the same three numbers, same order.

⚠ TIMES ARE UTC for an anonymous visitor. Confirmed the same way: ForexFactory timestamps that
release `2026-11-08T20:30:00-05:00`, which is 01:30 UTC, and MyFXBook printed `Nov 09, 01:30`.

⚠ THE DATE CARRIES NO YEAR — only `Nov 09`. Around New Year a December page lists January rows, so
a naive year would date them twelve months late. `_year_for` picks the year that puts the row
closest to the day the page was fetched.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

_MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}

# "Nov 09, 01:30" and also "Nov 09" on a row that only carries a date.
_DATE_RE = re.compile(r"^([A-Z][a-z]{2})\s+(\d{1,2})(?:,\s*(\d{1,2}):(\d{2}))?")
_IMPACTS = {"high": "High", "medium": "Medium", "low": "Low", "holiday": "Holiday"}

#: Headers we need, lower-cased. The currency column has a BLANK header, so it is found by position
#: relative to Event rather than by name.
_WANTED = ("date", "event", "impact", "previous", "consensus", "actual")


def _clean(s: str) -> str:
    return " ".join((s or "").split())


def header_index(headers: list[str]) -> dict[str, int]:
    """Map column name -> position, read from the page's OWN header row.

    Reading the headers rather than hard-coding 0..9 is what makes this survive MyFXBook inserting a
    column. If a needed header is missing the caller gets a KeyError and the scrape FAILS LOUDLY —
    far better than silently shifting Consensus into Actual.
    """
    idx = {}
    for i, h in enumerate(headers):
        key = _clean(h).lower()
        if key in _WANTED and key not in idx:
            idx[key] = i
    missing = [w for w in _WANTED if w not in idx]
    if missing:
        raise KeyError(f"MyFXBook calendar header changed — missing columns: {missing}")
    # The currency sits in one of the blank headers immediately before Event.
    idx["currency"] = idx["event"] - 1
    return idx


def _year_for(month: int, day: int, fetched_at: datetime) -> int:
    """The year that puts this month/day NEAREST the fetch date — so a December page listing
    January rows dates them next year, not twelve months ago."""
    best, best_gap = fetched_at.year, None
    for year in (fetched_at.year - 1, fetched_at.year, fetched_at.year + 1):
        try:
            cand = datetime(year, month, day, tzinfo=timezone.utc)
        except ValueError:
            continue                      # 29 Feb in a non-leap year
        gap = abs((cand - fetched_at).total_seconds())
        if best_gap is None or gap < best_gap:
            best, best_gap = year, gap
    return best


def parse_rows(rows: list[list[str]], headers: list[str], fetched_at: datetime | None = None) -> list[dict]:
    """`rows` is each table row's cells IN PAGE ORDER, blanks included.

    ⚠ BLANK CELLS MUST BE KEPT. Dropping them shifts every later column left, and a row whose Actual
    has not been published yet has a blank there — so the rows that matter most would shift most.
    """
    at = fetched_at or datetime.now(timezone.utc)
    idx = header_index(headers)
    width = max(idx.values()) + 1
    out: list[dict] = []
    last_date: tuple[int, int] | None = None

    for cells in rows:
        if len(cells) < width:
            continue
        cur = _clean(cells[idx["currency"]]).upper()
        if not re.fullmatch(r"[A-Z]{3}", cur):
            continue                      # not an event row (spacer, header, advert)
        event = _clean(cells[idx["event"]])
        if not event:
            continue

        m = _DATE_RE.match(_clean(cells[idx["date"]]))
        if m:
            month, day = _MONTHS.get(m.group(1), 0), int(m.group(2))
            hh, mm = int(m.group(3) or 0), int(m.group(4) or 0)
            last_date = (month, day)
        elif last_date:                   # MyFXBook prints the date once per day, then blanks it
            month, day, hh, mm = last_date[0], last_date[1], 0, 0
        else:
            continue
        if not month:
            continue

        when = datetime(_year_for(month, day, at), month, day, hh, mm, tzinfo=timezone.utc)
        val = lambda name: _clean(cells[idx[name]]) or ""   # noqa: E731
        out.append({
            "currency":  cur,
            "event":     event,
            "impact":    _IMPACTS.get(_clean(cells[idx["impact"]]).lower(), "Low"),
            "previous":  val("previous"),
            "consensus": val("consensus"),
            "actual":    val("actual"),
            "eventTime": when.isoformat().replace("+00:00", "Z"),
        })
    return out
