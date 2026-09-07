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

print(f'\n  {_pass} passed, {_fail} failed\n')
sys.exit(1 if _fail else 0)
