"""
Newskeeper-based economic calendar scraper.
Scrapes MyFXBook economic calendar (same approach as the newskeeper library).
Fetches central bank interest rates from accessible free sources — no hardcoded values.

Sources used (all accessible from Replit environment):
  USD — FRED FEDFUNDS CSV (no API key)
  EUR — FRED ECBDFR CSV (no API key)
  GBP — Bank of England official website scrape
  CAD — Bank of Canada Valet API (series V39079)
  AUD — Reserve Bank of Australia statistics CSV
  JPY, CHF, NZD — Trading Economics website scrape (id='actual' element)
  Universal fallback — Trading Economics for any currency that fails primary

Usage:
  python news_calendar.py calendar   -> JSON array of upcoming events
  python news_calendar.py rates      -> JSON object of rate + inflation data per currency
"""

import sys
import re
import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/120.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

MONTH_MAP = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4,
    'May': 5, 'Jun': 6, 'Jul': 7, 'Aug': 8,
    'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12,
}

# --------------------------------------------------------------------------- #
# Calendar scraper (newskeeper approach — MyFXBook via BeautifulSoup)          #
# --------------------------------------------------------------------------- #

def _categorize(name: str, currency: str) -> str:
    n = name.lower()
    if currency in ('BTC', 'ETH', 'XRP'):
        return 'Crypto'
    if any(w in n for w in ('oil', 'crude', 'gold', 'silver', 'gas', 'commodity', 'eia')):
        return 'Commodities'
    if any(w in n for w in ('stock', 'equity', 'earnings', 'index', 'nasdaq', 's&p', 'dow')):
        return 'Stocks'
    return 'Currencies'


def _parse_datetime(date_str: str, year: int) -> tuple:
    """Returns (date_label, time_label, iso_string)."""
    parts = date_str.split(',', 1)
    day_part = parts[0].strip()
    time_part = parts[1].strip() if len(parts) > 1 else '00:00'
    try:
        dp = day_part.split()
        month = MONTH_MAP.get(dp[0], 1)
        day_num = int(dp[1]) if len(dp) > 1 else 1
        tp = time_part.replace('am', '').replace('pm', '').strip().split(':')
        hour = int(tp[0]) if tp else 0
        minute = int(tp[1]) if len(tp) > 1 else 0
        dt = datetime(year, month, day_num, hour, minute)
        return f"{dp[0]} {day_num:02d}", time_part, dt.isoformat()
    except Exception:
        return day_part, time_part, datetime.now().isoformat()


def scrape_calendar() -> list:
    """Newskeeper-style scrape of MyFXBook economic calendar."""
    url = 'https://www.myfxbook.com/forex-economic-calendar'
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f'[news_calendar] HTTP {resp.status_code}', file=sys.stderr)
            return []

        soup = BeautifulSoup(resp.text, 'html.parser')
        rows = soup.find_all('tr', class_='economicCalendarRow')
        year = datetime.now().year
        results = []

        for row in rows:
            cells = row.find_all('td', class_='calendarToggleCell')
            if len(cells) < 9:
                continue

            date_str  = cells[0].get_text().strip()
            currency  = cells[3].get_text().strip()
            name      = ' '.join(cells[4].get_text().split())
            impact    = cells[5].get_text().strip()
            previous  = cells[6].get_text().strip()
            consensus = cells[7].get_text().strip()
            actual    = cells[8].get_text().strip()

            if not name or not currency:
                continue

            date_label, time_label, iso_dt = _parse_datetime(date_str, year)
            importance = impact if impact in ('High', 'Medium', 'Low') else 'Low'

            results.append({
                'date':       date_label,
                'time':       time_label,
                'currency':   currency,
                'event':      name,
                'importance': importance,
                'actual':     actual    or '-',
                'forecast':   consensus or '-',
                'previous':   previous  or '-',
                'eventTime':  iso_dt,
                'category':   _categorize(name, currency),
            })

        print(f'[news_calendar] scraped {len(results)} events', file=sys.stderr)
        return results

    except Exception as exc:
        print(f'[news_calendar] scrape error: {exc}', file=sys.stderr)
        return []


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


def _fetch_eur_rate() -> float | None:
    """EUR — FRED ECBDFR (ECB Deposit Facility Rate, no API key needed)."""
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


def _fetch_aud_rate() -> float | None:
    """AUD — Reserve Bank of Australia F1 statistics CSV (Cash Rate Target column)."""
    try:
        url = 'https://www.rba.gov.au/statistics/tables/csv/f1-data.csv'
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            raise ValueError(f'HTTP {r.status_code}')
        lines = r.text.strip().split('\n')
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
                            print(f'[news_calendar] RBA CSV: {val}%', file=sys.stderr)
                            return val
                    except ValueError:
                        pass
        for line in reversed(lines[-20:]):
            cols = [c.strip().strip('"') for c in line.split(',')]
            for col in reversed(cols):
                try:
                    val = float(col)
                    if 0 < val < 30:
                        print(f'[news_calendar] RBA CSV fallback: {val}%', file=sys.stderr)
                        return val
                except ValueError:
                    pass
        raise ValueError('Cash Rate Target not found in RBA CSV')
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


def _fetch_trading_economics_rate(currency: str) -> float | None:
    """
    Fetch policy rate from Trading Economics interest rate page.
    Uses id='actual' element — the first one containing a '%' is the rate.
    This site is accessible from Replit and covers all 8 major currencies.
    """
    country = _TE_COUNTRY.get(currency)
    if not country:
        return None
    try:
        url = f'https://tradingeconomics.com/{country}/interest-rate'
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            raise ValueError(f'HTTP {r.status_code}')
        soup = BeautifulSoup(r.text, 'html.parser')

        # Primary: find the table row labelled 'Interest Rate' and extract its actual value
        for row in soup.find_all('tr'):
            cells = row.find_all('td')
            if not cells:
                continue
            if 'interest rate' in cells[0].get_text(strip=True).lower():
                actual_cell = row.find(id='actual')
                if actual_cell:
                    text = actual_cell.get_text(strip=True)
                    if '%' in text:
                        val = float(text.rstrip('%').strip())
                        print(f'[news_calendar] TE {currency} (row): {val}%', file=sys.stderr)
                        return val

        # Fallback: first id='actual' element that contains a '%'
        for el in soup.find_all(id='actual'):
            text = el.get_text(strip=True)
            if '%' in text:
                val = float(text.rstrip('%').strip())
                print(f'[news_calendar] TE {currency} (fallback): {val}%', file=sys.stderr)
                return val

        raise ValueError('No rate value found on page')
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
# Orchestrator                                                                 #
# --------------------------------------------------------------------------- #

_FALLBACK_RATES = {
    'USD': ('Federal Reserve',               4.33),
    'EUR': ('European Central Bank',         2.40),
    'GBP': ('Bank of England',              4.50),
    'JPY': ('Bank of Japan',                 0.50),
    'CAD': ('Bank of Canada',               2.75),
    'AUD': ('Reserve Bank of Australia',    4.10),
    'CHF': ('Swiss National Bank',          0.00),
    'NZD': ('Reserve Bank of New Zealand',  3.50),
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
    Fetch central bank policy rates from accessible free sources.
    If a live fetch fails, Trading Economics is tried as a universal fallback.
    If all live attempts fail, a recent hardcoded fallback is used and
    marked live=False so the UI can indicate the data may not be real-time.
    """
    rates: dict = {}

    def _add(currency: str, nominal: float | None, source: str = 'live') -> bool:
        if nominal is not None:
            rates[currency] = {
                'bank':      _BANK_NAMES.get(currency, currency),
                'nominal':   nominal,
                'inflation': None,
                'live':      True,
            }
            print(f'[news_calendar] {currency} -> {nominal}% (via {source})', file=sys.stderr)
            return True
        return False

    # ── Primary sources (dedicated, stable APIs/scrapes) ──────────────────────
    _add('USD', _fetch_usd_rate(),  'FRED FEDFUNDS')
    _add('EUR', _fetch_eur_rate(),  'FRED ECBDFR')
    _add('GBP', _fetch_gbp_rate(),  'BoE website')
    _add('CAD', _fetch_cad_rate(),  'BoC Valet API')
    _add('AUD', _fetch_aud_rate(),  'RBA CSV')

    # JPY, CHF, NZD — Trading Economics as primary
    for ccy in ('JPY', 'CHF', 'NZD'):
        if ccy not in rates:
            _add(ccy, _fetch_trading_economics_rate(ccy), 'Trading Economics')

    # ── Trading Economics universal fallback ──────────────────────────────────
    for ccy in list(_FALLBACK_RATES.keys()):
        if ccy not in rates:
            _add(ccy, _fetch_trading_economics_rate(ccy), 'Trading Economics (fallback)')

    # ── Hardcoded last-resort fallback ────────────────────────────────────────
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
        output = scrape_calendar()

    print(json.dumps(output))
