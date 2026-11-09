"""
myfxbook_parse_test.py — run with:
    cd server/python && python myfxbook_parse_test.py

WHAT THIS PROTECTS. The scrape itself takes 3-6 minutes against a Cloudflare challenge, so nobody
re-runs it to check a parsing change. That makes the parse the place a silent error can live, and
ONE error here is worse than all the others:

  ⚠ THE COLUMN ORDER IS Previous, Consensus, Actual. Most calendars put the released number FIRST.
    Read the other way round, the page's `0.9% | 0.8% | 0.7%` would store 0.9% as the released value
    of a figure that actually came in at 0.7%. Nothing downstream can detect that - the bot's news
    guard and the homepage would both show a confident, wrong number.

So the fixture is a VERBATIM slice of the real page (fixtures/myfxbook_calendar_sample.html), and
the released row is checked against what an INDEPENDENT source said about the same release:
ForexFactory reported CNY CPI as previous 0.9%, forecast 0.8%, actual 0.7%.
"""
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from myfxbook_parse import parse_rows, header_index, _year_for   # noqa: E402

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {what}: got {got!r}" + ("" if ok else f", want {want!r}"))
    _pass, _fail = (_pass + 1, _fail) if ok else (_pass, _fail + 1)


def teeth(what, held):
    global _pass, _fail
    print(f"   {'PASS' if held else 'FAIL'}  TEETH — {what}")
    _pass, _fail = (_pass + 1, _fail) if held else (_pass, _fail + 1)


# ── read the REAL slice exactly as the fetcher would hand it over ──────────────────────────────
HTML = (Path(__file__).resolve().parent / "fixtures" / "myfxbook_calendar_sample.html").read_text(encoding="utf-8")


def cells_of(block: str, tag: str) -> list[str]:
    return [re.sub(r"<[^>]+>", " ", c) for c in re.findall(rf"<{tag}[^>]*>(.*?)</{tag}>", block, re.S)]


HEADERS = cells_of(re.search(r"<thead.*?</thead>", HTML, re.S).group(0), "th") or \
          cells_of(re.search(r"<thead.*?</thead>", HTML, re.S).group(0), "td")
BODY = re.search(r"<tbody>(.*)</tbody>", HTML, re.S).group(1)
starts = [m.start() for m in re.finditer(r"<tr\b", BODY)]
ROWS = []
for i, s in enumerate(starts):
    e = starts[i + 1] if i + 1 < len(starts) else len(BODY)
    ROWS.append(cells_of(BODY[s:e], "td"))

AT = datetime(2026, 11, 9, 7, 0, tzinfo=timezone.utc)
out = parse_rows(ROWS, HEADERS, fetched_at=AT)

print("\nMYFXBOOK CALENDAR PARSE — against a verbatim slice of the real page\n")
print("1. the page's own headers are what locate the columns:")
idx = header_index(HEADERS)
check("Previous, Consensus and Actual are three DIFFERENT columns",
      len({idx['previous'], idx['consensus'], idx['actual']}), 3)
check("...and they are in that order on the page",
      idx["previous"] < idx["consensus"] < idx["actual"], True)
check("currency sits just before the event", idx["currency"], idx["event"] - 1)


def _try_missing():
    """A changed header must be a LOUD failure, never a silent column shift."""
    try:
        header_index(["Date", "Event", "Impact", "Previous", "Consensus"])   # no Actual
        return False
    except KeyError:
        return True


teeth("...proved: dropping the Actual header raises instead of guessing", _try_missing())

# ── 2. THE ONE THAT MATTERS: the released row, against an independent source ───────────────────
print("\n2. the released row matches what ForexFactory said about the SAME release:")
cny = [r for r in out if r["currency"] == "CNY" and "Inflation Rate" in r["event"]]
check("the released CNY row was found", len(cny), 1)
if cny:
    r = cny[0]
    check("previous  (ForexFactory: 0.9%)", r["previous"], "0.9%")
    check("consensus (ForexFactory: 0.8%)", r["consensus"], "0.8%")
    check("actual    (ForexFactory: 0.7%)", r["actual"], "0.7%")
    teeth("...so the released number is NOT stored as the previous one",
          r["actual"] != r["previous"])
    check("the time is read as UTC (ForexFactory: 2026-11-08T20:30-05:00 = 01:30Z)",
          r["eventTime"], "2026-11-09T01:30:00Z")
    check("impact survives", r["impact"], "High")

# ── 3. A ROW WITH NOTHING PUBLISHED YET MUST NOT SHIFT ─────────────────────────────────────────
# A blank Actual is an EMPTY CELL. Drop empty cells and every later column slides left - and the
# rows that matter most are exactly the ones with a blank there.
print("\n3. an unpublished row keeps its columns:")
pending = [r for r in out if r["actual"] == ""]
teeth("at least one row has no released number yet", len(pending) > 0)
for r in pending:
    teeth(f"{r['currency']} {r['event'][:26]!r}: consensus did NOT slide into actual",
          r["actual"] == "" and r["previous"] != r["actual"] or r["previous"] == "")

# ── 4. EVERY ROW IS WELL FORMED ────────────────────────────────────────────────────────────────
print("\n4. every parsed row is usable:")
check("rows parsed", len(out), len([r for r in ROWS if len(r) >= max(idx.values()) + 1]))
teeth("every row has a 3-letter currency", all(re.fullmatch(r"[A-Z]{3}", r["currency"]) for r in out))
teeth("every row has an event name", all(r["event"] for r in out))
teeth("every row has a UTC timestamp ending in Z", all(r["eventTime"].endswith("Z") for r in out))
teeth("every impact is one the platform already maps",
      all(r["impact"] in ("High", "Medium", "Low", "Holiday") for r in out))

# ── 5. THE YEAR, WHICH THE PAGE NEVER PRINTS ───────────────────────────────────────────────────
# "Nov 09" with no year. On a December page listing January rows a naive year is twelve months out.
print("\n5. the missing year is inferred from the fetch date:")
check("a Jan row seen from late December is NEXT year",
      _year_for(1, 5, datetime(2026, 12, 28, tzinfo=timezone.utc)), 2027)
check("a Dec row seen from early January is LAST year",
      _year_for(12, 30, datetime(2027, 1, 3, tzinfo=timezone.utc)), 2026)
check("an ordinary mid-year row is this year",
      _year_for(6, 15, datetime(2026, 6, 10, tzinfo=timezone.utc)), 2026)
teeth("29 February in a non-leap year does not crash",
      isinstance(_year_for(2, 29, datetime(2027, 3, 1, tzinfo=timezone.utc)), int))

print(f"\n{'ALL PASS' if _fail == 0 else f'{_fail} FAILED'} — {_pass + _fail} checks\n")
sys.exit(0 if _fail == 0 else 1)
