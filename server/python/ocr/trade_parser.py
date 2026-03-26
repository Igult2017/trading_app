"""
trade_parser.py  (v8 — timeframe removed)
──────────────────────────────────────────
Pure text parsing: converts raw OCR lines into structured trade fields.
Timeframe is intentionally NOT extracted — it is a user-entered field.

Public API
----------
  parse_all(ocr_result) -> ParsedTradeData
  calc_sl_tp_prices(...)
  find_price_in_tokens(...)
"""

from dataclasses import dataclass
from typing import Optional, List
import re
from datetime import datetime, date, timedelta
import calendar as _cal


# ── Result ────────────────────────────────────────────────────────────────────

@dataclass
class ParsedTradeData:
    instrument:       Optional[str]   = None
    # timeframe intentionally omitted
    direction:        Optional[str]   = None
    entry_price_str:  Optional[str]   = None
    sl_pts:           Optional[float] = None
    sl_usd:           Optional[float] = None
    tp_pts:           Optional[float] = None
    tp_usd:           Optional[float] = None
    lot_size:         Optional[float] = None
    units:            Optional[int]   = None
    contract_size:    Optional[float] = None
    open_pl_points:   Optional[float] = None
    open_pl_usd:      Optional[float] = None
    closed_pl_points: Optional[float] = None
    closed_pl_usd:    Optional[float] = None
    drawdown_pts:     Optional[float] = None
    drawdown_usd:     Optional[float] = None
    run_up_pts:       Optional[float] = None
    run_up_usd:       Optional[float] = None
    risk_reward:      Optional[float] = None
    entry_time:       Optional[str]   = None
    exit_time:        Optional[str]   = None
    day_of_week:      Optional[str]   = None
    session_name:     Optional[str]   = None
    session_phase:    Optional[str]   = None
    trade_duration:   Optional[str]   = None
    pair_category:    Optional[str]   = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _f(s) -> Optional[float]:
    try:
        return float(str(s).replace(',', '.').replace("'", ""))
    except Exception:
        return None


def _clean_ocr(text: str) -> str:
    """Fix common OCR substitutions seen on JForex dark-theme screenshots."""
    # Digit substitutions
    text = re.sub(r'(?<=[0-9 ])C(?=[0-9])', '0', text)
    text = re.sub(r'(?<=[0-9])\]',           '1', text)
    text = re.sub(r'(?<=[0-9])O(?=[0-9])',   '0', text)
    text = re.sub(r'(?<=[0-9])I(?=[0-9])',   '1', text)
    # JForex label OCR misreads — comprehensive patterns from all observed screenshots
    # Risk/Reward: covers H→R, é accent, f/i/e noise chars, 'erd' suffix, H prefix
    text = re.sub(r'[RH]isk.{0,2}/?[Rr]ew[ae]r[d]', 'Risk/Reward', text, flags=re.IGNORECASE)
    # Run-Up variants: BRun, Bun, Run-Lio, Rur
    text = re.sub(r'[BR]?un-?Up|Run-?[UL]io|Bun-?Up|BRun-?Up|Rur-?Up',
                  'Run-Up', text, flags=re.IGNORECASE)
    # P/L variants
    text = re.sub(r'PrL\b|Prl\b|Prk\b|Open\s+P[Aa]L\b', 'P/L', text, flags=re.IGNORECASE)
    text = re.sub(r'P/[.]', 'P/L', text, flags=re.IGNORECASE)
    text = re.sub(r'Gpen\s+[FP][rR]?[lL]|Open\s+[FP][lr]\b|Open\s+P[.,][lL]\b|Closed\s+Prk\b', 'Open P/L', text, flags=re.IGNORECASE)
    # Unit separators: 1'000 or 1/000 → 1000 (thousands only, not decimals)
    text = re.sub(r"(\d)['\/](\d{3})\b", r'\1\2', text)
    # Currency misreads
    text = re.sub(r'\bUSO\b|\bSUS0\b|\bU50\b', 'USD', text, flags=re.IGNORECASE)
    # Units OCR misreads: e100/e1000 = 1'000, VOD/VOO/OOO = 1000
    text = re.sub(r'\be1[0O][0O]0?\b', '1000', text)
    text = re.sub(r'\b[VU][O0][O0D]\b', '1000', text, flags=re.IGNORECASE)
    # Open P/L label misreads: 'PA' → 'P/L'
    text = re.sub(r'\bOpen\s+PA\.', 'Open P/L', text, flags=re.IGNORECASE)
    # Comma-space noise in numbers: '0, 72' → '0.72'
    text = re.sub(r'(\d),\s+(\d)', r'\1.\2', text)
    # Slash misread as 'f': 'f USD' → '/ USD'
    text = re.sub(r'\bf\s+USD\b', '/ USD', text, flags=re.IGNORECASE)
    # Comma noise inside numbers: '-3,.25' → '-3.25'
    text = re.sub(r'(\d),\.?(\d)', r'\1.\2', text)
    # Restore dropped decimal in TP/SL values: 'TP 1725 points' → 'TP 172.5 points'
    text = re.sub(r'\b(TP|SL)\s+(\d{2,5})(\d)\s+points',
                  lambda m: f"{m.group(1)} {m.group(2)}.{m.group(3)} points",
                  text, flags=re.IGNORECASE)
    # Also restore decimals in Closed/Open P/L large values
    text = re.sub(r'(Closed|Open)\s*P/L\s*(\d{2,5})(\d)\s*points',
                  lambda m: f"{m.group(1)} P/L {m.group(2)}.{m.group(3)} points",
                  text, flags=re.IGNORECASE)
    # Restore decimal in TP/SL point values: 'TP 1725 points' → 'TP 172.5 points'
    text = re.sub(r'\b(TP|SL)\s+(\d{2,4})(\d)\s+points',
                  lambda m: f"{m.group(1)} {m.group(2)}.{m.group(3)} points",
                  text, flags=re.IGNORECASE)
    return text

def _is_index(instrument: Optional[str]) -> bool:
    sym = (instrument or "").upper()
    return any(x in sym for x in
               ['IDX','US30','NAS','SPX','DAX','FTSE','CAC','DOW','USA500',
                'USTEC','US500','US2000','GER','UK100','JP225','AUS200','HK50',
                'STOXX','EUSTX','VIX','UKOIL','USOIL'])


# ── Instrument name OCR pre-cleaning ──────────────────────────────────────────

def _clean_instrument_ocr(text: str) -> str:
    """Fix OCR errors specific to instrument name tokens."""
    # USA500 variants: O/0 confusion, S→5
    text = re.sub(r'\bUSA\s*5[O0]{2}', 'USA500', text, flags=re.IGNORECASE)
    text = re.sub(r'\bUSAS\s*[O0]{2}', 'USA500', text, flags=re.IGNORECASE)
    text = re.sub(r'\bUSA\s*S[O0]{2}', 'USA500', text, flags=re.IGNORECASE)
    # Restore period before IDX when dropped or swapped for comma/space
    text = re.sub(r'(USA500|US30|NAS100|SPX500|GER40|UK100|JP225|AUS200|HK50)'
                  r'[\s,_]+(IDX)', r'\1.\2', text, flags=re.IGNORECASE)
    # NAS100 variants
    text = re.sub(r'\bNAS\s*1[O0]{2}', 'NAS100', text, flags=re.IGNORECASE)
    # US30 variants: 3O → 30
    text = re.sub(r'\bUS\s*3[O0]\b', 'US30', text, flags=re.IGNORECASE)
    # DAX40 variants
    text = re.sub(r'\bDAX\s*4[O0]\b', 'DAX40', text, flags=re.IGNORECASE)
    text = re.sub(r'\bGER\s*4[O0]\b', 'GER40', text, flags=re.IGNORECASE)
    # Remove stray spaces inside symbols
    text = re.sub(r'\b([A-Z]{2,6})\s+([0-9]{2,4})', r'\1\2', text)
    return text


def _normalize_instrument(raw: str) -> str:
    """Map common aliases to a canonical instrument name."""
    aliases = {
        'NASDAQ': 'NAS100', 'NDX': 'NAS100', 'USTEC': 'NAS100',
        'SP500': 'SPX500',  'SPX': 'SPX500',  'US500': 'SPX500',
        'DOW30': 'US30',    'DJI': 'US30',    'DOW': 'US30',
        'GER30': 'DAX40',   'DAX': 'DAX40',
        'FTSE100': 'UK100', 'FTSE': 'UK100',
        'NIKKEI': 'JP225',  'NKY': 'JP225',
        'ASX200': 'AUS200',
        'HSI': 'HK50',
        'FRA40': 'CAC40',   'CAC': 'CAC40',
        'STOXX50': 'EUSTX50',
        'WTI': 'XTIUSD',    'USOIL': 'XTIUSD',
        'BRENT': 'XBRUSD',  'UKOIL': 'XBRUSD',
        'NATGAS': 'XNGUSD', 'NGAS': 'XNGUSD', 'NATURALGAS': 'XNGUSD',
    }
    return aliases.get(raw, raw)


# ── Instrument parsing ────────────────────────────────────────────────────────

def _parse_instrument(lines: List[str], tokens: List[dict]) -> Optional[str]:
    # Priority: title-bar tokens (top of screen), then all lines, then all tokens
    top_tokens = [t["text"] for t in tokens if t.get("y", 9999) < 120]
    all_tokens = [t["text"] for t in tokens]
    # Deduplicate while preserving priority order
    seen: set = set()
    candidates: List[str] = []
    for t in lines + top_tokens + all_tokens:
        if t not in seen:
            seen.add(t)
            candidates.append(t)

    for line in candidates:
        cl = _clean_instrument_ocr(line)

        # 1. USA500.IDX and similar index.IDX format (most specific first)
        m = re.search(
            r'\b(USA\s*5[O0]{2}[\s.,_]?IDX'
            r'|[A-Z]{2,8}[\s.,_]IDX)\b',
            cl, re.IGNORECASE)
        if m:
            raw = re.sub(r'\s+', '', m.group(1)).upper()
            raw = re.sub(r'[,_]IDX', '.IDX', raw)
            raw = _normalize_instrument(raw)
            return raw

        # 2. Standard forex pair (EUR/USD, GBPUSD, USD/JPY, etc.)
        m = re.search(
            r'\b((?:EUR|GBP|AUD|NZD|CAD|CHF|JPY|XAU|XAG|BTC|ETH|BNB|USD|XRP|SOL|ADA)'
            r'[/\\]?(?:EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY|XAU|XAG|BTC|ETH|BNB|USDT?))\b',
            cl, re.IGNORECASE)
        if m:
            raw = m.group(1).upper().replace('\\', '/')
            return raw

        # 3. US / global equity indices
        m = re.search(
            r'\b(USA500|US30|US500|US2000|USTEC'
            r'|NAS100|NASDAQ|NDX'
            r'|SPX500?|SP500'
            r'|DOW30?|DJI'
            r'|DAX40?|GER40?|GER30'
            r'|FTSE100?|UK100'
            r'|JP225|NKY|NIKKEI'
            r'|AUS200|ASX200'
            r'|HK50|HSI'
            r'|CAC40?|FRA40'
            r'|EUSTX50|STOXX50'
            r'|VIX|VSTOXX'
            r')\b',
            cl, re.IGNORECASE)
        if m:
            raw = _normalize_instrument(m.group(1).upper())
            return raw

        # 4. Metals, energy commodities
        m = re.search(
            r'\b(XAUUSD|XAGUSD|XPTUSD|XPDUSD'
            r'|XBRUSD|XTIUSD|XNGUSD'
            r'|USOIL|UKOIL|WTI|BRENT|OIL'
            r'|GOLD|SILVER|COPPER'
            r'|NATGAS|NGAS|NATURALGAS)\b',
            cl, re.IGNORECASE)
        if m:
            raw = _normalize_instrument(m.group(1).upper())
            return raw

        # 5. Crypto pairs (BTC/USDT, ETHUSD, etc.)
        m = re.search(
            r'\b(BTC/?USD[T]?|ETH/?USD[T]?|BNB/?USD[T]?'
            r'|XRP/?USD[T]?|SOL/?USD[T]?|ADA/?USD[T]?'
            r'|DOT/?USD[T]?|LTC/?USD[T]?|DOGE/?USD[T]?'
            r'|MATIC/?USD[T]?|LINK/?USD[T]?|AVAX/?USD[T]?'
            r'|ATOM/?USD[T]?|UNI/?USD[T]?)\b',
            cl, re.IGNORECASE)
        if m:
            raw = m.group(1).upper()
            return raw

    return None


# ── SL / TP distance parsing ──────────────────────────────────────────────────

def _parse_tp_sl(lines: List[str],
                  instrument: Optional[str]) -> tuple:
    """
    Matches patterns like:
      TP 274.3 points USD 27.43
      SL -51.1 points USD -5.11
      TP 167.4 points: USD 21.43
    """
    sl_pts = sl_usd = tp_pts = tp_usd = None
    is_idx = _is_index(instrument)
    joined = " ".join(lines)
    cleaned = _clean_ocr(joined)

    # Pattern: (TP|SL) <number> points[...] USD <number>
    # Non-greedy .*? handles "points: USD", "points / USD", "points.USD" etc.
    for m in re.finditer(
        r'\b(TP|SL)\b[^a-zA-Z]*?([+-]?\d+[\.,]?\d*)\s*points?.*?USD\s*([+-]?\d+[\.,]?\d*)',
        cleaned, re.IGNORECASE
    ):
        tag = m.group(1).upper()
        pts = _f(m.group(2))
        usd = _f(m.group(3))
        if tag == "SL":
            sl_pts = abs(pts) if pts is not None else None
            sl_usd = usd
        elif tag == "TP":
            tp_pts = abs(pts) if pts is not None else None
            tp_usd = usd

    return sl_pts, sl_usd, tp_pts, tp_usd


# ── Trade info (info panel) ───────────────────────────────────────────────────

_VALID_UNITS = [100, 1000, 2000, 3000, 5000, 10000, 20000, 50000,
                100000, 200000, 500000, 1000000, 10000000]


def _parse_trade_info(lines: List[str]) -> dict:
    result  = {}
    joined  = " ".join(lines)
    cleaned = _clean_ocr(joined)

    # ── Units / lot size ──────────────────────────────────────────────
    # _clean_ocr already normalises 1'000 and 1/000 to 1000
    m = re.search(r"(\d[\d,]*?)\s*units", cleaned, re.IGNORECASE)
    if m:
        raw = m.group(1).replace(',', '')
        u   = _f(raw)
        if u and u > 0:
            closest = min(_VALID_UNITS, key=lambda x: abs(x - u))
            ratio   = u / closest if closest > 0 else 999
            result['lot_size'] = round(
                closest / 100000 if 0.8 <= ratio <= 1.2 else u / 100000, 5)
            result['units']    = int(
                closest if 0.8 <= ratio <= 1.2 else u)

    if 'lot_size' not in result:
        m = re.search(r'\b([0-9]+[.,][0-9]+)\s*contract', cleaned, re.IGNORECASE)
        if not m:
            m = re.search(r'\b(0\.[0-9]+)\s*contract', cleaned, re.IGNORECASE)
        if m:
            val = _f(m.group(1))
            if val and val < 10:
                result['lot_size'] = result['contract_size'] = val

    # ── Open P/L (stored for reference, NEVER used for outcome) ──────
    # Tight 30-char window prevents cross-line contamination with Run-Up USD value
    m = re.search(
        r'Open\s*P/L\s*([+-]?\d+[.,]?\d*)\s*points?.{0,20}?USD\s*([+-]?\d+[.,]?\d*)',
        cleaned, re.IGNORECASE)
    if m:
        result['open_pl_points'] = _f(m.group(1))
        result['open_pl_usd']    = _f(m.group(2))

    # ── Closed P/L (authoritative for outcome) ────────────────────────
    m = re.search(
        r'Closed\s*P/L\s*([+-]?\d+[.,]?\d*)\s*points?.{0,30}?USD\s*([+-]?\d+[.,]?\d*)',
        cleaned, re.IGNORECASE)
    if m:
        result['closed_pl_points'] = _f(m.group(1))
        result['closed_pl_usd']    = _f(m.group(2))

    # ── Drawdown (MAE) — always stored as positive points ─────────────
    m = re.search(
        r'Drawdown\s*([+-]?\d+[.,]?\d*)\s*points?.{0,30}?USD\s*([+-]?\d+[.,]?\d*)',
        cleaned, re.IGNORECASE)
    if m:
        result['drawdown_pts'] = abs(_f(m.group(1)) or 0)
        result['drawdown_usd'] = _f(m.group(2))

    # ── Run-Up (MFE) ─────────────────────────────────────────────────
    m = re.search(
        r'Run-?Up\s*([+-]?\d+[.,]?\d*)\s*points?.{0,30}?USD\s*([+-]?\d+[.,]?\d*)',
        cleaned, re.IGNORECASE)
    if m:
        result['run_up_pts'] = _f(m.group(1))
        result['run_up_usd'] = _f(m.group(2))

    # ── Risk/Reward ───────────────────────────────────────────────────
    # Allow truncated decimal (e.g. "5.") and filter OCR noise prefix
    m = re.search(r'Risk/?Reward\s*([0-9]+[.,][0-9]*)', cleaned, re.IGNORECASE)
    if m:
        rr_raw = m.group(1).rstrip('.,').replace(',', '.')
        try:
            rr = float(rr_raw)
            if rr > 15 and len(rr_raw) > 1:   # implausible — strip leading OCR noise digit
                rr2_str = rr_raw[1:].lstrip('.')
                try:
                    rr2 = float(rr2_str)
                    rr = rr2 if 0.1 <= rr2 <= 15 else None
                except Exception:
                    rr = None
            if rr is not None and 0.1 <= rr <= 15:
                result['risk_reward'] = round(rr, 2)
        except Exception:
            pass

    return result


# ── Datetime / session ────────────────────────────────────────────────────────

def _last_sun(y: int, m: int) -> date:
    last = _cal.monthrange(y, m)[1]
    d    = date(y, m, last)
    return d - timedelta(days=(d.weekday() + 1) % 7)


def _nth_sun(y: int, m: int, n: int) -> date:
    first = date(y, m, 1)
    off   = (6 - first.weekday()) % 7
    return date(y, m, 1 + off + (n - 1) * 7)


def _session_phase(h_utc: int, ref_date=None):
    if ref_date is not None:
        d    = ref_date.date() if hasattr(ref_date, 'date') else ref_date
        year = d.year
        uk_bst  = _last_sun(year, 3)  <= d < _last_sun(year, 10)
        us_edt  = _nth_sun(year, 3, 2) <= d < _nth_sun(year, 11, 1)
        lo = 7 if uk_bst  else 8
        ny = 13 if us_edt else 14
    else:
        lo, ny = 8, 14

    lc = lo + 9; nc = ny + 8; h = h_utc

    if lo <= h < lc and ny <= h < nc: return "London/New York", "Overlap"
    if 0  <= h < 9  and lo <= h < lc: return "Tokyo/London",   "Overlap"
    if lo <= h < lc:
        into  = h - lo
        phase = "Open" if into < 2 else "Close" if into >= lc - lo - 2 else "Mid"
        return "London", phase
    if ny <= h < nc:
        into  = h - ny
        phase = "Open" if into < 2 else "Close" if into >= nc - ny - 2 else "Mid"
        return "New York", phase
    if 0 <= h < 9:
        return "Tokyo", ("Open" if h < 2 else "Close" if h >= 7 else "Mid")
    if h >= 22 or h < 6:
        return "Sydney", "—"
    return "Dead Zone", "—"



def _parse_xaxis_timestamps(lines: List[str]) -> list:
    """
    Extract x-axis chart timestamps, sorted.

    Handles two label formats:
      1. Full:    "Mon 02 Mar'26 03:00"  → full datetime
      2. Partial: "10:00" or "12:00"     → time-only, anchored to nearest
                                           preceding full date label

    Partial time-only labels are paired with the last seen date so that
    a chart showing "Mon 02 Mar'26 03:00 … 10:00 … 12:00" produces three
    correct datetimes on the same day rather than losing the time-only ones.
    """
    joined = " ".join(lines)
    joined = re.sub(r'\bGec\b', 'Dec', joined, flags=re.IGNORECASE)
    joined = re.sub(r'\bj?Jan\b', 'Jan', joined, flags=re.IGNORECASE)
    joined = re.sub(r'\bOF\b', '05', joined)

    full_pat = re.compile(
        r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s*"
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'?(\d{2})"
        r"(?:\s+(\d{2})[:.h](\d{2}))?",
        re.IGNORECASE)
    time_pat = re.compile(r'\b(\d{2})[:.h](\d{2})\b')

    results = []
    last_date = None   # (year, month, day) from most recent full label

    pos = 0
    text = joined
    while pos < len(text):
        fm = full_pat.search(text, pos)
        tm = time_pat.search(text, pos)

        if fm is None and tm is None:
            break
        use_full = (fm is not None and (tm is None or fm.start() <= tm.start()))

        if use_full:
            m = fm
            try:
                mon  = _MONTHS[m.group(3).lower()[:3]]
                year = 2000 + int(m.group(4))
                day  = int(m.group(2))
                hh   = int(m.group(5)) if m.group(5) else 0
                mm   = int(m.group(6)) if m.group(6) else 0
                last_date = (year, mon, day)
                results.append(datetime(year, mon, day, hh, mm))
            except Exception:
                pass
            pos = m.end()
        else:
            m = tm
            if last_date:
                try:
                    hh = int(m.group(1))
                    mm = int(m.group(2))
                    if 0 <= hh <= 23 and 0 <= mm <= 59:
                        year, mon, day = last_date
                        t = datetime(year, mon, day, hh, mm)
                        # If this time is earlier than or equal to the previous
                        # timestamp on the same date, it has wrapped to next day
                        if results and t.date() == results[-1].date() and t <= results[-1]:
                            t += timedelta(days=1)
                            last_date = (t.year, t.month, t.day)
                        results.append(t)
                except Exception:
                    pass
            pos = m.end()

    return sorted(set(results))


def _interpolate_entry_time(timestamps: list,
                             entry_x: Optional[int],
                             chart_x1: int,
                             chart_x2: int) -> Optional[str]:
    """Estimate entry time by linear interpolation of x-axis chart labels."""
    from datetime import timedelta
    if not timestamps or entry_x is None:
        return None
    chart_w = max(1, chart_x2 - chart_x1)
    rel_x   = max(0.0, min(1.0, (entry_x - chart_x1) / chart_w))
    n       = len(timestamps)
    if n == 1:
        return timestamps[0].strftime('%Y-%m-%d %H:%M')
    seg   = rel_x * (n - 1)
    idx   = min(int(seg), n - 2)
    frac  = seg - idx
    delta = (timestamps[idx + 1] - timestamps[idx]).total_seconds()
    t_est = timestamps[idx] + timedelta(seconds=delta * frac)
    return t_est.strftime('%Y-%m-%d %H:%M')


def _parse_datetimes(lines: List[str],
                     xaxis_lines: Optional[List[str]] = None,
                     entry_x: Optional[int] = None,
                     chart_x1: int = 0,
                     chart_x2: int = 9999) -> tuple:
    joined  = " ".join(lines)
    cleaned = _clean_ocr(joined)
    entry_dt = exit_dt = dow = None

    # ── Exit: ISO date from replay bar ("Last processed tick: YYYY-MM-DD HH:MM:SS")
    m = re.search(r'(\d{4}-\d{2}-\d{2})\s+(\d{2}[:.]\d{2})',
                   joined, re.IGNORECASE)
    if m:
        hh = int(m.group(2)[:2])
        if 0 <= hh <= 23:
            try:
                ts   = m.group(2).replace('.', ':')[:5]
                dt   = datetime.strptime(f"{m.group(1)} {ts}", '%Y-%m-%d %H:%M')
                exit_dt = dt.isoformat(sep=' ', timespec='minutes')
            except Exception:
                exit_dt = m.group(1)

    # ── Exit: TradingView closing annotation "on DD Mon'YY HH:MM" ─────
    if not exit_dt:
        mc = re.search(
            r'\bon\s+(\d{1,2})\s+'
            r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\'?(\d{2})'
            r'\s+(\d{2}):(\d{2})',
            cleaned, re.IGNORECASE)
        if mc:
            try:
                dt = datetime(2000 + int(mc.group(3)),
                              _MONTHS[mc.group(2).lower()[:3]],
                              int(mc.group(1)),
                              int(mc.group(4)), int(mc.group(5)))
                exit_dt = dt.isoformat(sep=' ', timespec='minutes')
            except Exception:
                pass

    # ── Entry: cTrader/JForex format "Mon 14 Jan'25 08:00" ────────────
    ms = list(re.finditer(
        r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s*"
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'?(\d{2})\s+(\d{2}):(\d{2})",
        cleaned, re.IGNORECASE))
    if ms:
        gp = ms[0].groups()
        try:
            dt = datetime(2000 + int(gp[3]), _MONTHS[gp[2].lower()],
                          int(gp[1]), int(gp[4]), int(gp[5]))
            entry_dt = dt.isoformat(sep=' ', timespec='minutes')
            dow      = dt.strftime('%A')
        except Exception:
            pass

    # Date-only fallback
    if not entry_dt:
        ms2 = list(re.finditer(
            r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+"
            r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'?(\d{2})\b",
            cleaned, re.IGNORECASE))
        if ms2:
            gp = ms2[0].groups()
            try:
                dt = datetime(2000 + int(gp[3]), _MONTHS[gp[2].lower()], int(gp[1]))
                entry_dt = dt.strftime('%Y-%m-%d')
                dow      = dt.strftime('%A')
            except Exception:
                pass

    # X-axis interpolation fallback (when entry arrow position is known)
    if not entry_dt and xaxis_lines:
        all_for_xaxis = lines + xaxis_lines
        timestamps = _parse_xaxis_timestamps(all_for_xaxis)
        entry_dt = _interpolate_entry_time(timestamps, entry_x, chart_x1, chart_x2)
        if entry_dt:
            try:
                dow = datetime.strptime(entry_dt, '%Y-%m-%d %H:%M').strftime('%A')
            except Exception:
                pass

    if not dow and exit_dt:
        try:
            dow = datetime.fromisoformat(exit_dt).strftime('%A')
        except Exception:
            pass

    session = session_ph = None
    ref_str = entry_dt or exit_dt
    if ref_str and (' ' in ref_str or 'T' in ref_str):
        try:
            t = datetime.fromisoformat(ref_str)
            session, session_ph = _session_phase(t.hour, ref_date=t)
        except Exception:
            pass

    return entry_dt, exit_dt, dow, session, session_ph


def _trade_duration(entry_str, exit_str) -> Optional[str]:
    if not entry_str or not exit_str:
        return None
    fmts = ["%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M",
            "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"]
    def _p(s):
        for fmt in fmts:
            try: return datetime.strptime(str(s)[:len(fmt)], fmt)
            except ValueError: continue
        return None
    e = _p(entry_str); x = _p(exit_str)
    if not e or not x: return None
    delta = abs(x - e)
    tm = int(delta.total_seconds() // 60)
    th = int(delta.total_seconds() // 3600)
    d  = delta.days
    rh = int((delta.total_seconds() % 86400) // 3600)
    rm = int((delta.total_seconds() % 3600)  // 60)
    if tm < 60:  return f"{tm}m"
    if th < 24:  return f"{th}h" if rm == 0 else f"{th}h {rm}m"
    return f"{d}d" if rh == 0 else f"{d}d {rh}h"


# ── Pair category ─────────────────────────────────────────────────────────────

def _pair_category(instrument: Optional[str]) -> Optional[str]:
    if not instrument: return None
    sym = instrument.upper().replace('/','').replace('\\','').replace('.','')
    if any(x in sym for x in ['BTC','ETH','BNB','XRP','SOL','USDT']): return "Crypto"
    if any(x in sym for x in ['XAU','XAG','GOLD','SILVER','OIL','WTI']): return "Commodity"
    if any(x in sym for x in
           ['IDX','US30','NAS','SPX','DAX','FTSE','CAC','DOW','USA500']): return "Index"
    if sym in {'EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD'}:
        return "Major"
    if sym in {'EURGBP','EURJPY','GBPJPY','AUDJPY','CADJPY','CHFJPY',
               'EURAUD','EURCHF','GBPAUD','GBPCAD','AUDCAD','AUDCHF','AUDNZD'}:
        return "Minor"
    if len(sym) == 6 and sym.isalpha(): return "Exotic"
    return None


# ── SL / TP price calculation ─────────────────────────────────────────────────

def _instrument_specs(instrument: Optional[str]):
    sym = (instrument or "").upper()
    if any(x in sym for x in
           ['IDX','US30','NAS','SPX','DAX','CAC','FTSE','DOW','USA500']):
        return 1.0, 1.0, 1.0, 1
    if 'JPY' in sym:   return 0.001, 0.01, 0.1, 3
    if 'XAU' in sym or 'GOLD'   in sym: return 0.01, 0.1, 0.1, 2
    if 'XAG' in sym or 'SILVER' in sym: return 0.001, 0.01, 0.1, 3
    return 0.00001, 0.0001, 0.1, 5


def calc_sl_tp_prices(entry_price_str, direction, sl_pts, tp_pts,
                       rr, instrument):
    ep = _f(entry_price_str)
    if ep is None:
        return None, None, None, None, tp_pts, False
    ps, pip_s, p2p, dec = _instrument_specs(instrument)
    long = (direction or "Long").lower() == "long"

    sl_price = sl_pips = None
    if sl_pts is not None:
        sl_price = round(ep - sl_pts*ps if long else ep + sl_pts*ps, dec)
        sl_pips  = round(sl_pts * p2p, 1)

    tp_from_rr  = False
    tp_pts_used = tp_pts
    if tp_pts_used is None and sl_pts is not None and rr is not None:
        tp_pts_used = round(sl_pts * rr, 1)
        tp_from_rr  = True

    tp_price = tp_pips = None
    if tp_pts_used is not None:
        tp_price = round(ep + tp_pts_used*ps if long else ep - tp_pts_used*ps, dec)
        tp_pips  = round(tp_pts_used * p2p, 1)

    return sl_price, sl_pips, tp_price, tp_pips, tp_pts_used, tp_from_rr


def find_price_in_tokens(tokens: List[dict],
                          chart_top_frac: float,
                          chart_bottom_frac: float,
                          img_height: int) -> Optional[str]:
    chart_top    = int(img_height * chart_top_frac)
    chart_bottom = int(img_height * chart_bottom_frac)
    for tok in tokens:
        y, t = tok.get("y", 0), tok.get("text", "")
        if chart_top < y < chart_bottom:
            clean = t.replace(',', '.')
            if re.match(r'^\d{1,4}\.\d{4,6}$', clean):
                return clean
    return None


# ── Public API ────────────────────────────────────────────────────────────────

def parse_all(ocr_result) -> ParsedTradeData:
    all_lines = ocr_result.all_lines
    tokens    = ocr_result.psm11_tokens

    instrument = _parse_instrument(all_lines, tokens)
    sl_pts, sl_usd, tp_pts, tp_usd = _parse_tp_sl(all_lines, instrument)
    info = _parse_trade_info(all_lines)
    entry_dt, exit_dt, dow, session, session_ph = _parse_datetimes(all_lines)
    duration = _trade_duration(entry_dt, exit_dt)

    return ParsedTradeData(
        instrument       = instrument,
        sl_pts           = sl_pts,
        sl_usd           = sl_usd,
        tp_pts           = tp_pts,
        tp_usd           = tp_usd,
        lot_size         = info.get("lot_size"),
        units            = info.get("units"),
        contract_size    = info.get("contract_size"),
        open_pl_points   = info.get("open_pl_points"),
        open_pl_usd      = info.get("open_pl_usd"),
        closed_pl_points = info.get("closed_pl_points"),
        closed_pl_usd    = info.get("closed_pl_usd"),
        drawdown_pts     = info.get("drawdown_pts"),
        drawdown_usd     = info.get("drawdown_usd"),
        run_up_pts       = info.get("run_up_pts"),
        run_up_usd       = info.get("run_up_usd"),
        risk_reward      = info.get("risk_reward"),
        entry_time       = entry_dt,
        exit_time        = exit_dt,
        day_of_week      = dow,
        session_name     = session,
        session_phase    = session_ph,
        trade_duration   = duration,
        pair_category    = _pair_category(instrument),
    )
