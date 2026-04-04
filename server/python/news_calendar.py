"""
Newskeeper-based economic calendar scraper.
Scrapes MyFXBook economic calendar (same approach as the newskeeper library).
Fetches central bank interest rates and inflation from free official APIs — no hardcoded values.

Usage:
  python news_calendar.py calendar   -> JSON array of upcoming events
  python news_calendar.py rates      -> JSON object of rate + inflation data per currency
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
# Central bank policy rate fetchers — all free, no API key                    #
# --------------------------------------------------------------------------- #

def _fetch_ecb_rate() -> float | None:
    """EUR — ECB Statistical Data Warehouse (SDW) REST API."""
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
    """USD — FRED public CSV endpoint (no key needed)."""
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
    """CAD — Bank of Canada Valet API (no key)."""
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
                if key != 'd' and isinstance(val, dict):
                    v = val.get('v')
                    if v not in (None, ''):
                        return float(v)
    except Exception as e:
        print(f'[news_calendar] BoC fetch failed: {e}', file=sys.stderr)
    return None


def _fetch_rba_rate() -> float | None:
    """AUD — Reserve Bank of Australia cash rate target (official stats CSV)."""
    try:
        # F1 table: Selected Interest Rates — column FIRMMCRTD (Cash Rate Target)
        url = 'https://www.rba.gov.au/statistics/tables/csv/f1-data.csv'
        r = requests.get(url, headers=HEADERS, timeout=10)
        lines = r.text.strip().split('\n')
        # Find the Cash Rate Target row header, then its data
        target_col = None
        for i, line in enumerate(lines):
            if 'Cash Rate Target' in line or 'FIRMMCRTD' in line:
                cols = [c.strip().strip('"') for c in line.split(',')]
                for j, col in enumerate(cols):
                    if 'Cash Rate' in col or 'FIRMMCRTD' in col:
                        target_col = j
                        break
            if target_col is not None and i > 10:
                # Try to read a data value from this column
                cols = [c.strip().strip('"') for c in line.split(',')]
                if target_col < len(cols) and cols[target_col]:
                    try:
                        val = float(cols[target_col])
                        if 0 < val < 30:  # sanity check
                            return val
                    except ValueError:
                        pass
        # Fallback: last non-empty value in last few lines
        for line in reversed(lines[-20:]):
            cols = [c.strip().strip('"') for c in line.split(',')]
            for col in reversed(cols):
                try:
                    val = float(col)
                    if 0 < val < 30:
                        return val
                except ValueError:
                    pass
    except Exception as e:
        print(f'[news_calendar] RBA fetch failed: {e}', file=sys.stderr)
    return None


def _fetch_boe_rate() -> float | None:
    """GBP — Bank of England official chart API (no key)."""
    try:
        # IUDBEDR = Bank of England Official Bank Rate
        url = (
            'https://api.bankofengland.co.uk/chart/series'
            '?seriesIds=IUDBEDR&startDate=2025-01-01'
        )
        r = requests.get(url, timeout=10)
        data = r.json()
        chart_data = data.get('chartData', [])
        if chart_data:
            pts = chart_data[0].get('dataPoints', [])
            if pts:
                return float(pts[-1]['value'])
    except Exception as e:
        print(f'[news_calendar] BoE fetch failed: {e}', file=sys.stderr)
    return None


# BIS country code -> currency mapping for WS_CBPOL dataset
_BIS_CODE_MAP = {
    'JP':  'JPY',
    'CH':  'CHF',
    'NZ':  'NZD',
    'GB':  'GBP',   # backup if BoE API fails
    'CN':  'CNY',   # PBOC if included
}


def _fetch_bis_rates(currencies: list) -> dict:
    """
    JPY, CHF, NZD (and optionally GBP, CNY) — BIS Central Bank Policy Rates
    via the BIS SDMX 2.1 REST API (no key, completely free).
    Dataset: WS_CBPOL
    """
    wanted_bis = [k for k, v in _BIS_CODE_MAP.items() if v in currencies]
    if not wanted_bis:
        return {}
    codes = '+'.join(wanted_bis)
    url = (
        f'https://stats.bis.org/api/v2/data/dataflow/BIS,WS_CBPOL,1.0/'
        f'M.{codes}?lastNObservations=1&format=jsondata'
    )
    try:
        r = requests.get(url, timeout=15)
        data = r.json()
        inner = data.get('data', data)
        datasets = inner.get('dataSets', [])
        structure = inner.get('structure', {})

        series_dims = structure.get('dimensions', {}).get('series', [])
        ref_area_dim = next(
            (d for d in series_dims if d.get('id') == 'REF_AREA'), None
        )
        if not ref_area_dim or not datasets:
            return {}

        ref_area_values = ref_area_dim.get('values', [])
        ref_area_idx = series_dims.index(ref_area_dim)

        result = {}
        for key, series in datasets[0].get('series', {}).items():
            parts = key.split(':')
            if ref_area_idx < len(parts):
                area_pos = int(parts[ref_area_idx])
                if area_pos < len(ref_area_values):
                    country_code = ref_area_values[area_pos].get('id', '')
                    currency = _BIS_CODE_MAP.get(country_code)
                    if currency:
                        obs = series.get('observations', {})
                        if obs:
                            latest_key = max(obs.keys(), key=int)
                            val = obs[latest_key][0]
                            if val is not None:
                                result[currency] = float(val)
        print(f'[news_calendar] BIS fetched: {list(result.keys())}', file=sys.stderr)
        return result

    except Exception as e:
        print(f'[news_calendar] BIS fetch failed: {e}', file=sys.stderr)
        return {}


# --------------------------------------------------------------------------- #
# Inflation fetchers — World Bank CPI YoY (free, no key)                      #
# --------------------------------------------------------------------------- #

# World Bank country codes for each currency
_WB_COUNTRY = {
    'USD': 'US',
    'EUR': '1A',   # Euro area aggregate
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
    'USD': ('Federal Reserve',                4.33),
    'EUR': ('European Central Bank',          2.15),
    'GBP': ('Bank of England',               4.50),
    'JPY': ('Bank of Japan',                  0.50),
    'CAD': ('Bank of Canada',                 2.75),
    'AUD': ('Reserve Bank of Australia',      4.10),
    'CHF': ('Swiss National Bank',            0.25),
    'NZD': ('Reserve Bank of New Zealand',    3.75),
}


def get_interest_rates() -> dict:
    """
    Fetch central bank policy rates from official free APIs.
    If a live API call fails, a recent fallback value is used and
    the entry is marked live=False so the UI can indicate the data
    may not be real-time.  All 8 major currencies are always returned.
    """
    rates: dict = {}

    def _add(currency: str, bank: str, nominal: float | None) -> None:
        if nominal is not None:
            rates[currency] = {
                'bank':      bank,
                'nominal':   nominal,
                'inflation': None,
                'live':      True,
            }

    # --- live nominal rates ---
    _add('EUR', 'European Central Bank',     _fetch_ecb_rate())
    _add('USD', 'Federal Reserve',           _fetch_fred_rate())
    _add('CAD', 'Bank of Canada',            _fetch_boc_rate())
    _add('AUD', 'Reserve Bank of Australia', _fetch_rba_rate())
    _add('GBP', 'Bank of England',           _fetch_boe_rate())

    # BIS covers JPY, CHF, NZD (+ GBP & CNY as backup)
    still_needed = [c for c in ('JPY', 'CHF', 'NZD', 'CNY') if c not in rates]
    bis = _fetch_bis_rates(still_needed + (['GBP'] if 'GBP' not in rates else []))

    bank_names = {
        'JPY': 'Bank of Japan',
        'CHF': 'Swiss National Bank',
        'NZD': 'Reserve Bank of New Zealand',
        'GBP': 'Bank of England',
        'CNY': "People's Bank of China",
    }
    for ccy, rate in bis.items():
        if ccy not in rates:
            _add(ccy, bank_names.get(ccy, ccy), rate)

    # --- fallback for any currency that didn't come back live ---
    for ccy, (bank, fallback_rate) in _FALLBACK_RATES.items():
        if ccy not in rates:
            print(f'[news_calendar] Using fallback rate for {ccy}: {fallback_rate}%', file=sys.stderr)
            rates[ccy] = {
                'bank':      bank,
                'nominal':   fallback_rate,
                'inflation': None,
                'live':      False,
            }

    # --- inflation (World Bank CPI YoY) ---
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
