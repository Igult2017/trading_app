"""
test_calendar_parser.py — run with:
    py -3 server/python/test_calendar_parser.py

THE CALENDAR MUST NOT COME BACK EMPTY, AND ITS CLOCK MUST NOT BE GUESSED.

His requirement, 2026-09-09: *"Only the ones that offer filtered news as High impact and medium the
way myfx does."* And, still standing from 2026-09-07: *"I dont need crypto and stock news... I only
need commodity and forex news."*

WHY THE SOURCE CHANGED. MyFXBook sits behind a Cloudflare challenge that our automation can no
longer clear from anywhere — on 2026-09-09 real visible Chrome failed TWICE from a home connection,
0 events, Ray IDs a3817c1769c6c68f and a38181189d4018a5. A residential proxy would not have helped:
it changes the IP, and the IP is no longer the difference. The source is now ForexFactory's weekly
JSON feed, which publishes the same four impact words the platform already maps.

WHY IT MATTERS. An empty calendar is a money defect, not a display one: VIX.1's two news protections
(vix1.py:285,288) read the event list, so with it empty neither can fire. They are not broken —
they are starved, and a starved guard looks exactly like a guard that is passing.

NO NETWORK. These run the real parser against rows copied verbatim from the live feed, so they are
deterministic and still fail if the selection logic regresses.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

_pass = 0
_fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}" + ('' if ok else f': got {got!r}, want {want!r}'))
    globals().__setitem__('_pass' if ok else '_fail', (_pass if ok else _fail) + 1)


from news_calendar import parse_forexfactory, _categorize, _DROP_CATEGORY

# -- Rows copied verbatim from the live feed on 2026-09-09 ------------------
# Field names and values are exactly as served, including the '-04:00' offsets and the empty-string
# forecast. Nothing here is retyped from memory: the offset is the whole point of the clock tests
# below, and inventing one would test the invention instead of the feed.
FEED = [
    {"title": "Core CPI m/m", "country": "USD", "date": "2026-09-11T08:30:00-04:00",
     "impact": "High", "forecast": "0.3%", "previous": "0.3%"},
    {"title": "Unemployment Claims", "country": "USD", "date": "2026-09-10T08:30:00-04:00",
     "impact": "Medium", "forecast": "235K", "previous": "237K"},
    {"title": "ANZ Job Advertisements m/m", "country": "AUD", "date": "2026-09-06T21:30:00-04:00",
     "impact": "Low", "forecast": "", "previous": "0.8%"},
    {"title": "Bank Holiday", "country": "CHF", "date": "2026-09-12T00:00:00-04:00",
     "impact": "Holiday", "forecast": "", "previous": ""},
    {"title": "Crude Oil Inventories", "country": "USD", "date": "2026-09-10T10:30:00-04:00",
     "impact": "Medium", "forecast": "-1.2M", "previous": "2.4M"},
    # Not in the real feed — included because dropping these is part of the contract.
    {"title": "Nasdaq Earnings Call", "country": "USD", "date": "2026-09-10T16:00:00-04:00",
     "impact": "Low", "forecast": "", "previous": ""},
    {"title": "Bitcoin ETF Flows", "country": "BTC", "date": "2026-09-10T12:00:00-04:00",
     "impact": "Low", "forecast": "", "previous": ""},
]

events = parse_forexfactory(FEED)
by_name = {e['event']: e for e in events}

print('\n-- 1. IT FINDS THE EVENTS AT ALL ==')
check('five forex/commodity events survive', len(events), 5)
check('the stock row is gone', 'Nasdaq Earnings Call' in by_name, False)
check('the crypto row is gone', 'Bitcoin ETF Flows' in by_name, False)

print('\n-- 2. THE CLOCK — the offset is READ, never assumed ==')
# This is the one that costs money if it is wrong. VIX.1 refuses to enter inside a high-impact news
# window; an hours-out clock either blocks the wrong hour or fails to block the right one.
cpi = by_name['Core CPI m/m']
check('08:30 New York (-04:00) becomes 12:30 UTC', cpi['eventTime'], '2026-09-11T12:30:00+00:00')
check('the date label matches the converted time', cpi['date'], 'Sep 11')
check('the time label matches the converted time', cpi['time'], '12:30pm')

# A row whose offset pushes it onto the NEXT UTC day must be dated by the converted time, not the
# text in the feed. 21:30 on the 6th at -04:00 is 01:30 on the 7th in UTC.
anz = by_name['ANZ Job Advertisements m/m']
check('an offset that crosses midnight moves the DAY too',
      anz['eventTime'], '2026-09-07T01:30:00+00:00')
check('...and the date label crosses with it', anz['date'], 'Sep 07')

# THE TEETH. If the parser ever starts treating the feed's local time as if it were already UTC,
# every event silently moves by four or five hours and nothing looks wrong. This asserts the
# un-converted value is NOT what we store.
check('the raw feed time is NOT stored as-is', cpi['eventTime'].startswith('2026-09-11T08:30'), False)
check('the stored time always carries an explicit UTC offset',
      all(e['eventTime'].endswith('+00:00') for e in events), True)

# A time with no offset at all is SKIPPED, not guessed. Guessing would put a news window hours out.
check('a timestamp with no offset is refused, not assumed to be UTC',
      len(parse_forexfactory([dict(FEED[0], date='2026-09-11T08:30:00')])), 0)
check('an unparseable timestamp is refused',
      len(parse_forexfactory([dict(FEED[0], date='next Tuesday')])), 0)

print('\n-- 3. THE IMPACT RATING — his requirement, unchanged ==')
check('High survives as High', cpi['importance'], 'High')
check('Medium survives as Medium', by_name['Unemployment Claims']['importance'], 'Medium')
check('Low survives as Low', anz['importance'], 'Low')
check('Holiday becomes Low — there is no fourth level',
      by_name['Bank Holiday']['importance'], 'Low')
# TEETH: a 'Holiday' reaching the database would never be purged (calendarDb.ts:117-122 only sweeps
# Low/Medium/High), so it would pile up for ever.
check('no event ever carries a fourth impact word',
      {e['importance'] for e in events} <= {'High', 'Medium', 'Low'}, True)
check('an unknown impact word falls back to Low, never crashes',
      parse_forexfactory([dict(FEED[0], impact='Critical')])[0]['importance'], 'Low')

print('\n-- 4. THE FIELDS ==')
check('currency comes from the feed country code', cpi['currency'], 'USD')
check('event name', cpi['event'], 'Core CPI m/m')
check('forecast', cpi['forecast'], '0.3%')
check('previous', cpi['previous'], '0.3%')
check('an empty forecast becomes a dash, not blank', anz['forecast'], '-')
# The feed does not publish the released number. Nothing in the signal platform reads it; the
# homepage column renders '-' as "not published" (EconomicCalendarPage.tsx:469).
check('actual is a dash — this feed does not publish it', cpi['actual'], '-')

print('\n-- 5. CATEGORIES — his rule, in the parser ==')
check('nothing dropped is still present',
      [e for e in events if e['category'] in _DROP_CATEGORY], [])
check('an oil event is a commodity', _categorize('Crude Oil Inventories', 'USD'), 'Commodities')
check('a gold event is a commodity', _categorize('Gold Index', 'USD'), 'Commodities')
check('an equity earnings call is a stock', _categorize('Nasdaq Earnings Call', 'USD'), 'Stocks')
check('a BTC row is crypto', _categorize('Bitcoin ETF Flows', 'BTC'), 'Crypto')

# TEETH — THE DEFECT THAT COST A HIGH-IMPACT EVENT. The stock test used to match the bare words
# 'index', 'earnings' and 'stock' anywhere in the name, which threw away seven real economic
# releases in one week of live data. The one that matters is Core PCE Price Index: a HIGH-impact US
# release that VIX.1 must stand aside for, deleted before it was ever stored. If any of these five
# ever comes back as 'Stocks', that defect has returned.
for name in ('Core PCE Price Index m/m', 'M2 Money Stock y/y', 'Average Cash Earnings y/y',
             'Index of Services 3m/3m', 'NFIB Small Business Index'):
    check(f'economic data is NOT a stock: {name}', _categorize(name, 'USD'), 'Currencies')

print('\n-- 6. IT NEVER THROWS ==')
check('empty feed yields nothing', parse_forexfactory([]), [])
check('a non-list yields nothing', parse_forexfactory({'error': 'rate limited'}), [])
check('a row missing its title is skipped',
      len(parse_forexfactory([dict(FEED[0], title='')])), 0)
check('a row missing its country is skipped',
      len(parse_forexfactory([dict(FEED[0], country='')])), 0)
check('junk rows are skipped, good rows still parse',
      len(parse_forexfactory(['nonsense', None, FEED[0]])), 1)

print('\n== 7. THE TWO THINGS THAT ONLY PRODUCTION CAUGHT, 09 Sep ==')
# Both of these passed every local test and failed on the first deploy. They are pinned here
# because neither can be caught by running the code on this machine.

# (a) COMPRESSION WE CANNOT UNDO. The shared HTML headers advertise Brotli ('br'). The feed honours
#     it, `requests` only decodes it when the `brotli` package is installed — it is on this laptop
#     and is NOT in the container — so production received raw compressed bytes and logged
#     "body is not JSON: '\xb0\x1bS\x01 ...'", which reads exactly like a blocked page.
from news_calendar import _FF_HEADERS, HEADERS
check('the feed request never asks for brotli',
      'br' in _FF_HEADERS.get('Accept-Encoding', ''), False)
check('...it asks only for encodings the standard library handles',
      _FF_HEADERS['Accept-Encoding'], 'gzip, deflate')
check('the HTML headers still DO ask for brotli — this is about the feed only',
      'br' in HEADERS['Accept-Encoding'], True)

# (b) A SHARED CONSTANT HAS NO CALLER TO GREP FOR. Deleting the MyFXBook block took `_MFX_PROFILES`
#     with it, and the RATES fallback used it: production logged
#     `TE JPY failed: name '_MFX_PROFILES' is not defined` and JPY/CHF/NZD silently dropped to the
#     hardcoded table. Running the file locally cannot catch it — that branch only executes when the
#     server is served a challenge, which does not happen from home.
#
#     So this checks the WHOLE module for any name used but never defined, which catches the next
#     orphaned constant as well as this one.
import ast, builtins
from pathlib import Path

_src = Path(__file__).resolve().parent.joinpath('news_calendar.py').read_text(encoding='utf-8')
_tree = ast.parse(_src)
_defined = set(dir(builtins))
for _n in ast.walk(_tree):
    if isinstance(_n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        _defined.add(_n.name)
    elif isinstance(_n, ast.Name) and isinstance(_n.ctx, ast.Store):
        _defined.add(_n.id)
    elif isinstance(_n, (ast.Import, ast.ImportFrom)):
        for _a in _n.names:
            _defined.add(_a.asname or _a.name.split('.')[0])
    elif isinstance(_n, ast.arg):
        _defined.add(_n.arg)
    elif isinstance(_n, ast.ExceptHandler) and _n.name:
        _defined.add(_n.name)
_undefined = sorted({_n.id for _n in ast.walk(_tree)
                     if isinstance(_n, ast.Name) and isinstance(_n.ctx, ast.Load)
                     and _n.id not in _defined})
check('no name in news_calendar.py is used but never defined', _undefined, [])

# The rates path's TLS profile list must survive any future calendar rewrite.
from news_calendar import _TLS_PROFILES
check('the rates fallback still has its TLS profiles',
      isinstance(_TLS_PROFILES, list) and len(_TLS_PROFILES) > 0, True)

# -- THE RELEASED NUMBER (added 2026-10-25) -----------------------------------
#
# HIS INSTRUCTION: *"the economic calendar should also send the outcome of news ... after the news
# release. It is not doing that right now."*
#
# It could not. The ForexFactory feed this module reads has SIX fields and `actual` is not one of
# them (0 of 86 rows), and lastweek/nextweek/today all 404 -- so `parse_forexfactory` hardcodes
# `'actual': '-'`. The released number now comes from a Trading Economics COUNTRY page.
#
# THESE TWO ROWS ARE COPIED VERBATIM from tradingeconomics.com/united-states/calendar, not written
# to look like it -- one already released, one still to come. A hand-made lookalike would not have
# the nested flag table that broke the first parser, nor the single-quoted ids.
from news_calendar import parse_te_calendar, _TE_CALENDARS

_TE_RELEASED = '<tr data-url="/united-states/composite-pmi" data-id="398767" data-country="united states" data-category="composite pmi" data-event="s&p global composite pmi flash" data-symbol=\'UNITEDSTACOMPMI\'> <td style="white-space: nowrap;" class=\' 2026-10-23\'> <span class="event-0 calendar-date-2"> 01:45 PM </span> </td> <td class="calendar-item" style="white-space: nowrap"> <table style="padding: 0px;"> <tr> <td style="padding-left: 5px;"> <div title="United States" class=\'flag flag-us\'></div> </td> <td title="United States" style="padding-left: 5px;" class="calendar-iso">US</td> </tr> </table> </td> <td style="max-width: 250px; overflow-x: hidden;"> <a class=\'calendar-event\' href=\'/united-states/composite-pmi\'>S&P Global Composite PMI Flash</a> <span class="calendar-reference">OCT</span> </td> <td class="calendar-item calendar-item-positive"> <a href=\'/united-states/composite-pmi\'><span id=\'actual\'>57.6</span></a> </td> <td class="calendar-item calendar-item-positive"> <span id=\'previous\'>58.4</span> <span id=\'revised\' style="cursor: pointer; color: #333; font-size: 10px;" data-bs-toggle="tooltip" title=> </span> </td> <td class="calendar-item calendar-item-positive"> <a id=\'consensus\' aria-label=\'UNITEDSTACOMPMI\' href=\'/united-states/composite-pmi\'></a></span> </td> <td class="calendar-item calendar-item-positive"> <a id=\'forecast\' href=\'/united-states/composite-pmi\'>57.6</a></span> </td> <td class=\'d-md-none d-lg-table-cell\' style=\'text-align: right\'><a target=\'_blank\' style=\'text-align: center\' href=\'/united-states/composite-pmi\'><div class=\'lazy\' style=\'height: 20px; width: 40px;\' data-src=\'https://d3fy651gv2fhd3.cloudfront.net/charts/calendar-398767.png?h=20&w=40&n=4&y=0&y2=0&x=0&title=false&lbl=0&bg=0&v=V20230410&url=/united-states/composite-pmi\' data-chart=\'/united-states/composite-pmi\' title=\'US Composite PMI\' data-placement=\'right\'></div></a></td> <td class=" d-none d-md-table-cell d-lg-none"></td> <td class=\'td-alert\'> <div title=\'Create Alert\' data-type=\'te-alert-hook\' class=\'bi bi-bell-fill te-alert-bell\'></div> </td> </tr> <!-- copy of table head to show on scroll -->'

_TE_PENDING = '<tr data-url="/united-states/chicago-fed-national-activity-index" data-id="398758" data-country="united states" data-category="chicago fed national activity index" data-event="chicago fed national activity index" data-symbol=\'UNITEDSTACHIFEDNATAC\'> <td style="white-space: nowrap;" class=\' 2026-10-26\'> <span class="event-10 calendar-date-2"> 12:30 PM </span> </td> <td class="calendar-item" style="white-space: nowrap"> <table style="padding: 0px;"> <tr> <td style="padding-left: 5px;"> <div title="United States" class=\'flag flag-us\'></div> </td> <td title="United States" style="padding-left: 5px;" class="calendar-iso">US</td> </tr> </table> </td> <td style="max-width: 250px; overflow-x: hidden;"> <a class=\'calendar-event\' href=\'/united-states/chicago-fed-national-activity-index\'>Chicago Fed National Activity Index</a> <span class="calendar-reference">SEP</span> </td> <td class="calendar-item calendar-item-positive"> <span id=\'actual\'></span> </td> <td class="calendar-item calendar-item-negative"> <span id=\'previous\'>-0.04</span> <span id=\'revised\' style="cursor: pointer; color: #333; font-size: 10px;" data-bs-toggle="tooltip" title=> </span> </td> <td class="calendar-item calendar-item-positive"> <a id=\'consensus\' aria-label=\'UNITEDSTACHIFEDNATAC\' href=\'/united-states/chicago-fed-national-activity-index\'></a></span> </td> <td class="calendar-item calendar-item-negative"> <a id=\'forecast\' href=\'/united-states/chicago-fed-national-activity-index\'>-0.1</a></span> </td> <td class=\'d-md-none d-lg-table-cell\' style=\'text-align: right\'><a target=\'_blank\' style=\'text-align: center\' href=\'/united-states/chicago-fed-national-activity-index\'><div class=\'lazy\' style=\'height: 20px; width: 40px;\' data-src=\'https://d3fy651gv2fhd3.cloudfront.net/charts/calendar-398758.png?h=20&w=40&n=4&y=0&y2=0&x=0&title=false&lbl=0&bg=0&v=V20230410&url=/united-states/chicago-fed-national-activity-index\' data-chart=\'/united-states/chicago-fed-national-activity-index\' title=\'US Chicago Fed National Activity Index\' data-placement=\'right\'></div></a></td> <td class=" d-none d-md-table-cell d-lg-none"></td> <td class=\'td-alert\'> <div title=\'Create Alert\' data-type=\'te-alert-hook\' class=\'bi bi-bell-fill te-alert-bell\'></div> </td> </tr> <!-- copy of table head to show on scroll -->'

_rows = parse_te_calendar(_TE_RELEASED + _TE_PENDING, 'USD')

check('only the RELEASED row is returned, never the pending one', len(_rows), 1)
check('the released value is read', _rows[0]['actual'], '57.6')
check('...with its event name', _rows[0]['event'], 'S&P Global Composite PMI Flash')
check('...its date', _rows[0]['date'], '2026-10-23')
check('...its previous reading', _rows[0]['previous'], '58.4')
check('...and the currency it was asked for', _rows[0]['currency'], 'USD')

# THE NESTED FLAG TABLE. Each row contains its own <table><tr>...</tr></table>, so a non-greedy
# `<tr>.*?</tr>` stops at the INNER close and truncates the row before the value -- which looks
# exactly like "this page has no actuals". Slicing between `data-event=` markers is what avoids
# it, and this is the check that would catch a regression back to the naive match.
check('the value survives the nested flag table inside the row',
      'flag flag-us' in _TE_RELEASED and _rows[0]['actual'] == '57.6', True)

# A pending row on its own must produce NOTHING -- never a message that says nothing.
check('a page with nothing released yields no rows', parse_te_calendar(_TE_PENDING, 'USD'), [])
check('an empty page is handled', parse_te_calendar('', 'USD'), [])
check('a page with no calendar rows is handled',
      parse_te_calendar('<html><body>no</body></html>', 'USD'), [])

# Only the currencies actually traded -- four pages, not the whole world.
check('the four traded currencies are covered', sorted(_TE_CALENDARS), ['EUR', 'GBP', 'JPY', 'USD'])

print(f'\n{_pass} passed, {_fail} failed')
sys.exit(1 if _fail else 0)
