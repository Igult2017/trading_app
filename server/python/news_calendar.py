"""
Two separate jobs that fail in completely different ways: the ECONOMIC CALENDAR, and the CENTRAL
BANK INTEREST RATES. Keep them apart when reading this file.

THE CALENDAR — ForexFactory's weekly JSON feed. One plain HTTPS request, no browser.
  MyFXBook was the source until 2026-09-09, when its Cloudflare challenge stopped yielding to real
  visible Chrome even from a home connection (twice, 0 events). It is GONE, not degraded, and all of
  its machinery is deleted. This feed publishes the same four impact words the platform already maps
  (High/Medium/Low/Holiday) and a full timestamp per row. See `_FF_URL` for what else was tested and
  why it was rejected. Coverage is THIS WEEK ONLY. On failure this returns [] and the Node service
  keeps serving the last good cache (see homepageCalendar.ts). Forex and commodity events only —
  crypto and stock rows are dropped, on his instruction.

THE RATES — the issuing central banks, and NOT MyFXBook.
  USD  FRED FEDFUNDS                    EUR  ECB data portal (FRED ECBDFR as backup)
  GBP  Bank of England website          CAD  Bank of Canada Valet API (series V39079)
  AUD  Reserve Bank of Australia CSV    JPY, CHF, NZD  Trading Economics
  Trading Economics also backs up any currency whose own bank fails; a hardcoded table is the last
  resort and is marked live=False so the page can say so.

Usage:
  python news_calendar.py calendar   -> JSON array of upcoming events
  python news_calendar.py rates      -> JSON object of rate + inflation data per currency
"""

import sys
import re
import io
import csv
import json
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone

try:
    import curl_cffi.requests as cffi_requests
    _CFFI_OK = True
except Exception:
    _CFFI_OK = False

# Cloudflare "Just a moment..." interstitial markers. If any appear in a
# response body, the request was challenged — the HTML is NOT calendar data.
_CF_CHALLENGE_MARKERS = (
    'Just a moment',
    'cf-browser-verification',
    '_cf_chl_opt',
    '/cdn-cgi/challenge-platform',
)


def _is_cloudflare_challenge(html: str) -> bool:
    """True if the body is a Cloudflare challenge page rather than real content."""
    return bool(html) and any(m in html for m in _CF_CHALLENGE_MARKERS)

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
}

# --------------------------------------------------------------------------- #
# Calendar: what counts as an event, and what never reaches the page           #
# --------------------------------------------------------------------------- #

# THE CALENDAR CARRIES TWO KINDS OF EVENT AND NO OTHERS.
#
# His instruction, 2026-09-07: *"I dont need crypto and stock news. You can remove and delete there
# sections from the calendar. I only need commodity and forex news."*
#
# So `_categorize` now answers with 'Commodities' or 'Currencies' only, and `_DROP_CATEGORY` below
# is what actually removes a stock or crypto row from the output. They are separate on purpose: the
# categoriser says what a row IS, and the caller decides what to keep — collapsing a stock row into
# 'Currencies' would have hidden it in the forex list instead of removing it.
# "INDEX", "EARNINGS" AND "STOCK" ARE NOT STOCK-MARKET WORDS ON AN ECONOMIC CALENDAR — fixed
# 2026-09-09, and this was a money defect, not tidying.
#
# The stock test used to match the bare words 'stock', 'earnings' and 'index' anywhere in the name.
# Run against the real feed that dropped SEVEN genuine economic releases in a single week —
# `M2 Money Stock y/y` (monetary data), `Average Cash Earnings y/y` (wages), `Index of Services`,
# `Final GDP Price Index`, `NFIB Small Business Index`, `BusinessNZ Manufacturing Index`,
# `BSI Manufacturing Index`. Those seven were all Low impact, so nothing was lost that week.
#
# THE ONE THAT MATTERS IS `Core PCE Price Index` — a HIGH-impact US release. The old rule would have
# deleted it from the calendar before it was ever stored, and VIX.1 reads that calendar to decide
# when NOT to enter (vix1.py:285,288). A guard with the event missing looks exactly like a guard
# that is passing, which is why nothing would have reported it.
#
# So the equity words must be unambiguous PHRASES. His rule is unchanged — no crypto, no stock-market
# news (2026-09-07: *"I dont need crypto and stock news... I only need commodity and forex news."*) —
# this only stops the rule firing on economic data that happens to share a word.
_EQUITY_PHRASES = (
    'stock market', 'equity', 'equities', 'earnings call', 'earnings report', 'earnings season',
    'nasdaq', 's&p 500', 'dow jones', 'ftse', 'nikkei 225', 'share index',
)


def _categorize(name: str, currency: str) -> str:
    n = name.lower()
    if any(w in n for w in ('oil', 'crude', 'gold', 'silver', 'gas', 'commodity', 'eia')):
        return 'Commodities'
    if currency in ('BTC', 'ETH', 'XRP'):
        return 'Crypto'
    if any(w in n for w in _EQUITY_PHRASES):
        return 'Stocks'
    return 'Currencies'


# Categories that never reach the calendar. Commodities is tested FIRST in `_categorize` above, so
# an event like "Crude Oil Inventories" is judged a commodity before the equity test ever runs.
_DROP_CATEGORY = ('Crypto', 'Stocks')


# --------------------------------------------------------------------------- #
# Calendar source: ForexFactory's weekly JSON feed                             #
# --------------------------------------------------------------------------- #

# WHY THIS AND NOT MYFXBOOK — measured 2026-09-09, and it is not a preference.
#
# MyFXBook sits behind a Cloudflare challenge our automation can no longer clear FROM ANYWHERE. The
# last thing that worked was real Google Chrome, visible, with the automation flag off. On
# 2026-09-09 that failed TWICE on his own home connection, sitting on "Just a moment..." for the
# full 150 seconds and returning 0 events (Cloudflare Ray IDs a3817c1769c6c68f, a38181189d4018a5).
#
# That also kills the residential-proxy plan: a proxy only changes the IP address, and the IP is no
# longer the difference — it fails from a home address too. Every piece of machinery MyFXBook needed
# is DELETED rather than left disabled: the browser fetch, FlareSolverr, the TLS-impersonation
# profiles, the HTML parser, and Chrome/Xvfb/fonts out of the Dockerfile and start.sh.
#
# HIS REQUIREMENT, 2026-09-09: "Only the ones that offer filtered news as High impact and medium the
# way myfx does." This feed publishes exactly the four words the platform already maps — High,
# Medium, Low, Holiday (news_fetcher.py:48-53 `_IMPACT_MAP`) — so nothing is translated or guessed.
#
# TESTED AND REJECTED for the calendar: Trading Economics rates AU Westpac Consumer Confidence at
# its TOP level where this feed calls it Low/Medium — its scale means "matters for that country",
# not "moves the market" — and its rows carry NO machine-readable time at all, only rendered text.
# Investing.com answers HTTP 403, FXStreet 401. Trading Economics remains correct and in use for the
# RATES half further down this file; this rejection is about the calendar only.
_FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'

# THE FEED RATE-LIMITS. Seven calls in quick succession earned HTTP 429; it cleared within ~30s. The
# refresh runs every 15 minutes (homepageCalendar.ts RETRY_MS) so this is not a normal risk — but at
# container start the Node warm-up and the signal platform's own fallback scrape can both ask within
# seconds of each other, and a 429 there would leave the calendar empty for a whole cycle. One retry
# costs one short wait and removes that.
_FF_RETRY_AFTER_S = 6

# ASK ONLY FOR COMPRESSION WE CAN ACTUALLY UNDO — and this is why the feed shipped broken once.
#
# The shared `HEADERS` above are for scraping HTML and advertise `br` (Brotli). The feed honours it.
# `requests` only decodes Brotli if the `brotli` package is installed — it is on this laptop and it
# is NOT in the container, so the first deploy logged:
#
#     ForexFactory body is not JSON: '\xb0\x1bS\x01 ...'
#
# raw compressed bytes, read as text. It worked perfectly in every local test, which is exactly the
# shape of bug that only production can show you. gzip and deflate are handled by the standard
# library, so asking for those two alone cannot fail this way.
_FF_HEADERS = {
    'User-Agent': HEADERS['User-Agent'],
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
}


def _fetch_forexfactory() -> list | None:
    """GET the weekly feed. Returns the decoded rows, or None if it could not be read.

    None and [] mean different things and the caller depends on it: None is "we could not ask",
    [] is "we asked and there is nothing usable". Both leave the stored calendar alone.
    """
    for attempt in (1, 2):
        try:
            resp = requests.get(_FF_URL, headers=_FF_HEADERS, timeout=20)
        except Exception as exc:
            print(f'[news_calendar] ForexFactory request failed: {exc}', file=sys.stderr)
            return None

        if resp.status_code == 429 and attempt == 1:
            print(f'[news_calendar] ForexFactory rate-limited (429) — retrying in {_FF_RETRY_AFTER_S}s',
                  file=sys.stderr)
            time.sleep(_FF_RETRY_AFTER_S)
            continue

        if resp.status_code != 200:
            print(f'[news_calendar] ForexFactory HTTP {resp.status_code}', file=sys.stderr)
            return None

        try:
            data = resp.json()
        except Exception as exc:
            # NAME THE ENCODING. When this failed in production the body was raw Brotli and the
            # message showed only mangled text, which reads like a blocked page and is not one.
            print(f'[news_calendar] ForexFactory body is not JSON ({exc}) — '
                  f'Content-Type={resp.headers.get("Content-Type")!r} '
                  f'Content-Encoding={resp.headers.get("Content-Encoding")!r} '
                  f'{len(resp.content)} bytes: {resp.text[:100]!r}', file=sys.stderr)
            return None

        if not isinstance(data, list):
            print(f'[news_calendar] ForexFactory returned {type(data).__name__}, expected a list',
                  file=sys.stderr)
            return None

        print(f'[news_calendar] ForexFactory: {len(data)} rows ({len(resp.content)} bytes)',
              file=sys.stderr)
        return data

    return None


_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

# What the feed calls an impact, and what the rest of the platform calls it.
#
# HOLIDAY BECOMES LOW ON PURPOSE. The platform has three levels, and two things downstream break if
# a fourth word reaches them: `impactLevel` is typed High|Medium|Low (calendarDb.ts:8), and the
# expiry sweep only ever deletes rows labelled Low, Medium or High (calendarDb.ts:117-122) — so a
# row labelled 'Holiday' would never be purged and would pile up for ever. VIX.1 already treats a
# holiday as Low anyway (news_fetcher.py:52), so this changes nothing it sees.
_IMPACT = {'high': 'High', 'medium': 'Medium', 'low': 'Low', 'holiday': 'Low'}


def parse_forexfactory(rows: list) -> list:
    """Turn the feed's rows into the platform's calendar events.

    THE CLOCK IS THE ONE THING HERE THAT COSTS MONEY IF IT IS WRONG. VIX.1 decides when NOT to enter
    from these times (vix1.py:285,288), so an hours-out clock either blocks the wrong hour or fails
    to block the right one. Every row carries a full timestamp WITH its offset
    ('2026-09-11T08:30:00-04:00') and that offset is READ, never assumed and never taken from
    displayed text.

    `eventTime` is emitted with an explicit '+00:00'. The old parser emitted a bare
    '2026-09-08T13:00:00', and Node reads a timestamp with no offset as the CONTAINER's local time
    (calendarDb.ts:44 `new Date(e.eventTime)`) — which was right only for as long as the container
    happened to run on UTC. Saying it out loud removes a silent hours-shift nothing would report.

    A row with no time, no name, no currency, or a time with NO OFFSET is SKIPPED rather than
    guessed at. Skipping is deliberately the safe direction: a guessed timezone would put a news
    window hours out and let a trade through during CPI, whereas a skipped row is visible in the
    count printed below. Such a row could not be stored anyway — `calendarDb.upsertCalendarEvents`
    requires `eventTime`.
    """
    if not isinstance(rows, list):
        return []

    results, dropped, skipped = [], 0, 0
    for item in rows:
        if not isinstance(item, dict):
            skipped += 1
            continue

        name = str(item.get('title') or '').strip()
        currency = str(item.get('country') or '').strip()
        raw_when = str(item.get('date') or '').strip()
        if not name or not currency or not raw_when:
            skipped += 1
            continue

        try:
            when = datetime.fromisoformat(raw_when)
        except ValueError:
            skipped += 1
            continue
        if when.tzinfo is None:
            skipped += 1
            continue
        dt = when.astimezone(timezone.utc)

        category = _categorize(name, currency)
        if category in _DROP_CATEGORY:
            dropped += 1
            continue

        results.append({
            'date':       f'{_MONTHS[dt.month - 1]} {dt.day:02d}',
            'time':       dt.strftime('%I:%M%p').lstrip('0').lower(),
            'currency':   currency,
            'event':      name,
            'importance': _IMPACT.get(str(item.get('impact') or '').strip().lower(), 'Low'),
            # The feed carries the forecast and the previous reading, but NOT the number when it
            # lands. Nothing in the signal platform reads `actual` — the homepage calendar column
            # does, and it already renders '-' as "not published" (EconomicCalendarPage.tsx:469).
            'actual':     '-',
            'forecast':   str(item.get('forecast') or '').strip() or '-',
            'previous':   str(item.get('previous') or '').strip() or '-',
            'eventTime':  dt.isoformat(),
            'category':   category,
        })

    tail = ''
    if dropped:
        tail += f' ({dropped} stock/crypto rows dropped)'
    if skipped:
        tail += f' ({skipped} rows unusable — no name, currency or dated time)'
    print(f'[news_calendar] ForexFactory: {len(results)} events{tail}', file=sys.stderr)
    return results


def scrape_calendar() -> list:
    """Fetch the economic calendar. ForexFactory's weekly feed is the sole source.

    On failure this returns [] and the Node service keeps serving the last good cache
    (homepageCalendar.ts), so an empty result never blanks the UI.

    COVERAGE IS THIS WEEK ONLY — `ff_calendar_nextweek.json`, `lastweek`, `today` and the monthly
    names all answer HTTP 404, measured 2026-09-09. VIX.1's news guards look hours ahead, so they
    are unaffected; the homepage's forward view is shorter than it was. Because of that,
    `calendarDb.upsertCalendarEvents` now replaces only the span these rows actually cover instead
    of a fixed +14 days — otherwise every refresh would delete a fortnight it cannot refill.
    """
    rows = _fetch_forexfactory()
    if rows is None:
        print('[news_calendar] ForexFactory unavailable — returning [] (Node serves last good cache)',
              file=sys.stderr)
        return []

    events = parse_forexfactory(rows)
    if not events:
        print('[news_calendar] ForexFactory returned no usable events', file=sys.stderr)
    return events


# --------------------------------------------------------------------------- #
# Interest rate fetchers — all accessible, no DNS-blocked endpoints            #
# --------------------------------------------------------------------------- #

def _fetch_fred_csv(series_id: str) -> float | None:
    """
    FRED public CSV endpoint — no API key required.
    Skips rows with '.' (unreleased data) to find the most recent real value.
    Only FEDFUNDS and ECBDFR are reliably available without a key.
    """
    try:
        url = f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}'
        r = requests.get(url, timeout=12)
        if r.status_code != 200:
            raise ValueError(f'HTTP {r.status_code}')
        lines = r.text.strip().split('\n')
        if not lines or not (lines[0].startswith('DATE') or lines[0].startswith('observation_date')):
            raise ValueError('Not a valid CSV response')
        real_data = []
        for line in lines[1:]:
            line = line.strip()
            if not line or ',' not in line:
                continue
            parts = line.split(',', 1)
            if len(parts) < 2:
                continue
            val_str = parts[1].strip()
            if val_str == '.' or val_str == '':
                continue
            try:
                real_data.append(float(val_str))
            except ValueError:
                continue
        if not real_data:
            raise ValueError('No real data values found in CSV')
        val = real_data[-1]
        print(f'[news_calendar] FRED {series_id}: {val}%', file=sys.stderr)
        return val
    except Exception as e:
        print(f'[news_calendar] FRED {series_id} failed: {e}', file=sys.stderr)
    return None


def _fetch_usd_rate() -> float | None:
    """USD — FRED FEDFUNDS (Federal Funds Effective Rate, no API key needed)."""
    return _fetch_fred_csv('FEDFUNDS')


def _ecb_obs_value(text: str) -> tuple[str, float] | None:
    """
    Pull (date, rate) out of the ECB's CSV reply.

    TWO FAULTS LIVED HERE, 2026-09-07, and the second was hidden by the first.

    1. The series code was wrong. `DFR_FR` does not exist, so every call came back "not found"
       (HTTP 404) and the euro rate has always come from the American FRED mirror instead. The
       `_FR` suffix ("fixed rate tender") belongs on the MAIN REFINANCING series, `MRR_FR` — the
       deposit facility is plain `DFR`.

    2. The value was read from the WRONG COLUMN. The reply has 40 columns and the rate is in
       `OBS_VALUE`, the tenth; the code took the LAST one, which holds `0`. The sanity check was
       `0 <= val < 20`, so zero passed. Fix only the series code and the homepage would have
       started reporting the euro area at 0%.

    So the column is now found BY NAME, and the reply is parsed with the csv module rather than
    split on commas — one of those 40 fields is a quoted title containing a comma, which shifts
    every column after it.

    NO AGE CHECK HERE, deliberately, unlike the RBA file. This series carries one row per CHANGE of
    the rate, not one per day: the newest row is dated 17 June 2026 and that is correct, not stale.
    """
    rows = list(csv.reader(io.StringIO(text.strip())))
    if len(rows) < 2:
        raise ValueError('no observation rows in ECB reply')
    header = [h.strip() for h in rows[0]]
    if 'OBS_VALUE' not in header:
        raise ValueError('ECB reply has no OBS_VALUE column')
    vi = header.index('OBS_VALUE')
    ti = header.index('TIME_PERIOD') if 'TIME_PERIOD' in header else None
    for row in reversed(rows[1:]):
        if vi >= len(row) or not row[vi].strip():
            continue
        try:
            val = float(row[vi].strip())
        except ValueError:
            continue
        if -5 <= val <= 20:
            return (row[ti].strip() if ti is not None and ti < len(row) else '?'), val
    raise ValueError('no usable OBS_VALUE in ECB reply')


def _fetch_ecb_sdw_rate() -> float | None:
    """EUR — ECB Data Portal REST API (deposit facility rate, official, no key)."""
    try:
        url = (
            'https://data-api.ecb.europa.eu/service/data/'
            'FM/B.U2.EUR.4F.KR.DFR.LEV'
            '?format=csvdata&lastNObservations=1'
        )
        r = requests.get(url, timeout=15)
        if r.status_code != 200:
            raise ValueError(f'HTTP {r.status_code}')
        when, val = _ecb_obs_value(r.text)
        print(f'[news_calendar] ECB: {val}% (deposit facility, set {when})', file=sys.stderr)
        return val
    except Exception as e:
        print(f'[news_calendar] ECB failed: {e}', file=sys.stderr)
    return None


def _fetch_eur_rate() -> float | None:
    """EUR — ECB SDW API (primary), FRED ECBDFR CSV (backup)."""
    val = _fetch_ecb_sdw_rate()
    if val is not None:
        return val
    return _fetch_fred_csv('ECBDFR')


def _fetch_gbp_rate() -> float | None:
    """GBP — Scrape the Bank of England official monetary policy page."""
    try:
        url = 'https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate'
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            raise ValueError(f'HTTP {r.status_code}')
        soup = BeautifulSoup(r.text, 'html.parser')
        text = soup.get_text()
        match = re.search(r'Current Bank Rate\s*([\d.]+)%', text)
        if match:
            val = float(match.group(1))
            print(f'[news_calendar] BoE website: {val}%', file=sys.stderr)
            return val
        raise ValueError('Rate pattern not found on BoE page')
    except Exception as e:
        print(f'[news_calendar] BoE scrape failed: {e}', file=sys.stderr)
    return None


def _fetch_cad_rate() -> float | None:
    """CAD — Bank of Canada Valet API, series V39079 (Target Overnight Rate)."""
    try:
        url = 'https://www.bankofcanada.ca/valet/observations/V39079/json?recent=1'
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            raise ValueError(f'HTTP {r.status_code}')
        data = r.json()
        obs_list = data.get('observations', [])
        if not obs_list:
            raise ValueError('No observations in BoC response')
        latest = obs_list[-1]
        v = latest.get('V39079', {}).get('v')
        if v is None or v == '':
            raise ValueError('Empty value in BoC response')
        val = float(v)
        print(f'[news_calendar] BoC Valet: {val}%', file=sys.stderr)
        return val
    except Exception as e:
        print(f'[news_calendar] BoC Valet failed: {e}', file=sys.stderr)
    return None


# The RBA file is DAILY and OLDEST-FIRST. If the newest row we can read is older than this, the
# file is not what we think it is and we must not quote a number off it. Thirty days is generous —
# it covers the Christmas shutdown and any run of holidays — while still catching a file that has
# stopped being updated, or a parse that has landed in the wrong place.
_RBA_MAX_AGE_DAYS = 30


def _rba_latest_row(lines: list[str], today: datetime | None = None
                    ) -> tuple[str, float] | None:
    """
    Take the NEWEST Cash Rate Target from the RBA F1 file: (date text, rate).

    WHAT WENT WRONG, 2026-09-07. This walked the file from the TOP and returned the first row it
    could parse. The RBA file runs oldest-first, so the first data row is line 11, dated
    04-Jan-2011 — and the homepage had been showing Australia at 4.75%, a rate from fifteen years
    ago, while the newest row in the same file said 4.35%.

    Nothing noticed because 4.75 is a perfectly believable cash rate. That is the reason for the
    age check below: a number that cannot be dated, or whose date is old, is refused outright
    rather than trusted for looking plausible. AUD then falls through to Trading Economics, which
    is a correct source for it.

    The old code also had a second attempt that took ANY number between 0 and 30 from ANY column of
    the last twenty lines. The columns either side of the cash rate hold bank-bill yields (4.32,
    4.60) — so that path could return a completely different series and still look right. It is
    deleted rather than kept: failing over to Trading Economics beats quoting the wrong series.
    """
    today = today or datetime.utcnow()

    # The column is named in two separate header rows ("Title,Cash Rate Target,..." and
    # "Series ID,FIRMMCRTD,..."). Match the cell exactly — "Change in the Cash Rate Target" and
    # "Interbank Overnight Cash Rate" both contain the words "Cash Rate".
    target_col = None
    for line in lines:
        cols = [c.strip().strip('"') for c in line.split(',')]
        for j, col in enumerate(cols):
            if col in ('Cash Rate Target', 'FIRMMCRTD'):
                target_col = j
                break
        if target_col is not None:
            break
    if target_col is None:
        raise ValueError('Cash Rate Target column not found in RBA CSV')

    # NEWEST FIRST. The last line is usually today's, whose rate cell is still blank.
    for line in reversed(lines):
        cols = [c.strip().strip('"') for c in line.split(',')]
        if target_col >= len(cols) or not cols[target_col] or not cols[0]:
            continue
        try:
            val = float(cols[target_col])
        except ValueError:
            continue
        if not (0 <= val <= 30):
            continue
        try:
            when = datetime.strptime(cols[0], '%d-%b-%Y')
        except ValueError:
            continue  # a header row, not a dated observation
        age = (today - when).days
        if age > _RBA_MAX_AGE_DAYS:
            raise ValueError(
                f'newest RBA row is {age} days old ({cols[0]} = {val}%) — refusing to quote it')
        return cols[0], val
    raise ValueError('no dated Cash Rate Target row found in RBA CSV')


def _fetch_aud_rate() -> float | None:
    """AUD — Reserve Bank of Australia F1 statistics CSV (Cash Rate Target column)."""
    try:
        url = 'https://www.rba.gov.au/statistics/tables/csv/f1-data.csv'
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            raise ValueError(f'HTTP {r.status_code}')
        when, val = _rba_latest_row(r.text.strip().split('\n'))
        print(f'[news_calendar] RBA CSV: {val}% (dated {when})', file=sys.stderr)
        return val
    except Exception as e:
        print(f'[news_calendar] RBA CSV failed: {e}', file=sys.stderr)
    return None


# Trading Economics country slugs for each currency
_TE_COUNTRY = {
    'USD': 'united-states',
    'EUR': 'euro-area',
    'GBP': 'united-kingdom',
    'JPY': 'japan',
    'CAD': 'canada',
    'AUD': 'australia',
    'CHF': 'switzerland',
    'NZD': 'new-zealand',
}


# THE ROW THAT HOLDS THE POLICY RATE, per country, most specific label first.
#
# EVERY ONE OF THESE PAGES CARRIES SEVERAL "... RATE" ROWS and only one of them is the policy rate.
# Measured on the live pages, 2026-09-07:
#
#     Japan          Deposit Interest Rate 0.40   |   Interest Rate       1.00
#     Switzerland    Deposit Interest Rate 0.03   |   SNB Interest Rate   0.00
#     New Zealand    Deposit Interest Rate 4.66   |   Interbank Rate 3.06 |  RBNZ Interest Rate 2.75
#
# The old code matched with a SUBSTRING — "interest rate" in the label — and "Deposit Interest Rate"
# contains that and comes FIRST on every page. So the row it selected was always the wrong one.
_TE_POLICY_ROW = {
    'USD': ('fed interest rate', 'interest rate'),
    'EUR': ('ecb interest rate', 'interest rate'),
    'GBP': ('boe interest rate', 'interest rate'),
    'JPY': ('boj interest rate', 'interest rate'),
    'CAD': ('boc interest rate', 'interest rate'),
    'AUD': ('rba interest rate', 'cash rate', 'interest rate'),
    'CHF': ('snb interest rate', 'interest rate'),
    'NZD': ('rbnz interest rate', 'official cash rate', 'interest rate'),
}

# LABELS THAT ARE NEVER THE POLICY RATE, whatever else they say. This list is the guard that makes
# the exact-match above safe to relax: even if a label shifts, a row called "Deposit Interest Rate"
# can never be returned as the policy rate.
_TE_NOT_POLICY = ('deposit', 'interbank', 'inflation', 'unemployment',
                  'lending', 'savings', 'reverse', 'prime', 'mortgage')


# Browser fingerprints for `curl_cffi` to imitate, tried in order — different TLS signatures get a
# bot scorer to answer differently, so rotating them raises the chance one is served the real page.
#
# THIS LIST BELONGS TO THE RATES. It was called `_MFX_PROFILES` and lived in the MyFXBook block; when
# that block was deleted on 2026-09-09 this reference went with it and production logged
# `TE JPY failed: name '_MFX_PROFILES' is not defined` — JPY, CHF and NZD silently fell back to the
# hardcoded table. The delete-sweep looked for the FUNCTIONS being removed and never for the
# CONSTANTS they shared, which is the whole lesson: a shared constant has no caller to grep for.
_TLS_PROFILES = ['safari17_2_ios', 'chrome131', 'firefox133', 'safari18_0_ios', 'chrome124']


def _te_html(url: str) -> str | None:
    """
    Fetch a Trading Economics page, working around the block the SERVER gets.

    THE BUG THIS EXISTS FOR, and it only appears in production. From a normal connection the page
    returns fine; from the deployed container it comes back with NO TABLE ROWS AT ALL. The log line
    that proved it, after the parser was already fixed:

        TE JPY failed: no policy-rate row matched; rows seen: []

    An empty list, not a wrong row — so the parser was never the problem there. The datacenter IP is
    served a challenge or an empty shell instead of the page. It is the same thing this module
    already documents for MyFXBook: "bypasses Cloudflare using curl_cffi iOS Safari TLS
    impersonation... gets HTTP 200 from the datacenter IP where plain HTTP is challenged."

    So the same tool is used here, rather than inventing a second approach: try plain requests
    first because it is cheaper and works from most places, and fall back to TLS impersonation when
    what comes back is a challenge or has no rows in it.

    Returns None when nothing usable could be fetched; the caller then falls through to the
    hardcoded table, marked live=False.
    """
    def _usable(text: str) -> bool:
        # A REAL PAGE HAS TABLE ROWS. Status 200 is not enough — the challenge page returns 200 too,
        # which is exactly how this hid: every check passed and the data was not there.
        return bool(text) and not _is_cloudflare_challenge(text) and '<tr' in text

    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code == 200 and _usable(r.text):
            return r.text
        print(f'[news_calendar] TE plain fetch unusable '
              f'(HTTP {r.status_code}, rows={"<tr" in r.text}) — trying TLS impersonation',
              file=sys.stderr)
    except Exception as e:
        print(f'[news_calendar] TE plain fetch failed: {e} — trying TLS impersonation',
              file=sys.stderr)

    if not _CFFI_OK:
        print('[news_calendar] curl_cffi unavailable, cannot retry TE', file=sys.stderr)
        return None

    for profile in _TLS_PROFILES:
        try:
            s = cffi_requests.Session(impersonate=profile)
            r = s.get(url, timeout=20)
            if r.status_code == 200 and _usable(r.text):
                print(f'[news_calendar] TE via curl_cffi ({profile})', file=sys.stderr)
                return r.text
        except Exception:
            continue
    print('[news_calendar] TE: every fetch method returned an unusable page', file=sys.stderr)
    return None


def _fetch_trading_economics_rate(currency: str) -> float | None:
    """
    Fetch the policy rate from the Trading Economics interest-rate page.

    WHY THIS WAS REWRITTEN, 2026-09-07. It failed for JPY, CHF and NZD with "No rate value found on
    page" — the three currencies that have no dedicated bank fetcher and depend on this — so all
    three had been falling through to hardcoded numbers that were badly out of date:

        JPY  hardcoded 0.50   actually 1.00
        CHF  hardcoded 0.25   actually 0.00
        NZD  hardcoded 3.25   actually 2.75

    THE FAILURE WAS PROTECTING US, WHICH IS THE PART WORTH UNDERSTANDING. Three faults stacked:

      1. the row was matched by SUBSTRING, so "Deposit Interest Rate" won on every page;
      2. that row has no id='actual' cell, so the value lookup found nothing;
      3. the fallback demanded a literal '%' in the text, and the page puts the unit in a SEPARATE
         cell as the word "percent".

    Fault 2 and 3 are what made it error instead of returning the deposit rate as the policy rate.
    Had only 3 been "fixed" — the obvious one-line change — this would have started quietly
    reporting Japan's rate as 0.40 instead of 1.00, and nothing would have looked broken.

    So: match the row by its FULL label, never a substring, and refuse anything on the
    _TE_NOT_POLICY list outright. Read the value from the cell beside the label, where it actually
    is. CHF cross-checks against the Swiss National Bank's own data (cube snbgwdzid, series LZ =
    0.00 on 2026-08-28), so this is not one source agreeing with itself.
    """
    country = _TE_COUNTRY.get(currency)
    if not country:
        return None
    try:
        url = f'https://tradingeconomics.com/{country}/interest-rate'
        html = _te_html(url)
        if html is None:
            raise ValueError('page could not be fetched')
        soup = BeautifulSoup(html, 'html.parser')

        # Collect every row as (label, first value cell), so the choice is made over all of them
        # rather than by taking whichever matched first in document order.
        found: dict[str, float] = {}
        for row in soup.find_all('tr'):
            cells = row.find_all(['td', 'th'])
            if len(cells) < 2:
                continue
            label = ' '.join(cells[0].get_text(strip=True).lower().split())
            if not label or any(bad in label for bad in _TE_NOT_POLICY):
                continue
            raw = cells[1].get_text(strip=True).replace('%', '').replace(',', '')
            try:
                val = float(raw)
            except ValueError:
                continue
            # A POLICY RATE IS A SMALL NUMBER. These pages also carry balance sheets in the
            # millions; without this a stray row could pass every other test.
            if -5.0 <= val <= 30.0:
                found.setdefault(label, val)

        for wanted in _TE_POLICY_ROW.get(currency, ('interest rate',)):
            if wanted in found:
                val = found[wanted]
                print(f'[news_calendar] TE {currency}: {val}% (row "{wanted}")', file=sys.stderr)
                return val

        raise ValueError(
            f'no policy-rate row matched; rows seen: {sorted(found)[:6]}')
    except Exception as e:
        print(f'[news_calendar] TE {currency} failed: {e}', file=sys.stderr)
    return None


# --------------------------------------------------------------------------- #
# Inflation fetchers — World Bank CPI YoY (free, no key)                      #
# --------------------------------------------------------------------------- #

_WB_COUNTRY = {
    'USD': 'US',
    'EUR': '1A',
    'GBP': 'GB',
    'JPY': 'JP',
    'AUD': 'AU',
    'CAD': 'CA',
    'CHF': 'CH',
    'NZD': 'NZ',
    'CNY': 'CN',
}

_WB_INFLATION_CACHE: dict = {}


def _fetch_wb_inflation(currency: str) -> float | None:
    """Inflation rate from World Bank CPI YoY indicator (FP.CPI.TOTL.ZG)."""
    if currency in _WB_INFLATION_CACHE:
        return _WB_INFLATION_CACHE[currency]
    country = _WB_COUNTRY.get(currency)
    if not country:
        return None
    try:
        url = (
            f'https://api.worldbank.org/v2/country/{country}/'
            f'indicator/FP.CPI.TOTL.ZG?format=json&mrv=2&per_page=2'
        )
        r = requests.get(url, timeout=10)
        data = r.json()
        if isinstance(data, list) and len(data) > 1:
            entries = data[1] or []
            for entry in entries:
                if entry.get('value') is not None:
                    val = float(entry['value'])
                    _WB_INFLATION_CACHE[currency] = val
                    return val
    except Exception as e:
        print(f'[news_calendar] World Bank inflation ({currency}) failed: {e}', file=sys.stderr)
    return None


# --------------------------------------------------------------------------- #
# MyFXBook interest rates scraper (primary source)                             #
# --------------------------------------------------------------------------- #

_MYFXBOOK_RATE_MAP = {
    'United States':  ('USD', 'Federal Reserve'),
    'Euro Area':      ('EUR', 'European Central Bank'),
    'United Kingdom': ('GBP', 'Bank of England'),
    'Japan':          ('JPY', 'Bank of Japan'),
    'Canada':         ('CAD', 'Bank of Canada'),
    'Australia':      ('AUD', 'Reserve Bank of Australia'),
    'New Zealand':    ('NZD', 'Reserve Bank of New Zealand'),
    'Switzerland':    ('CHF', 'Swiss National Bank'),
    'China':          ('CNY', "People's Bank of China"),
}



# --------------------------------------------------------------------------- #
# Orchestrator                                                                 #
# --------------------------------------------------------------------------- #

# LAST RESORT ONLY — every one of these is served with live=False so the UI can say so.
#
# REFRESHED 2026-09-07, and five of the eight were WRONG. They had been silently standing in for
# JPY, CHF and NZD for as long as the Trading Economics parser had been broken:
#
#     USD 3.63 -> 3.75      JPY 0.50 -> 1.00      AUD 4.10 -> 4.35
#     CHF 0.25 -> 0.00      NZD 3.25 -> 2.75      (EUR, GBP, CAD were already right)
#
# Read off the live Trading Economics pages on that date. CHF is the one with a second opinion: the
# Swiss National Bank's own data (cube snbgwdzid, series LZ) also reads 0.00, dated 2026-08-28.
#
# A HARDCODED RATE CANNOT LOOK STALE, which is the whole problem with this table — a central bank
# moves and nothing here changes. It exists so the page shows something rather than nothing when
# every source is down, and the live=False flag is what stops it being mistaken for current.
_FALLBACK_RATES = {
    'USD': ('Federal Reserve',               3.75),
    'EUR': ('European Central Bank',         2.40),
    'GBP': ('Bank of England',               3.75),
    'JPY': ('Bank of Japan',                 1.00),
    'CAD': ('Bank of Canada',                2.25),
    'AUD': ('Reserve Bank of Australia',     4.35),
    'CHF': ('Swiss National Bank',           0.00),
    'NZD': ('Reserve Bank of New Zealand',   2.75),
}

_BANK_NAMES = {
    'USD': 'Federal Reserve',
    'EUR': 'European Central Bank',
    'GBP': 'Bank of England',
    'JPY': 'Bank of Japan',
    'CAD': 'Bank of Canada',
    'AUD': 'Reserve Bank of Australia',
    'CHF': 'Swiss National Bank',
    'NZD': 'Reserve Bank of New Zealand',
}


def get_interest_rates() -> dict:
    """
    Fetch central bank policy rates.

    Priority:
      1. The banks themselves (FRED, ECB, BoE, BoC, RBA) and Trading Economics.
      2. Hardcoded last-resort values marked live=False.

    Inflation is always appended from the World Bank CPI YoY API.

    MYFXBOOK IS NO LONGER ASKED FOR RATES, and that is a deliberate improvement rather than a
    casualty of the Cloudflare block. It used to be tried FIRST and to win whenever it answered —
    but every one of these eight rates comes from the issuing central bank's own publication, which
    is a better source than a third-party aggregator repeating it. Letting the aggregator override
    the Federal Reserve was a silent downgrade waiting to happen.

    It also cost real time: the MyFXBook attempt ran a 60-second browser round-trip on every refresh
    and then failed, which is what produced `[homepageCalendar/rates] Python timeout (60s)` in
    production and left the rates page empty. `_scrape_myfxbook_rates` is deleted, not disabled.
    """
    rates: dict = {}

    # ── The banks themselves ──────────────────────────────────────────────────
    def _add(currency: str, nominal: float | None, source: str) -> bool:
        if nominal is not None and currency not in rates:
            rates[currency] = {
                'bank':      _BANK_NAMES.get(currency, currency),
                'nominal':   nominal,
                'inflation': None,
                'live':      True,
            }
            print(f'[news_calendar] {currency} -> {nominal}% (via {source})', file=sys.stderr)
            return True
        return False

    _add('USD', _fetch_usd_rate(),  'FRED FEDFUNDS')
    # The label names both because _fetch_eur_rate tries the ECB first and FRED second; the line
    # logged just above always says which one actually answered. It used to say only "FRED ECBDFR",
    # which was a lie whenever the ECB replied — and a log that names the wrong source is exactly
    # what sends the next debugging session to the wrong file.
    _add('EUR', _fetch_eur_rate(),  'ECB data portal, FRED as backup')
    _add('GBP', _fetch_gbp_rate(),  'BoE website')
    _add('CAD', _fetch_cad_rate(),  'BoC Valet API')
    _add('AUD', _fetch_aud_rate(),  'RBA CSV')

    for ccy in ('JPY', 'CHF', 'NZD'):
        if ccy not in rates:
            _add(ccy, _fetch_trading_economics_rate(ccy), 'Trading Economics')

    for ccy in list(_FALLBACK_RATES.keys()):
        if ccy not in rates:
            _add(ccy, _fetch_trading_economics_rate(ccy), 'Trading Economics (fallback)')

    # ── 3. Hardcoded last-resort ──────────────────────────────────────────────
    for ccy, (bank, fallback_rate) in _FALLBACK_RATES.items():
        if ccy not in rates:
            print(f'[news_calendar] Using hardcoded fallback for {ccy}: {fallback_rate}%', file=sys.stderr)
            rates[ccy] = {
                'bank':      bank,
                'nominal':   fallback_rate,
                'inflation': None,
                'live':      False,
            }

    # ── Inflation (World Bank CPI YoY) ────────────────────────────────────────
    for currency in list(rates.keys()):
        infl = _fetch_wb_inflation(currency)
        rates[currency]['inflation'] = infl

    live = [c for c, v in rates.items() if v['live']]
    fallback = [c for c, v in rates.items() if not v['live']]
    print(f'[news_calendar] rates live: {live}  fallback: {fallback}', file=sys.stderr)
    return rates


# --------------------------------------------------------------------------- #
# Entry point                                                                  #
# --------------------------------------------------------------------------- #

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'calendar'

    if mode == 'rates':
        output = get_interest_rates()
    else:
        # The economic calendar, and nothing else. Crypto headlines from RSS used to be appended
        # here; they were removed on his instruction, and their removal also takes away the thing
        # that WIPED the stored calendar — ten headlines with no scheduled time were enough to make
        # `upsertCalendarEvents` clear the table and put nothing back. See calendarDb.ts.
        output = scrape_calendar()

    print(json.dumps(output))
