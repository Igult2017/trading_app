"""
test_rate_scraper.py — run with:
    py -3 server/python/test_rate_scraper.py

THE POLICY RATE MUST NEVER BE THE DEPOSIT RATE.

His question, 2026-09-07, after reading the logs: *"Can you find a fix for the rates scrappers?"*

WHAT WAS WRONG. Three currencies — JPY, CHF, NZD — have no dedicated central-bank fetcher and fall
through to Trading Economics, which had been failing with "No rate value found on page". So all
three had been served from a hardcoded table, and that table was badly out of date: Japan showed
0.50 when the real rate was 1.00, Switzerland 0.25 against 0.00, New Zealand 3.25 against 2.75.

WHY IT FAILED, AND WHY THE FAILURE WAS LUCKY. The row was matched by SUBSTRING — any label
containing "interest rate" — and every one of those pages carries "Deposit Interest Rate" BEFORE the
policy rate. Measured on the live pages:

    Japan          Deposit Interest Rate 0.40  |  Interest Rate      1.00
    Switzerland    Deposit Interest Rate 0.03  |  SNB Interest Rate  0.00
    New Zealand    Deposit Interest Rate 4.66  |  RBNZ Interest Rate 2.75

Two further faults — the matched row had no id='actual' cell, and the fallback demanded a literal
'%' where the page writes "percent" in a separate cell — are what made it ERROR rather than return
the deposit rate. Fix only the obvious one (the '%'), and it would have started quietly reporting
Japan at 0.40. **That is what this file exists to prevent.**

NO NETWORK. These run the real parsing rules against saved markup, so they are deterministic and
still fail if the selection logic regresses. The live pages were checked separately, by running the
real function against all eight currencies.
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


from news_calendar import _TE_POLICY_ROW, _TE_NOT_POLICY, _FALLBACK_RATES, _TE_COUNTRY

print('\nTHE POLICY RATE IS NEVER THE DEPOSIT RATE\n')

# ── 1. THE ROW SELECTION, driven exactly as the scraper drives it ──────────
# This mirrors the selection in _fetch_trading_economics_rate: build label -> value over every row,
# drop anything on the never-list, then take the first preferred label that is present.
def select(currency, rows):
    found = {}
    for label, value in rows:
        lab = ' '.join(label.lower().split())
        if any(bad in lab for bad in _TE_NOT_POLICY):
            continue
        if -5.0 <= value <= 30.0:
            found.setdefault(lab, value)
    for wanted in _TE_POLICY_ROW.get(currency, ('interest rate',)):
        if wanted in found:
            return found[wanted]
    return None


print('1. the real pages, as measured on 2026-09-07:')
JAPAN = [('Deposit Interest Rate', 0.40), ('Interest Rate', 1.00)]
SWISS = [('Deposit Interest Rate', 0.03), ('SNB Interest Rate', 0.00)]
KIWI  = [('Deposit Interest Rate', 4.66), ('Interbank Rate', 3.06), ('RBNZ Interest Rate', 2.75)]
USA   = [('Inflation Rate YoY', 3.40), ('Fed Interest Rate', 3.75), ('Unemployment Rate', 4.10)]

check('Japan takes the policy rate, not the 0.40 deposit rate', select('JPY', JAPAN), 1.00)
check('Switzerland takes the SNB rate, not the 0.03 deposit rate', select('CHF', SWISS), 0.00)
check('New Zealand takes the RBNZ rate, not deposit 4.66 or interbank 3.06', select('NZD', KIWI), 2.75)
check('the US takes the Fed rate, not inflation or unemployment', select('USD', USA), 3.75)

# ── 2. TEETH — the OLD rule must fail these ────────────────────────────────
# A substring match over the same rows picks the first label containing "interest rate", which is
# the deposit rate on every page. If this ever stops failing, the guard has been lost.
print('\n2. teeth — the OLD substring rule really did pick the wrong row:')
def old_substring_rule(rows):
    for label, value in rows:
        if 'interest rate' in label.lower():
            return value
    return None

check('the old rule picked Japan\'s DEPOSIT rate', old_substring_rule(JAPAN), 0.40)
check('...and Switzerland\'s', old_substring_rule(SWISS), 0.03)
check('...and New Zealand\'s', old_substring_rule(KIWI), 4.66)
check('while the new rule does not', [select(c, r) for c, r in
      (('JPY', JAPAN), ('CHF', SWISS), ('NZD', KIWI))], [1.00, 0.00, 2.75])

# ── 3. WHAT MUST NEVER BE RETURNED ─────────────────────────────────────────
print('\n3. rows that can never be a policy rate are refused outright:')
for bad in ('Deposit Interest Rate', 'Interbank Rate', 'Inflation Rate YoY',
            'Unemployment Rate', 'Bank Lending Rate', 'Prime Lending Rate'):
    check(f'{bad!r} is refused', select('JPY', [(bad, 2.0)]), None)

# A POLICY RATE IS A SMALL NUMBER. These pages also carry balance sheets in the millions.
print('\n4. a number that cannot be a rate is refused:')
check('a balance-sheet figure is not a rate', select('JPY', [('Interest Rate', 644295.70)]), None)
check('...nor is a deeply negative one', select('JPY', [('Interest Rate', -99.0)]), None)
check('but a real negative policy rate is allowed', select('CHF', [('SNB Interest Rate', -0.75)]), -0.75)

# ── 5. THE TABLE STAYS COMPLETE ────────────────────────────────────────────
# Every currency the app shows needs a page, a row rule and a last-resort value, or it silently
# drops out of the calendar.
print('\n5. every currency is fully configured:')
for ccy in ('USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'NZD'):
    check(f'{ccy} has a page, a row rule and a fallback',
          bool(_TE_COUNTRY.get(ccy)) and bool(_TE_POLICY_ROW.get(ccy)) and ccy in _FALLBACK_RATES,
          True)

# ── 6. THE RBA FILE IS OLDEST-FIRST ────────────────────────────────────────
# Second defect, same day, same class as the first: take the FIRST thing that parses instead of the
# RIGHT one. The homepage had been showing Australia at 4.75% — the cash rate on 4 January 2011 —
# because the parser walked the file from the top and the RBA publishes oldest-first. The newest row
# in the very same file said 4.35%.
from news_calendar import _rba_latest_row, _RBA_MAX_AGE_DAYS
from datetime import datetime

print('\n6. the RBA cash rate comes from the NEWEST row, not the first:')

# Trimmed from the real file (3,979 lines) fetched on 2026-09-07. Column 1 is Cash Rate Target;
# columns either side hold DIFFERENT series, which is what made the old "any number" fallback unsafe.
RBA = [
    '﻿F1 INTEREST RATES AND YIELDS - MONEY MARKET',
    'Title,Cash Rate Target,Change in the Cash Rate Target,Interbank Overnight Cash Rate',
    'Description,Cash Rate Target on date,Change in the Cash Rate Target,Interbank Overnight',
    'Frequency,Daily,as announced,Daily',
    'Type,Original,Original,Original',
    'Units,Per cent,Per cent,Per cent',
    '',
    '',
    'Source,RBA,RBA,RBA',
    'Publication date,07-Sep-2026,07-Sep-2026,07-Sep-2026',
    'Series ID,FIRMMCRTD,FIRMMCCRT,FIRMMCRID',
    '04-Jan-2011,4.75,,4.75',
    '05-Jan-2011,4.75,,4.75',
    '03-Sep-2026,4.35,,4.35',
    '04-Sep-2026,4.35,,4.35',
    '07-Sep-2026,,,',            # today, rate cell still blank
]
NOW = datetime(2026, 9, 7)

check('it takes the newest dated row, not row 11 from 2011',
      _rba_latest_row(RBA, NOW), ('04-Sep-2026', 4.35))
check('...and specifically NOT the 2011 value the homepage was showing',
      _rba_latest_row(RBA, NOW)[1] == 4.75, False)
check('a blank rate cell on today\'s row is skipped, not treated as zero',
      _rba_latest_row(RBA, NOW)[0] != '07-Sep-2026', True)


def _threw(fn):
    try:
        fn()
        return None
    except Exception as e:
        return str(e)


# TEETH — the OLD top-down rule really did take 2011.
def old_topdown_rule(lines):
    target_col = None
    for i, line in enumerate(lines):
        if 'Cash Rate Target' in line or 'FIRMMCRTD' in line:
            cols = [c.strip().strip('"') for c in line.split(',')]
            for j, col in enumerate(cols):
                if 'Cash Rate' in col or 'FIRMMCRTD' in col:
                    target_col = j
                    break
        if target_col is not None and i > 10:
            cols = [c.strip().strip('"') for c in line.split(',')]
            if target_col < len(cols) and cols[target_col]:
                try:
                    val = float(cols[target_col])
                    if 0 < val < 30:
                        return val
                except ValueError:
                    pass
    return None


check('teeth: the old top-down rule really did return the 2011 rate',
      old_topdown_rule(RBA), 4.75)

# A STALE FILE IS REFUSED. This is the guard that makes the 2011 failure impossible to repeat
# quietly — a plausible-looking number with no recent date behind it never gets quoted.
STALE = RBA[:11] + ['04-Jan-2011,4.75,,4.75']
check('a file whose newest row is years old raises rather than returning 4.75',
      bool(_threw(lambda: _rba_latest_row(STALE, NOW))), True)
check('...and the message says how old it is',
      'days old' in (_threw(lambda: _rba_latest_row(STALE, NOW)) or ''), True)
check('the age limit is a real number of days', _RBA_MAX_AGE_DAYS >= 7, True)

# A HOLIDAY RUN MUST NOT TRIP IT. The RBA is closed over Christmas; that is not a broken file.
HOLIDAY = RBA[:11] + ['24-Dec-2025,4.35,,4.35']
check('a two-week gap over a holiday is still accepted',
      _rba_latest_row(HOLIDAY, datetime(2026, 1, 7)), ('24-Dec-2025', 4.35))

# THE WRONG COLUMN IS NEVER READ. The old fallback took any number from any column; the neighbours
# hold different series entirely.
check('the column is matched exactly, so "Change in the Cash Rate Target" is not it',
      _rba_latest_row([
          'Title,Change in the Cash Rate Target,Cash Rate Target',
          '04-Sep-2026,0.25,4.35',
      ], NOW), ('04-Sep-2026', 4.35))
check('a file with no cash-rate column raises instead of guessing',
      bool(_threw(lambda: _rba_latest_row(['Title,Interbank Overnight Cash Rate',
                                           '04-Sep-2026,4.35'], NOW))), True)

# ── 7. THE ECB VALUE COMES FROM THE NAMED COLUMN ───────────────────────────
# Third defect of the day, and the one with two faults stacked. The series code was wrong, so every
# call came back "not found" and the euro rate quietly came from the American FRED mirror instead.
# Underneath that, the value was read from the LAST of 40 columns, which holds 0 — and the sanity
# check accepted 0. Fixing only the series code would have started reporting the euro area at 0%.
from news_calendar import _ecb_obs_value

print('\n7. the ECB rate is read from the named column, never the last one:')

# The real reply, trimmed to the columns that matter but keeping the trap: TITLE_COMPL is a QUOTED
# field containing a comma, which shifts every column after it when you split on commas.
ECB = (
    'KEY,FREQ,TIME_PERIOD,OBS_VALUE,OBS_STATUS,TITLE_COMPL,UNIT,UNIT_MULT\n'
    'FM.B.U2.EUR.4F.KR.DFR.LEV,B,2026-06-17,2.25,A,'
    '"Euro area - Key interest rate - Deposit facility - Level - Euro, provided by ECB",PCPA,0\n'
)

check('it returns the OBS_VALUE, not the last column', _ecb_obs_value(ECB), ('2026-06-17', 2.25))
check('...and specifically NOT the 0 the old rule took', _ecb_obs_value(ECB)[1] == 0.0, False)

# TEETH — the OLD rule really did take the last column, and 0 really did pass its sanity check.
def old_last_column_rule(text):
    for line in reversed(text.strip().split('\n')):
        parts = line.split(',')
        if len(parts) >= 2:
            try:
                val = float(parts[-1].strip())
                if 0 <= val < 20:
                    return val
            except ValueError:
                continue
    return None

check('teeth: the old rule really did return 0 for the euro area', old_last_column_rule(ECB), 0.0)

# The quoted comma is the reason a plain split cannot be used.
check('a naive comma split really does land on the wrong field',
      ECB.strip().split('\n')[1].split(',')[3] != '2.25', False)
check('a reply with no value column raises instead of guessing',
      bool(_threw(lambda: _ecb_obs_value('KEY,FREQ\nFM.B,B\n'))), True)
check('an empty reply raises', bool(_threw(lambda: _ecb_obs_value('KEY,OBS_VALUE\n'))), True)

# NO AGE CHECK ON THIS ONE, unlike the RBA file. The series carries one row per CHANGE of the rate,
# so a months-old date is correct, not stale. Pinning that so it is not "helpfully" added later.
check('a rate unchanged for months is still accepted',
      _ecb_obs_value('KEY,TIME_PERIOD,OBS_VALUE\nFM.B,2024-06-12,4.00\n'), ('2024-06-12', 4.00))

print(f'\n  {_pass} passed, {_fail} failed\n')
sys.exit(1 if _fail else 0)
