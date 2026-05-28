"""
Economic calendar scraper.
Primary source: MyFXBook — bypasses Cloudflare using curl_cffi iOS Safari TLS impersonation.
Fallbacks (emergency only): TradingView JSON API, ForexFactory XML.

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
from xml.etree import ElementTree as ET

try:
    import curl_cffi.requests as cffi_requests
    _CFFI_OK = True
except Exception:
    _CFFI_OK = False

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

TV_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://www.tradingview.com',
    'Referer': 'https://www.tradingview.com/',
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


def _tv_importance(level) -> str:
    """Map TradingView importance int (1-3) to High/Medium/Low."""
    try:
        lvl = int(level)
    except (TypeError, ValueError):
        return 'Low'
    return {3: 'High', 2: 'Medium', 1: 'Low'}.get(lvl, 'Low')


def _scrape_tradingview() -> list:
    """
    Fetch forex economic calendar from TradingView's public JSON endpoint.
    Covers current week + next week so the calendar is always populated.
    """
    from datetime import timedelta
    now = datetime.utcnow()
    # Fetch a 14-day window: past 2 days + next 12 days
    date_from = (now - timedelta(days=2)).strftime('%Y-%m-%dT00:00:00.000Z')
    date_to   = (now + timedelta(days=12)).strftime('%Y-%m-%dT23:59:59.000Z')
    countries = 'US,EU,GB,JP,CA,AU,CH,NZ,CN'
    url = (
        'https://economic-calendar.tradingview.com/events'
        f'?from={date_from}&to={date_to}&countries={countries}'
    )
    try:
        resp = requests.get(url, headers=TV_HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f'[news_calendar] TradingView HTTP {resp.status_code}', file=sys.stderr)
            return []
        data = resp.json()
        events_raw = data if isinstance(data, list) else data.get('result', [])
        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        results = []
        for ev in events_raw:
            try:
                iso = ev.get('date', '')
                dt  = datetime.fromisoformat(iso.replace('Z', '+00:00'))
                date_label = f"{months[dt.month - 1]} {dt.day:02d}"
                time_label = dt.strftime('%I:%M%p').lstrip('0').lower()
                currency   = ev.get('currency', ev.get('country', '?')).upper()
                name       = (ev.get('title') or ev.get('event') or '').strip()
                importance = _tv_importance(ev.get('importance', 1))
                actual     = str(ev.get('actual')   or '-')
                forecast   = str(ev.get('forecast') or '-')
                previous   = str(ev.get('previous') or '-')
                if not name:
                    continue
                results.append({
                    'date':       date_label,
                    'time':       time_label,
                    'currency':   currency,
                    'event':      name,
                    'importance': importance,
                    'actual':     actual,
                    'forecast':   forecast,
                    'previous':   previous,
                    'eventTime':  iso,
                    'category':   _categorize(name, currency),
                })
            except Exception:
                continue
        print(f'[news_calendar] TradingView: {len(results)} events', file=sys.stderr)
        return results
    except Exception as exc:
        print(f'[news_calendar] TradingView error: {exc}', file=sys.stderr)
        return []


def _scrape_myfxbook() -> list:
    """
    Scrape MyFXBook economic calendar.

    Bypass strategy: curl_cffi with iOS Safari 17.2 TLS fingerprint impersonation.
    Cloudflare rates Chrome/Firefox JA3 fingerprints as bots but passes real iOS
    Safari traffic — impersonating that profile lets us bypass the JS challenge
    without needing a headless browser.

    The page embeds all calendar events server-side inside #calendarMobile, so a
    single HTTP request is enough — no JS execution required after bypass.
    """
    url = 'https://www.myfxbook.com/forex-economic-calendar'

    if not _CFFI_OK:
        print('[news_calendar] curl_cffi unavailable — install with: pip install curl_cffi', file=sys.stderr)
        return []

    try:
        session = cffi_requests.Session(impersonate='safari17_2_ios')

        # Prime cookies with a homepage visit (sets XSRF-TOKEN + session cookies)
        session.get('https://www.myfxbook.com', timeout=15)

        resp = session.get(url, timeout=25)
        print(
            f'[news_calendar] MyFXBook HTTP {resp.status_code} ({len(resp.text)} bytes)',
            file=sys.stderr,
        )

        if resp.status_code != 200:
            print(f'[news_calendar] MyFXBook body snippet: {resp.text[:300]}', file=sys.stderr)
            return []

        if 'Just a moment' in resp.text or 'cf-browser-verification' in resp.text:
            print('[news_calendar] MyFXBook: Cloudflare challenge not bypassed', file=sys.stderr)
            return []

        soup = BeautifulSoup(resp.text, 'html.parser')
        cal_div = soup.find(id='calendarMobile')

        if not cal_div:
            title = soup.title.string if soup.title else 'none'
            print(f'[news_calendar] MyFXBook: #calendarMobile not found. Title={title!r}', file=sys.stderr)
            return []

        results = []
        current_date_label = ''

        MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec']

        children = [c for c in cal_div.children if getattr(c, 'name', None) == 'div']

        for div in children:
            classes = div.get('class', [])

            # ── Date header row ───────────────────────────────────────────────
            if 'economicCalendarDateRow' in classes:
                raw = div.get_text(strip=True)          # "Saturday, May 23, 2026"
                try:
                    dt = datetime.strptime(raw, '%A, %B %d, %Y')
                    current_date_label = f'{MONTHS[dt.month - 1]} {dt.day:02d}'
                except Exception:
                    current_date_label = raw
                continue

            # ── Event row ─────────────────────────────────────────────────────
            if 'calendar-mobile-row' not in classes:
                continue

            # Time — Unix-ms timestamp stored in data-time attribute of calendarLeft
            cal_left = div.find('div', class_='calendarLeft')
            time_label = 'All Day'
            iso_dt = ''
            if cal_left:
                ts_ms = cal_left.get('time', '')
                if ts_ms:
                    try:
                        dt = datetime.utcfromtimestamp(int(ts_ms) / 1000)
                        time_label = dt.strftime('%I:%M%p').lstrip('0').lower()
                        iso_dt = dt.isoformat()
                    except Exception:
                        pass

            name_el = div.find('div', class_='calendar-title')
            name = ' '.join(name_el.get_text().split()) if name_el else ''

            currency_el = div.find('div', class_='calendar-country')
            currency = currency_el.get_text(strip=True) if currency_el else ''

            if not name or not currency:
                continue

            # Impact level
            impact_div = div.find('div', class_='calendar-impact')
            importance = 'Low'
            if impact_div:
                if impact_div.find(class_='impact_high'):
                    importance = 'High'
                elif impact_div.find(class_='impact_medium'):
                    importance = 'Medium'

            # Actual value
            actual_el = div.find('span', class_='actualCell')
            actual = (actual_el.get_text(strip=True) if actual_el else '') or '-'

            # Consensus/forecast
            cons_div = div.find(attrs={'data-concensus': True})
            consensus = '-'
            if cons_div:
                full = cons_div.get_text(strip=True)
                if ':' in full:
                    consensus = full.split(':', 1)[1].strip() or '-'

            # Previous value
            prev_el = div.find('span', class_='previousCell')
            previous = (prev_el.get_text(strip=True) if prev_el else '') or '-'

            results.append({
                'date':       current_date_label,
                'time':       time_label,
                'currency':   currency,
                'event':      name,
                'importance': importance,
                'actual':     actual,
                'forecast':   consensus,
                'previous':   previous,
                'eventTime':  iso_dt,
                'category':   _categorize(name, currency),
            })

        print(f'[news_calendar] MyFXBook: {len(results)} events', file=sys.stderr)
        return results

    except Exception as exc:
        print(f'[news_calendar] MyFXBook error: {exc}', file=sys.stderr)
        return []


_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

def _scrape_forexfactory() -> list:
    """Scrape ForexFactory XML calendar (this week + next week).
    No Cloudflare — plain HTTP, always accessible from servers.
    Returns events in the same shape as _scrape_myfxbook().
    """
    feeds = [
        'https://nfs.faireconomy.media/ff_calendar_thisweek.xml',
        'https://nfs.faireconomy.media/ff_calendar_nextweek.xml',
    ]
    results = []
    seen = set()

    for url in feeds:
        try:
            r = requests.get(url, timeout=12, headers={'User-Agent': 'Mozilla/5.0'})
            if r.status_code != 200:
                print(f'[news_calendar] ForexFactory {url} -> HTTP {r.status_code}', file=sys.stderr)
                continue
            root = ET.fromstring(r.content)
        except Exception as exc:
            print(f'[news_calendar] ForexFactory fetch error: {exc}', file=sys.stderr)
            continue

        for ev in root.findall('event'):
            def txt(tag):
                node = ev.find(tag)
                return (node.text or '').strip() if node is not None else ''

            title    = txt('title')
            currency = txt('country')
            date_str = txt('date')   # "05-17-2026"
            time_str = txt('time')   # "10:30pm" or "All Day" or ""
            impact   = txt('impact') # "Low" / "Medium" / "High"
            forecast = txt('forecast') or '-'
            previous = txt('previous') or '-'

            if not title or not currency or not date_str:
                continue

            dedup_key = f'{date_str}|{time_str}|{currency}|{title}'
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            # Parse date "05-17-2026" -> "May 17" + ISO
            try:
                month, day, year = int(date_str[:2]), int(date_str[3:5]), int(date_str[6:])
                date_label = f'{_MONTH_NAMES[month - 1]} {day}'
            except Exception:
                date_label = date_str
                year = datetime.now().year

            # Parse time "10:30pm" -> ISO
            time_label = time_str if time_str and time_str.lower() != 'tentative' else 'All Day'
            iso_dt = ''
            try:
                if time_str and time_str.lower() not in ('tentative', 'all day', ''):
                    dt = datetime.strptime(f'{date_str} {time_str}', '%m-%d-%Y %I:%M%p')
                    iso_dt = dt.isoformat()
            except Exception:
                pass

            importance = impact if impact in ('High', 'Medium', 'Low') else 'Low'

            results.append({
                'date':       date_label,
                'time':       time_label,
                'currency':   currency,
                'event':      title,
                'importance': importance,
                'actual':     '-',
                'forecast':   forecast,
                'previous':   previous,
                'eventTime':  iso_dt,
                'category':   _categorize(title, currency),
            })

    print(f'[news_calendar] ForexFactory: {len(results)} events', file=sys.stderr)
    return results


def scrape_calendar() -> list:
    """Fetch forex economic calendar.

    Primary source: MyFXBook (sole intended source for forex news).
      Uses curl_cffi iOS Safari TLS impersonation to bypass Cloudflare.

    Emergency fallbacks (only activated if MyFXBook is completely unavailable):
      1. TradingView JSON API  — 300+ events, no auth, always accessible
      2. ForexFactory XML      — good from VPS, may 429 on shared IPs

    The Node service keeps serving stale cache if all sources return 0 events,
    so returning [] here is safe and won't break the UI.
    """
    events = _scrape_myfxbook()
    if events:
        print(f'[news_calendar] Using MyFXBook: {len(events)} events', file=sys.stderr)
        return events

    print('[news_calendar] MyFXBook unavailable — trying TradingView emergency fallback', file=sys.stderr)
    events = _scrape_tradingview()
    if events:
        print(f'[news_calendar] Using TradingView fallback: {len(events)} events', file=sys.stderr)
        return events

    print('[news_calendar] TradingView failed — trying ForexFactory emergency fallback', file=sys.stderr)
    events = _scrape_forexfactory()
    if events:
        print(f'[news_calendar] Using ForexFactory fallback: {len(events)} events', file=sys.stderr)
    else:
        print('[news_calendar] All calendar sources failed', file=sys.stderr)
    return events


# --------------------------------------------------------------------------- #
# Crypto event scraper — RSS from CoinDesk + CoinTelegraph                    #
# --------------------------------------------------------------------------- #

_CRYPTO_KEYWORDS_HIGH = [
    'etf', 'halving', 'sec', 'regulation', 'ban', 'fed', 'rate', 'fomc',
    'inflation', 'cpi', 'reserve', 'sanction', 'hack', 'exploit', 'crash',
    'all-time high', 'ath', 'approval', 'rejected', 'lawsuit', 'cbdc',
    'blackrock', 'fidelity', 'grayscale', 'spot',
]
_CRYPTO_KEYWORDS_MED = [
    'bitcoin', 'ethereum', 'solana', 'crypto', 'blockchain', 'defi', 'nft',
    'stablecoin', 'exchange', 'wallet', 'market', 'price', 'rally', 'surge',
    'dip', 'layer', 'upgrade', 'fork', 'token', 'staking', 'yield',
]
_COIN_MAP = {
    'bitcoin': 'BTC', 'btc': 'BTC',
    'ethereum': 'ETH', 'eth': 'ETH', 'ether': 'ETH',
    'solana': 'SOL', 'sol': 'SOL',
    'xrp': 'XRP', 'ripple': 'XRP',
    'cardano': 'ADA', 'ada': 'ADA',
    'dogecoin': 'DOGE', 'doge': 'DOGE',
    'polkadot': 'DOT', 'dot': 'DOT',
    'chainlink': 'LINK', 'link': 'LINK',
    'avalanche': 'AVAX', 'avax': 'AVAX',
    'bnb': 'BNB', 'binance': 'BNB',
    'tron': 'TRX', 'trx': 'TRX',
    'litecoin': 'LTC', 'ltc': 'LTC',
    'polygon': 'MATIC', 'matic': 'MATIC',
    'shiba': 'SHIB', 'shib': 'SHIB',
    'sui': 'SUI', 'toncoin': 'TON', 'ton': 'TON',
}


def _detect_coin(text: str) -> str:
    lower = text.lower()
    for keyword, symbol in _COIN_MAP.items():
        if keyword in lower:
            return symbol
    return 'CRYPTO'


def _detect_importance(text: str) -> str:
    lower = text.lower()
    for kw in _CRYPTO_KEYWORDS_HIGH:
        if kw in lower:
            return 'High'
    for kw in _CRYPTO_KEYWORDS_MED:
        if kw in lower:
            return 'Medium'
    return 'Low'


def _parse_rss_date(pubdate: str) -> tuple[str, str]:
    """Parse RSS pubDate to (date_label, time_label)."""
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(pubdate)
        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        date_label = f"{months[dt.month - 1]} {dt.day:02d}"
        time_label = dt.strftime('%I:%M%p').lstrip('0').lower()
        return date_label, time_label
    except Exception:
        now = datetime.now()
        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return f"{months[now.month - 1]} {now.day:02d}", '12:00am'


def scrape_crypto_events(limit: int = 30) -> list:
    """Fetch crypto news events from CoinDesk and CoinTelegraph RSS feeds."""
    from xml.etree import ElementTree as ET
    feeds = [
        'https://www.coindesk.com/arc/outboundfeeds/rss/',
        'https://cointelegraph.com/rss',
        'https://bitcoinmagazine.com/.rss/full/',
    ]
    events = []
    seen_titles: set[str] = set()

    for feed_url in feeds:
        try:
            resp = requests.get(feed_url, headers=HEADERS, timeout=12)
            if resp.status_code != 200:
                continue
            # Use bytes so ET can read the XML encoding declaration correctly.
            # If the response isn't XML at all, skip gracefully.
            content = resp.content.lstrip()
            if not content.startswith(b'<'):
                print(f'[news_calendar] {feed_url}: not XML, skipping', file=sys.stderr)
                continue
            root = ET.fromstring(content)
            for item in root.findall('.//item'):
                title = (item.findtext('title') or '').strip()
                pubdate = (item.findtext('pubDate') or '').strip()
                if not title or not pubdate:
                    continue
                key = title[:60].lower()
                if key in seen_titles:
                    continue
                seen_titles.add(key)

                date_label, time_label = _parse_rss_date(pubdate)
                coin = _detect_coin(title)
                importance = _detect_importance(title)

                events.append({
                    'date':       date_label,
                    'time':       time_label,
                    'currency':   coin,
                    'event':      title[:120],
                    'importance': importance,
                    'actual':     '-',
                    'forecast':   '-',
                    'previous':   '-',
                    'category':   'Crypto',
                    'isoDate':    pubdate,
                })
        except Exception as exc:
            print(f'[news_calendar] crypto feed {feed_url} error: {exc}', file=sys.stderr)

    print(f'[news_calendar] crypto events: {len(events)}', file=sys.stderr)
    return events[:limit]


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


def _scrape_myfxbook_rates() -> dict:
    """
    Scrape central bank interest rates from MyFXBook.

    Uses curl_cffi iOS Safari 17.2 TLS impersonation — the same Cloudflare
    bypass used by the calendar scraper — so no separate proxy or key is needed.

    Returns a dict: currency -> {bank, nominal, inflation (None), live (True)}.
    Returns {} on any failure; caller falls back to bank APIs.
    """
    if not _CFFI_OK:
        print('[news_calendar] curl_cffi unavailable — skipping MyFXBook rates', file=sys.stderr)
        return {}

    url = 'https://www.myfxbook.com/forex-economic-calendar/interest-rates'

    try:
        session = cffi_requests.Session(impersonate='safari17_2_ios')
        # Prime cookies with a homepage visit (sets XSRF-TOKEN + session cookie)
        session.get('https://www.myfxbook.com', timeout=15)

        resp = session.get(url, timeout=25)
        print(
            f'[news_calendar] MyFXBook rates HTTP {resp.status_code} ({len(resp.text)} bytes)',
            file=sys.stderr,
        )

        if resp.status_code != 200:
            print(f'[news_calendar] MyFXBook rates: unexpected status {resp.status_code}', file=sys.stderr)
            return {}

        if 'Just a moment' in resp.text or 'cf-browser-verification' in resp.text:
            print('[news_calendar] MyFXBook rates: Cloudflare challenge not bypassed', file=sys.stderr)
            return {}

        soup = BeautifulSoup(resp.text, 'html.parser')
        rates: dict = {}
        seen: set = set()

        for row in soup.select('table tbody tr'):
            cells = row.find_all('td')
            if len(cells) < 4:
                continue

            # Country name — prefer the anchor text inside the cell
            country_cell = cells[0]
            anchor = country_cell.find('a')
            country = (anchor.get_text(strip=True) if anchor else country_cell.get_text(strip=True))

            if not country or country not in _MYFXBOOK_RATE_MAP:
                continue

            currency, bank = _MYFXBOOK_RATE_MAP[country]
            if currency in seen:
                continue
            seen.add(currency)

            # Current rate is the 4th cell (index 3), strip the % sign
            try:
                rate_str = cells[3].get_text(strip=True).replace('%', '').strip()
                nominal = float(rate_str)
            except (ValueError, IndexError):
                continue

            rates[currency] = {
                'bank':      bank,
                'nominal':   nominal,
                'inflation': None,
                'live':      True,
            }
            print(f'[news_calendar] MyFXBook rates: {currency} -> {nominal}%', file=sys.stderr)

        print(
            f'[news_calendar] MyFXBook rates: {len(rates)} currencies scraped',
            file=sys.stderr,
        )
        return rates

    except Exception as exc:
        print(f'[news_calendar] MyFXBook rates scrape failed: {exc}', file=sys.stderr)
        return {}


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
    Fetch central bank policy rates.

    Priority:
      1. MyFXBook interest rates page (curl_cffi Cloudflare bypass — same as calendar).
      2. Dedicated bank APIs (FRED, BoE, BoC, RBA, Trading Economics) — only for
         currencies that MyFXBook did not return.
      3. Hardcoded last-resort values marked live=False.

    Inflation is always appended from the World Bank CPI YoY API.
    """
    # ── 1. Primary: MyFXBook ──────────────────────────────────────────────────
    rates = _scrape_myfxbook_rates()
    if rates:
        print(f'[news_calendar] MyFXBook rates primary: {sorted(rates.keys())}', file=sys.stderr)
    else:
        print('[news_calendar] MyFXBook rates unavailable — falling back to bank APIs', file=sys.stderr)

    # ── 2. Fallback: bank APIs (only for currencies missing from MyFXBook) ────
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
    _add('EUR', _fetch_eur_rate(),  'FRED ECBDFR')
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
        calendar_events = scrape_calendar()
        crypto_events = scrape_crypto_events(limit=30)
        output = calendar_events + crypto_events

    print(json.dumps(output))
