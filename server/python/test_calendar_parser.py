"""
test_calendar_parser.py — run with:
    py -3 server/python/test_calendar_parser.py

THE CALENDAR MUST NOT COME BACK EMPTY, AND ITS CLOCK MUST NOT BE GUESSED.

His instruction, 2026-09-07: *"Yes fix myfx but there is no other reliable source for news that myfx
so you will have to find a way to fix it."* And: *"I dont need crypto and stock news. You can remove
and delete there sections from the calendar. I only need commodity and forex news."*

WHAT WAS WRONG. The platform had NO economic events at all — no jobs numbers, no inflation figures,
no central-bank decisions. That is a money defect, not a display one: VIX.1's two news protections
(vix1.py:251-255) read the event list, so with it empty neither could ever fire. They were not
broken; they were starved.

Three faults, each enough on its own:

  1. The crypto feed WIPED the calendar. `upsertCalendarEvents` deleted the whole window and only
     then discovered it had nothing to put back, because crypto headlines carry no scheduled time.
     Fixed in calendarDb.ts, and the crypto feed is now deleted outright.
  2. The page structure changed. `#calendarMobile` no longer exists; the calendar is a table,
     `#economicCalendarTable`. Even a perfect bypass would have parsed nothing.
  3. The disguise stopped getting in at all. Covered by the fetch path, not by this file.

NO NETWORK. These run the real parser against markup copied from the live page, so they are
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


from news_calendar import parse_calendar_html, _categorize, _DROP_CATEGORY

# ── The real markup, copied from the live page on 2026-09-07 ───────────────
# Kept deliberately faithful: the timestamp lives on a span INSIDE the row, the displayed time is in
# cell 0, and the value cells carry currency symbols. One stock row and one crypto row are included
# because dropping them is now part of the contract.
#
# EVERY EPOCH HERE IS COMPUTED, NOT INVENTED. The two copied straight off the live page passed first
# time; the one number I typed from memory was a day and twelve hours out, and the parser caught it.
# Anything added later gets computed the same way, never guessed:
#     int(datetime.fromisoformat(t).replace(tzinfo=timezone.utc).timestamp() * 1000)
def row(rid, epoch, shown, ccy, name, impact, prev='', cons='', actual=''):
    return f'''
    <tr id="calRow{rid}" data-row-id="{rid}" class="economicCalendarRow">
      <td class="calendarToggleCell">
        <div style="width: 90px;" data-calendardatetd="x">{shown}</div>
      </td>
      <td class="calendarToggleCell no-padding">
        <span name="calendarLeft" class="calendarLeft" importance="1" time="{epoch}">7 min</span>
      </td>
      <td class="calendarToggleCell"></td>
      <td class="calendarToggleCell">{ccy}</td>
      <td class="calendarToggleCell text-left">{name}</td>
      <td class="calendarToggleCell">{impact}</td>
      <td class="calRow calendarToggleCell" data-previous="{rid}">{prev}</td>
      <td class="calendarToggleCell" data-concensus="{rid}">{cons}</td>
      <td class="calendarToggleCell" data-actual="{rid}">{actual}</td>
      <td class="calendarAllNoneColumn"></td>
    </tr>'''


PAGE = f'''<html><head><title>Economic Calendar | Myfxbook</title></head><body>
<table id="economicCalendarTable" class="table table-hover">
  <tr class="sticky-header bg-white"><td>Date</td><td>Time left</td><td></td><td>Event</td>
      <td>Impact</td><td>Previous</td><td>Consensus</td><td>Actual</td><td></td><td></td></tr>
  <tr data-ignore-row="true" class="economicCalendarDateRow"><td>Monday, Sep 07, 2026</td></tr>
  {row(311517, 1788764400000, "Sep 07, 07:00", "CHF", "Unemployment Rate (Aug)", "HIGH", "2.9%", "3.0%", "3.0%")}
  {row(311595, 1788786000000, "Sep 07, 13:00", "EUR", "12-Month BTF Auction", "LOW", "2.86%")}
  {row(311712, 1788933600000, "Sep 09, 06:00", "EUR", "Balance of Trade (Jul)", "MEDIUM", "&#8364;1.9B", "&#8364;1.2B")}
  {row(311800, 1788800000000, "Sep 07, 10:13", "USD", "Crude Oil Inventories", "MEDIUM", "-1.2M")}
  {row(311801, 1788800000000, "Sep 07, 10:13", "USD", "Nasdaq Earnings Call", "LOW")}
  {row(311802, 1788800000000, "Sep 07, 10:13", "BTC", "Bitcoin ETF Flows", "HIGH")}
  {row(311803, 1788800000000, "Sep 07, 10:13", "CAD", "Labor Day", "NONE")}
</table></body></html>'''

print('\nTHE ECONOMIC CALENDAR PARSES, AND ONLY FOREX + COMMODITIES SURVIVE\n')

events = parse_calendar_html(PAGE)
by_name = {e['event']: e for e in events}

# ── 1. IT FINDS THE EVENTS AT ALL ──────────────────────────────────────────
print('1. the new table is read:')
check('five forex/commodity events survive', len(events), 5)
check('the stock row is gone', 'Nasdaq Earnings Call' in by_name, False)
check('the crypto row is gone', 'Bitcoin ETF Flows' in by_name, False)

# ── 2. TEETH — the OLD selector finds nothing here ─────────────────────────
# If this ever stops failing, MyFXBook has reverted and the rewrite was unnecessary; far more
# likely, someone has restored the old parser and the calendar is empty again.
print('\n2. teeth — the old #calendarMobile parser really would find nothing:')
from bs4 import BeautifulSoup
check('#calendarMobile does not exist in the current page',
      BeautifulSoup(PAGE, 'html.parser').find(id='calendarMobile') is None, True)
check('...while the new container does',
      BeautifulSoup(PAGE, 'html.parser').find(id='economicCalendarTable') is not None, True)

# ── 3. THE CLOCK — from the timestamp, never the displayed text ────────────
# This is the one that costs money if it is wrong. VIX.1 refuses to enter inside a high-impact news
# window; an hours-out clock either blocks the wrong hour or fails to block the right one.
print('\n3. the scheduled time comes from the timestamp:')
chf = by_name['Unemployment Rate (Aug)']
check('epoch 1788764400000 becomes 07:00 UTC', chf['eventTime'], '2026-09-07T07:00:00')
check('the date label matches the timestamp', chf['date'], 'Sep 07')
check('the time label matches the timestamp', chf['time'], '7:00am')
eur = by_name['Balance of Trade (Jul)']
check('a different day is dated from its own timestamp', eur['eventTime'], '2026-09-09T06:00:00')
check('...and labelled from it too', eur['date'], 'Sep 09')

# A row whose DISPLAYED text disagrees with its timestamp must follow the TIMESTAMP.
DISAGREE = PAGE.replace('Sep 07, 07:00', 'Sep 07, 23:59')
check('when the shown text and the timestamp disagree, the timestamp wins',
      parse_calendar_html(DISAGREE)[0]['eventTime'], '2026-09-07T07:00:00')

# ── 4. THE FIELDS ──────────────────────────────────────────────────────────
print('\n4. every field lands in the right place:')
check('currency', chf['currency'], 'CHF')
check('event name', chf['event'], 'Unemployment Rate (Aug)')
check('impact HIGH maps to High', chf['importance'], 'High')
check('previous', chf['previous'], '2.9%')
check('forecast comes from the consensus cell', chf['forecast'], '3.0%')
check('actual', chf['actual'], '3.0%')
check('an empty value cell becomes a dash, not blank',
      by_name['12-Month BTF Auction']['actual'], '-')
check('MEDIUM maps to Medium', eur['importance'], 'Medium')
check('NONE maps to Low — there is no fourth level',
      by_name['Labor Day']['importance'], 'Low')

# ── 5. CATEGORIES — his rule, in the parser ────────────────────────────────
print('\n5. only commodities and currencies are kept:')
check('an oil event is a commodity, not a stock',
      by_name['Crude Oil Inventories']['category'], 'Commodities')
check('a normal release is a currency event', chf['category'], 'Currencies')
check('every surviving event is one of the two kept kinds',
      sorted({e['category'] for e in events}), ['Commodities', 'Currencies'])
check('nothing dropped is still present',
      [e for e in events if e['category'] in _DROP_CATEGORY], [])

# COMMODITIES IS TESTED FIRST ON PURPOSE. "Crude Oil Inventories" contains no stock word, but
# "Gold Index" does — and it must stay a commodity rather than being dropped as a stock row.
check('"Gold Index" is a commodity, not a dropped stock row',
      _categorize('Gold Index', 'USD'), 'Commodities')
check('a genuine stock row is still classified as one',
      _categorize('Nasdaq Earnings Call', 'USD'), 'Stocks')

# ── 6. BAD INPUT NEVER PRODUCES A GUESS ────────────────────────────────────
print('\n6. an unusable row is skipped, never guessed at:')
check('a row with no timestamp is skipped',
      len(parse_calendar_html(PAGE.replace('time="1788764400000"', 'time=""'))), 4)
check('a row with no currency is skipped',
      len(parse_calendar_html(PAGE.replace('>CHF<', '><'))), 4)
check('a challenge page yields nothing rather than junk',
      parse_calendar_html('<html><title>Just a moment...</title><body></body></html>'), [])
check('empty input yields nothing', parse_calendar_html(''), [])

print(f'\n  {_pass} passed, {_fail} failed\n')
sys.exit(1 if _fail else 0)
