"""
Newskeeper-based economic calendar scraper.
Scrapes MyFXBook economic calendar (same approach as the newskeeper library).
Also fetches central bank interest rates from free government APIs.

Usage:
  python news_calendar.py calendar   -> JSON array of upcoming events
  python news_calendar.py rates      -> JSON object of interest rate data
"""

import sys
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
# Calendar scraper (newskeeper approach)                                       #
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


def _parse_datetime(date_str: str, year: int) -> tuple[str, str, str]:
    """Returns (date_label, time_label, iso_string)."""
    parts = date_str.split(',', 1)
    day_part = parts[0].strip()   # e.g. "Apr 02"
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

            date_str   = cells[0].get_text().strip()
            currency   = cells[3].get_text().strip()
            name       = ' '.join(cells[4].get_text().split())
            impact     = cells[5].get_text().strip()
            previous   = cells[6].get_text().strip()
            consensus  = cells[7].get_text().strip()
            actual     = cells[8].get_text().strip()

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
                'actual':     actual   or '-',
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
# Interest rate fetchers (free government / central bank APIs)                 #
# --------------------------------------------------------------------------- #

def _fetch_ecb_rate() -> float | None:
    """ECB main refinancing rate — ECB Statistical Data Warehouse (no key)."""
    try:
        url = (
            'https://data.api.ecb.europa.eu/service/data/'
            'FM/B.U2.EUR.4F.KR.MRR_FR.LEV'
            '?lastNObservations=1&format=jsondata'
        )
        r = requests.get(url, timeout=10)
        data = r.json()
        obs = data['dataSets'][0]['series']['0:0:0:0:0:0']['observations']
        latest_key = max(obs.keys(), key=lambda x: int(x))
        return float(obs[latest_key][0])
    except Exception as e:
        print(f'[news_calendar] ECB fetch failed: {e}', file=sys.stderr)
        return None


def _fetch_fred_rate() -> float | None:
    """US Federal Funds Rate — FRED public CSV (no key required)."""
    try:
        url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS'
        r = requests.get(url, timeout=10)
        lines = [l for l in r.text.strip().split('\n') if l and not l.startswith('DATE')]
        if lines:
            return float(lines[-1].split(',')[1])
    except Exception as e:
        print(f'[news_calendar] FRED fetch failed: {e}', file=sys.stderr)
    return None


def _fetch_boc_rate() -> float | None:
    """Bank of Canada overnight rate — BoC Valet API (no key)."""
    try:
        url = (
            'https://www.bankofcanada.ca/valet/observations/'
            'group/policy_interest_rate/json?recent=1'
        )
        r = requests.get(url, timeout=10)
        data = r.json()
        obs_list = data.get('observations', [])
        if obs_list:
            latest = obs_list[-1]
            for key, val in latest.items():
                if key != 'd' and isinstance(val, dict) and 'v' in val:
                    v = val['v']
                    if v not in (None, ''):
                        return float(v)
    except Exception as e:
        print(f'[news_calendar] BoC fetch failed: {e}', file=sys.stderr)
    return None


def _fetch_rba_rate() -> float | None:
    """Reserve Bank of Australia cash rate — RBA statistics API (no key)."""
    try:
        url = 'https://www.rba.gov.au/statistics/tables/csv/f1-data.csv'
        r = requests.get(url, headers=HEADERS, timeout=10)
        lines = r.text.strip().split('\n')
        # RBA CSV: headers on row ~11, data below. Look for the cash rate target row.
        for line in reversed(lines):
            parts = line.split(',')
            if len(parts) >= 2:
                val = parts[-1].strip().strip('"')
                try:
                    return float(val)
                except ValueError:
                    continue
    except Exception as e:
        print(f'[news_calendar] RBA fetch failed: {e}', file=sys.stderr)
    return None


# Recent fallback values (updated April 2025)
_FALLBACK_RATES = {
    'USD': {'nominal': 4.33, 'inflation': 2.60, 'bank': 'Federal Reserve',        'live': False},
    'EUR': {'nominal': 2.65, 'inflation': 2.20, 'bank': 'European Central Bank',  'live': False},
    'GBP': {'nominal': 4.50, 'inflation': 2.80, 'bank': 'Bank of England',        'live': False},
    'JPY': {'nominal': 0.50, 'inflation': 3.20, 'bank': 'Bank of Japan',          'live': False},
    'AUD': {'nominal': 4.10, 'inflation': 2.40, 'bank': 'Reserve Bank of Australia', 'live': False},
    'CAD': {'nominal': 2.75, 'inflation': 2.30, 'bank': 'Bank of Canada',         'live': False},
    'CHF': {'nominal': 0.25, 'inflation': 0.30, 'bank': 'Swiss National Bank',    'live': False},
    'NZD': {'nominal': 3.50, 'inflation': 2.20, 'bank': 'Reserve Bank of NZ',     'live': False},
    'CNY': {'nominal': 3.10, 'inflation': 0.10, 'bank': "People's Bank of China", 'live': False},
}


def get_interest_rates() -> dict:
    """Return central bank rates, replacing fallbacks with live API data where available."""
    import copy
    rates = copy.deepcopy(_FALLBACK_RATES)

    ecb = _fetch_ecb_rate()
    if ecb is not None:
        rates['EUR']['nominal'] = ecb
        rates['EUR']['live'] = True

    fred = _fetch_fred_rate()
    if fred is not None:
        rates['USD']['nominal'] = fred
        rates['USD']['live'] = True

    boc = _fetch_boc_rate()
    if boc is not None:
        rates['CAD']['nominal'] = boc
        rates['CAD']['live'] = True

    rba = _fetch_rba_rate()
    if rba is not None:
        rates['AUD']['nominal'] = rba
        rates['AUD']['live'] = True

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
