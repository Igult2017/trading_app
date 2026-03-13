#!/usr/bin/env python3
"""
Trading Screenshot OCR Analyzer v6
Optimized for cTrader Replay-mode dark-theme screenshots.

TWO-SCREENSHOT WORKFLOW
  Screenshot 1 (setup)   → entryPrice, SL distance, direction, RR, entryTime
  Screenshot 2 (outcome) → exitTime, Closed P/L, outcome (Win/Loss/BE)
                           The achieved RR on outcome screenshot overwrites setup RR.

FIELD EXTRACTION SUMMARY (verified on real screenshots)
  ✅ instrument     — top bar OCR or PSM-11 tab token
  ✅ pairCategory   — inferred from symbol
  ✅ timeframe      — "4 Hours" in top bar, or "H4" tab token
  ✅ direction      — green vs red color dominance in chart panel
  ✅ entryPrice     — (a) yellow arrow-label bar OCR, or (b) PSM-11 sparse price token
  ✅ stopLossPoints — from "SL -33.3 points" text on green trade band
  ✅ stopLossPips   — stopLossPoints ÷ 10  (for forex; direct for indices)
  ✅ stopLoss       — calculated: entry ± (stopLossPoints × point_size)
  ✅ takeProfitPts  — from "TP 167.4 points" text (SKIPPED for index absolute prices)
  ✅ takeProfitPips — takeProfitPoints ÷ 10
  ✅ takeProfit     — calculated from TP distance, or entry ± (SL × RR) if no explicit TP
  ✅ lotSize        — "1'000 units" → /100000; "0.1 contract" for indices
  ✅ openPLPoints   — from "Open/Closed P/L X.X points"
  ✅ openPLUSD      — from "Open/Closed P/L ... USD X.XX"
  ✅ outcome        — inferred from P/L sign
  ✅ riskReward     — from "Risk/Reward X.XX"
  ✅ runUpPoints/USD — from "Run-Up" line (MFE)
  ✅ drawdownPoints/USD — from "Drawdown" line (MAE)
  ✅ entryTime      — highlighted date on bottom timeline bar
  ✅ exitTime       — "Last processed tick: YYYY-MM-DD HH:MM" (outcome screenshot)
  ✅ tradeDuration  — calculated from entryTime and exitTime when both are present
  ✅ dayOfWeek      — derived from entryTime
  ✅ sessionName    — derived from entryTime (UTC)

POINTS → PIPS CONVERSION
  Forex 5-decimal (EURUSD, GBPUSD, USDCHF …): 10 points = 1 pip
  Forex JPY pairs (USDJPY, GBPJPY …):          10 points = 1 pip  (point=0.001)
  Indices (USA500.IDX, US30 …):                 1 point  = 1 index point (no pips)
  Gold (XAUUSD):                                10 points = 1 pip  (point=0.01)

Accepts: base64-encoded image via stdin
Outputs: JSON to stdout
"""

import sys, json, base64, re, traceback
from datetime import datetime, date, timedelta
from collections import Counter

try:
    import numpy as np
    import cv2
    import pytesseract
    import scipy.ndimage as nd
except ImportError as e:
    print(json.dumps({"success": False, "error": f"Missing dependency: {e}"}))
    sys.exit(1)


# ─────────────────────────────────────────────
# IMAGE LOADING
# ─────────────────────────────────────────────

def load_image_from_b64(b64_str):
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    b64_str = b64_str.strip()
    b64_str += "=" * ((4 - len(b64_str) % 4) % 4)
    data = base64.b64decode(b64_str)
    arr  = np.frombuffer(data, np.uint8)
    img  = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img


# ─────────────────────────────────────────────
# CORE OCR PRIMITIVES
# ─────────────────────────────────────────────

def ocr_strip_white(img, y1, y2, scale=4, psm=6):
    """
    Standard invert-and-threshold OCR for WHITE text on DARK background.
    Used for: top bar, TP/SL labels, trade info band, bottom date bar.
    """
    h, w = img.shape[:2]
    y1, y2 = max(0, y1), min(h, y2)
    if y2 <= y1:
        return ""
    strip  = img[y1:y2, :]
    sh, sw = strip.shape[:2]
    if sh < 2 or sw < 2:
        return ""
    sc     = cv2.resize(strip, (sw * scale, sh * scale), interpolation=cv2.INTER_CUBIC)
    gray   = cv2.cvtColor(sc, cv2.COLOR_BGR2GRAY)
    inv    = cv2.bitwise_not(gray)
    _, thr = cv2.threshold(inv, 90, 255, cv2.THRESH_BINARY)
    return pytesseract.image_to_string(thr, config=f"--psm {psm} --oem 3").strip()


def ocr_strip_dark_text(img, y1, y2, x2_pct=0.75, scale=3):
    """
    OCR for DARK text on a LIGHT/OVERLAY background.
    Used for: 'Last processed tick' replay bar at image bottom.
    """
    h, w = img.shape[:2]
    y1, y2 = max(0, y1), min(h, y2)
    if y2 <= y1:
        return ""
    strip  = img[y1:y2, 0:int(w * x2_pct)]
    sh, sw = strip.shape[:2]
    if sh < 2 or sw < 2:
        return ""
    sc     = cv2.resize(strip, (sw * scale, sh * scale), interpolation=cv2.INTER_CUBIC)
    gray   = cv2.cvtColor(sc, cv2.COLOR_BGR2GRAY)
    _, thr = cv2.threshold(gray, 80, 255, cv2.THRESH_BINARY_INV)
    return pytesseract.image_to_string(thr, config="--psm 6 --oem 3").strip()


def ocr_region_clahe(img, x1, y1, x2, y2, scale=8, psm=7):
    """CLAHE contrast enhancement for low-brightness regions."""
    h, w = img.shape[:2]
    x1, y1, x2, y2 = max(0,x1), max(0,y1), min(w,x2), min(h,y2)
    if x2 <= x1 or y2 <= y1:
        return ""
    region = img[y1:y2, x1:x2]
    sh, sw = region.shape[:2]
    if sh < 2 or sw < 2:
        return ""
    sc     = cv2.resize(region, (sw * scale, sh * scale), interpolation=cv2.INTER_CUBIC)
    gray   = cv2.cvtColor(sc, cv2.COLOR_BGR2GRAY)
    clahe  = cv2.createCLAHE(clipLimit=6.0, tileGridSize=(2, 2))
    enh    = clahe.apply(gray)
    _, thr = cv2.threshold(enh, 110, 255, cv2.THRESH_BINARY)
    return pytesseract.image_to_string(thr, config=f"--psm {psm} --oem 3").strip()


# ─────────────────────────────────────────────
# TEXT COLLECTION
# ─────────────────────────────────────────────

def collect_white_text_rows(img):
    """Find all rows with significant white text and OCR them."""
    gray       = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    white_rows = (gray > 175).sum(axis=1)
    has_text   = white_rows > 15
    labeled, n = nd.label(has_text)
    h          = img.shape[0]
    results    = []
    for i in range(1, n + 1):
        rows = np.where(labeled == i)[0]
        ys, ye = int(rows[0]), int(rows[-1])
        if ye - ys < 3:
            continue
        text = ocr_strip_white(img, ys - 3, ye + 3, scale=4, psm=6)
        if text and len(text) > 3 and re.search(r'[0-9a-zA-Z/]', text):
            results.append((ys, text))
    return results


def collect_green_band_text(img):
    """
    cTrader's trade info overlay has a green background band.
    Most reliably contains: units, P/L, Run-Up, Risk/Reward.
    """
    h, w = img.shape[:2]
    hsv  = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gmask = cv2.inRange(hsv, (45, 60, 60), (90, 255, 255))
    row_sums = gmask.sum(axis=1)
    gys = np.where(row_sums > 300)[0]
    if not len(gys):
        return ""
    return ocr_strip_white(img,
                           max(0, int(gys[0]) - 2),
                           min(h, int(gys[-1]) + 2),
                           scale=4, psm=6)


def psm11_scan(img):
    """
    PSM-11 sparse text scan on full image.
    Finds: instrument tab label ("GBP/USD"), floating price labels ("1.36244").
    """
    h, w = img.shape[:2]
    gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    sc    = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    enh   = clahe.apply(sc)
    _, thr = cv2.threshold(enh, 90, 255, cv2.THRESH_BINARY)
    data  = pytesseract.image_to_data(thr, config="--psm 11 --oem 3",
                                       output_type=pytesseract.Output.DICT)
    tokens = []
    for i, t in enumerate(data['text']):
        t = t.strip()
        if t:
            tokens.append({
                "text": t,
                "y":    data['top'][i] // 2,
                "x":    data['left'][i] // 2,
            })
    return tokens


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _f(s):
    try:
        return float(str(s).replace(',', '.').replace("'", ""))
    except Exception:
        return None


def _clean_digit_ocr(text):
    """Fix common digit OCR errors: C→0, ]→1, O→0 in numeric context."""
    text = re.sub(r'(?<=[0-9 ])C(?=[0-9])', '0', text)
    text = re.sub(r'(?<=[0-9])\]',           '1', text)
    text = re.sub(r'(?<=[0-9])O(?=[0-9])',   '0', text)
    text = re.sub(r'(?<=[0-9])I(?=[0-9])',   '1', text)
    return text


# ─────────────────────────────────────────────
# TRADE DURATION CALCULATOR
# ─────────────────────────────────────────────

def compute_trade_duration(entry_dt_str, exit_dt_str):
    """
    Calculates human-readable trade duration from entry and exit datetime strings.

    Both strings can be in any of these formats:
      "YYYY-MM-DD HH:MM"
      "YYYY-MM-DDTHH:MM"
      "YYYY-MM-DD"         (date only — duration will be in days)

    Returns a string in the most appropriate unit:
      < 60 minutes  → "Xm"           e.g. "45m"
      < 24 hours    → "Xh Ym"        e.g. "2h 30m"
      >= 24 hours   → "Xd Yh"        e.g. "3d 4h"
    Returns None if either string is missing or unparseable.
    """
    if not entry_dt_str or not exit_dt_str:
        return None

    fmt_candidates = [
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ]

    entry_dt = exit_dt = None
    for fmt in fmt_candidates:
        try:
            entry_dt = datetime.strptime(str(entry_dt_str)[:len(fmt)], fmt)
            break
        except ValueError:
            continue

    for fmt in fmt_candidates:
        try:
            exit_dt = datetime.strptime(str(exit_dt_str)[:len(fmt)], fmt)
            break
        except ValueError:
            continue

    if entry_dt is None or exit_dt is None:
        return None

    delta = exit_dt - entry_dt
    if delta.total_seconds() < 0:
        # exit before entry — likely a date-only entry_dt with a time-accurate exit_dt
        # treat as same-day, use absolute value
        delta = abs(delta)

    total_minutes = int(delta.total_seconds() // 60)
    total_hours   = int(delta.total_seconds() // 3600)
    days          = delta.days
    remaining_hrs = int((delta.total_seconds() % 86400) // 3600)
    remaining_min = int((delta.total_seconds() % 3600)  // 60)

    if total_minutes < 60:
        return f"{total_minutes}m"
    elif total_hours < 24:
        if remaining_min == 0:
            return f"{total_hours}h"
        return f"{total_hours}h {remaining_min}m"
    else:
        if remaining_hrs == 0:
            return f"{days}d"
        return f"{days}d {remaining_hrs}h"


# ─────────────────────────────────────────────
# DIRECTION
# ─────────────────────────────────────────────

def detect_direction(img):
    """
    Green color dominance in right half of image → Long (buy).
    Red color dominance → Short (sell).
    cTrader uses green for buy orders and red for sell orders.
    """
    h, w  = img.shape[:2]
    panel = img[:, w // 2:, :]
    hsv   = cv2.cvtColor(panel, cv2.COLOR_BGR2HSV)
    green = cv2.inRange(hsv, (45, 80, 80),  (90, 255, 255))
    red1  = cv2.inRange(hsv, (0,  80, 80),  (10, 255, 255))
    red2  = cv2.inRange(hsv, (170, 80, 80), (180, 255, 255))
    red   = cv2.bitwise_or(red1, red2)
    g     = int(green.sum()) // 255
    r     = int(red.sum())   // 255
    if g == 0 and r == 0:
        return None
    return "Long" if g > r else "Short"


# ─────────────────────────────────────────────
# ENTRY PRICE
# ─────────────────────────────────────────────

def detect_entry_price(img, tokens):
    """
    Three strategies (in priority order):

    1. Yellow arrow-label bar
       cTrader renders an amber/yellow label bar directly on the chart
       where the orange arrow is placed. This bar contains the entry price
       as dark text on yellow background.

    2. Orange arrow mid-chart (CLAHE OCR)
       When the arrow is in the middle of the chart (not at the edge),
       the price label sits to the LEFT of the arrow tip as orange text.

    3. PSM-11 sparse float token
       Floating orange price labels anywhere on the chart are found as
       price-shaped tokens (X.XXXXX) by the sparse text scan.
    """
    h, w = img.shape[:2]

    # ── Strategy 1: yellow arrow-label bar ─────────────────────────────
    hsv    = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    yellow = cv2.inRange(hsv, (15, 100, 140), (40, 255, 255))
    yellow[int(h * 0.80):, :] = 0
    row_sums = yellow.sum(axis=1)
    yellow_ys = np.where(row_sums > 300)[0]

    if len(yellow_ys):
        yb1 = max(0, int(yellow_ys[0]) - 2)
        yb2 = min(h, int(yellow_ys[0]) + 25)
        strip = img[yb1:yb2, :]
        sh, sw = strip.shape[:2]
        sc = cv2.resize(strip, (sw * 4, sh * 4), interpolation=cv2.INTER_CUBIC)
        g  = cv2.cvtColor(sc, cv2.COLOR_BGR2GRAY)
        _, thr = cv2.threshold(g, 100, 255, cv2.THRESH_BINARY_INV)
        text = pytesseract.image_to_string(thr, config="--psm 7 --oem 3").strip()
        text_clean = re.sub(r'(\d),(\d{3})', r'\1\2', text)
        m = re.search(r'\b(\d{1,4}[.,]\d{4,6})\b', text_clean)
        if m:
            return m.group(1).replace(',', '.')

    # ── Strategy 2: orange arrow mid-chart ─────────────────────────────
    orange = cv2.inRange(hsv, (10, 160, 160), (25, 255, 255))
    orange[int(h * 0.80):, :] = 0

    ys_o, xs_o = np.where(orange > 0)
    if len(ys_o):
        yc     = Counter(ys_o.tolist())
        by     = max(yc, key=yc.get)
        mask   = (ys_o >= by - 5) & (ys_o <= by + 5)
        xr     = xs_o[mask]
        xl     = int(xr.min())
        xright = int(xr.max())

        text = ocr_region_clahe(
            img,
            x1=max(0, xl - 200), y1=max(0, by - 18),
            x2=xright + 15,      y2=min(h, by + 18),
            scale=8, psm=7
        )
        text_clean = re.sub(r'(\d),(\d{3})', r'\1\2', text)
        m = re.search(r'\b(\d{1,4}[.,]\d{3,6})\b', text_clean)
        if m:
            return m.group(1).replace(',', '.')

    # ── Strategy 3: PSM-11 sparse float token ───────────────────────────
    chart_top    = int(h * 0.10)
    chart_bottom = int(h * 0.85)
    for tok in tokens:
        y, t = tok["y"], tok["text"]
        if chart_top < y < chart_bottom:
            clean = t.replace(',', '.')
            if re.match(r'^\d{1,4}\.\d{4,6}$', clean):
                return clean

    return None


# ─────────────────────────────────────────────
# INSTRUMENT & TIMEFRAME
# ─────────────────────────────────────────────

VALID_TF = {
    '1M','2M','3M','4M','5M','10M','15M','20M','30M',
    '1H','2H','3H','4H','6H','8H','12H','1D','1W',
}

SKIP_TF_KEYWORDS = re.compile(
    r'\b(units|contract|P[/\\]L|points|Risk|Reward|Run.Up|Drawdown)\b',
    re.IGNORECASE
)


def parse_instrument_timeframe(lines, tokens):
    """
    Instrument: from top-bar OCR or PSM-11 tab tokens (y < 80).
    Timeframe:  from "4 Hours" pattern or "H4"-style token.
    """
    instrument = None
    timeframe  = None

    top_tokens = [tok["text"] for tok in tokens if tok["y"] < 80]
    all_text   = lines + top_tokens

    for line in all_text:
        if not instrument:
            m = re.search(
                r'\b((?:EUR|GBP|AUD|NZD|CAD|CHF|JPY|XAU|XAG|BTC|ETH|BNB)'
                r'[/\\]?(?:EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY|XAU|XAG|BTC|ETH|BNB))\b',
                line, re.IGNORECASE
            )
            if not m:
                m = re.search(
                    r'\b(USA500[.,_]?IDX|USAS[O0]{2}[.,_]?IDX|US30|NAS100|DAX40'
                    r'|SPX500|XAUUSD|XAGUSD|BTCUSDT?|ETHUSD)\b',
                    line, re.IGNORECASE
                )
            if m:
                raw = m.group(1).upper()
                raw = re.sub(r'USAS[O0]{2}', 'USA500', raw)
                instrument = raw

        if SKIP_TF_KEYWORDS.search(line):
            continue

        tm = re.search(r'\b(\d+)\s*(Minute[s]?|Hour[s]?)\b', line, re.IGNORECASE)
        if tm:
            n, u = tm.group(1), tm.group(2).lower()
            tf = f"{n}H" if 'hour' in u else f"{n}M"
            if tf in VALID_TF:
                timeframe = tf
                continue

        for pat in [r'\b([HMhm])([1-9]\d?)\b', r'\b([1-9]\d?)([HMhm])\b']:
            for m2 in re.finditer(pat, line):
                a, b = m2.group(1), m2.group(2)
                if a[0].isalpha():
                    tf = f"{b}H" if a.upper() == 'H' else f"{b}M"
                else:
                    tf = f"{a}H" if b.upper() == 'H' else f"{a}M"
                if tf in VALID_TF:
                    timeframe = tf

    return instrument, timeframe


# ─────────────────────────────────────────────
# SL / TP DISTANCE PARSER
# ─────────────────────────────────────────────

def parse_tp_sl(lines, instrument):
    """
    Parses SL and TP from lines like:
      'TP 167.4 points USD 21.43'
      'SL -33.3 points USD -4.27'
    """
    sl_pts = sl_usd = tp_pts = tp_usd = None
    is_index = _is_index(instrument)

    for line in lines:
        m = re.search(
            r'\b(TP|SL)\b.*?([+-]?\d+[\.,]\d+)\s*points?\s*[/]?\s*USD\s*([+-]?\d+[\.,]\d+)',
            line, re.IGNORECASE
        )
        if not m:
            continue
        tag = m.group(1).upper()
        pts = _f(m.group(2))
        usd = _f(m.group(3))

        if tag == "SL":
            sl_pts = abs(pts) if pts is not None else None
            sl_usd = usd
        elif tag == "TP":
            if pts is not None and abs(pts) > 1000 and is_index:
                continue
            tp_pts = abs(pts) if pts is not None else None
            tp_usd = usd

    return sl_pts, sl_usd, tp_pts, tp_usd


def _is_index(instrument):
    sym = (instrument or "").upper()
    return any(x in sym for x in ['IDX', 'US30', 'NAS', 'SPX', 'DAX', 'FTSE', 'CAC', 'DOW'])


# ─────────────────────────────────────────────
# TRADE INFO (green overlay band)
# ─────────────────────────────────────────────

def parse_trade_info(lines):
    """
    Parses from the green trade-info overlay band:
    - Lot size, Open/Closed P/L, Run-Up / Drawdown, Risk/Reward
    """
    result = {}
    joined = " ".join(lines)

    # Lot size — forex units
    m = re.search(r"(\d[\d',]*)\s*units", joined, re.IGNORECASE)
    if m:
        raw = m.group(1).replace("'", "").replace(",", "")
        u   = _f(raw)
        if u and u > 0:
            valid_units = [100, 1000, 2000, 3000, 5000, 10000, 20000, 50000,
                           100000, 200000, 500000, 1000000, 10000000]
            closest = min(valid_units, key=lambda x: abs(x - u))
            ratio   = u / closest if closest > 0 else 999
            if 0.8 <= ratio <= 1.2:
                result["lotSize"] = round(closest / 100000, 5)
                result["units"]   = int(closest)
            else:
                result["lotSize"] = round(u / 100000, 5)
                result["units"]   = int(u)

    # Lot size — index contract size
    if "lotSize" not in result:
        m = re.search(r'([0-9]+[\.,][0-9]+)\s*contract', joined, re.IGNORECASE)
        if not m:
            m = re.search(r'\b(0\.[0-9]+)\s*contract', joined, re.IGNORECASE)
        if m:
            val = _f(m.group(1))
            if val and val < 10:
                result["lotSize"]      = val
                result["contractSize"] = val

    # Open or Closed P/L
    m = re.search(r'(?:Open|Closed)\s*P[/\\]L\s*([+-]?\d+[\.,]\d+)\s*points?',
                  joined, re.IGNORECASE)
    if m:
        result["openPLPoints"] = _f(m.group(1))

    m = re.search(r'(?:Open|Closed)\s*P[/\\]L.*?USD\s*([+-]?\d+[\.,]\d+)',
                  joined, re.IGNORECASE)
    if m:
        result["openPLUSD"] = _f(m.group(1))

    # Drawdown (MAE)
    m = re.search(
        r'Drawdown\s*([+-]?\d+[\.,]\d+)\s*points?.*?USD\s*([+-]?\d+[\.,]\d+)',
        joined, re.IGNORECASE
    )
    if m:
        result["drawdownPoints"] = _f(m.group(1))
        result["drawdownUSD"]    = _f(m.group(2))

    # Run-Up (MFE)
    m = re.search(
        r'Run[\s-]?Up\s*([+-]?\d+[\.,]\d+)\s*points?.*?USD\s*([+-]?\d+[\.,]\d+)',
        joined, re.IGNORECASE
    )
    if m:
        result["runUpPoints"] = _f(m.group(1))
        result["runUpUSD"]    = _f(m.group(2))

    # Risk/Reward
    m = re.search(r'Risk[/\\]?Reward\s*([0-9]+[\.,][0-9]+)', joined, re.IGNORECASE)
    if m:
        result["riskReward"] = _f(m.group(1))

    return result


# ─────────────────────────────────────────────
# POINTS → PIPS + PRICE CALCULATIONS
# ─────────────────────────────────────────────

def get_instrument_specs(instrument):
    """
    Returns (point_size, pip_size, pips_per_point, decimal_places).
    """
    sym = (instrument or "").upper()
    if any(x in sym for x in ['IDX','US30','NAS','SPX','DAX','CAC','FTSE','DOW','USA500']):
        return 1.0,     1.0,   1.0, 1
    if 'JPY' in sym:
        return 0.001,   0.01,  0.1, 3
    if 'XAU' in sym or 'GOLD' in sym:
        return 0.01,    0.1,   0.1, 2
    if 'XAG' in sym or 'SILVER' in sym:
        return 0.001,   0.01,  0.1, 3
    return 0.00001, 0.0001, 0.1, 5


def calc_sl_tp(entry_price_str, direction, sl_pts, tp_pts, rr, instrument):
    """
    Calculates absolute SL/TP prices and pip distances.
    """
    ep = _f(entry_price_str)
    if ep is None:
        return None, None, None, None, tp_pts, False

    ps, pip_s, p2p, dec = get_instrument_specs(instrument)
    long = (direction or "Long").lower() == "long"

    sl_price = sl_pips = None
    if sl_pts is not None:
        sl_price = round(ep - sl_pts * ps if long else ep + sl_pts * ps, dec)
        sl_pips  = round(sl_pts * p2p, 1)

    tp_from_rr  = False
    tp_pts_used = tp_pts
    if tp_pts_used is None and sl_pts is not None and rr is not None:
        tp_pts_used = round(sl_pts * rr, 1)
        tp_from_rr  = True

    tp_price = tp_pips = None
    if tp_pts_used is not None:
        tp_price = round(ep + tp_pts_used * ps if long else ep - tp_pts_used * ps, dec)
        tp_pips  = round(tp_pts_used * p2p, 1)

    return sl_price, sl_pips, tp_price, tp_pips, tp_pts_used, tp_from_rr


# ─────────────────────────────────────────────
# DATETIME EXTRACTION
# ─────────────────────────────────────────────

def _get_london_ny_opens(dt):
    """
    Returns (london_open_utc, ny_open_utc) accounting for DST on the given date.
    """
    import calendar as _cal

    year = dt.year

    def _last_sunday(y, m):
        last = _cal.monthrange(y, m)[1]
        d = date(y, m, last)
        return d - timedelta(days=(d.weekday() + 1) % 7)

    def _nth_sunday(y, m, n):
        first = date(y, m, 1)
        offset = (6 - first.weekday()) % 7
        return date(y, m, 1 + offset + (n - 1) * 7)

    d = dt.date() if hasattr(dt, 'date') else dt

    bst_start = _last_sunday(year, 3)
    bst_end   = _last_sunday(year, 10)
    uk_bst    = bst_start <= d < bst_end

    edt_start = _nth_sunday(year, 3,  2)
    edt_end   = _nth_sunday(year, 11, 1)
    us_edt    = edt_start <= d < edt_end

    london_open_utc = 7 if uk_bst  else 8
    ny_open_utc     = 13 if us_edt else 14

    return london_open_utc, ny_open_utc, uk_bst, us_edt


def _get_session_and_phase(h_utc, dt=None):
    """
    Returns (primary_session, session_phase) for a UTC hour, with DST awareness.
    """
    h = h_utc

    if dt is not None:
        lon_open, ny_open, _, _ = _get_london_ny_opens(dt)
    else:
        lon_open, ny_open = 8, 14

    lon_close = lon_open + 9
    ny_close  = ny_open  + 8

    tokyo_on   = 0  <= h < 9
    london_on  = lon_open <= h < lon_close
    newyork_on = ny_open  <= h < ny_close
    sydney_on  = h >= 22 or h < 6

    if london_on and newyork_on:
        return "London/New York", "Overlap"
    if tokyo_on and london_on:
        return "Tokyo/London", "Overlap"

    if london_on:
        into = h - lon_open
        if into < 2:                             return "London", "Open"
        if into >= lon_close - lon_open - 2:     return "London", "Close"
        return "London", "Mid"

    if newyork_on:
        into = h - ny_open
        if into < 2:                             return "New York", "Open"
        if into >= ny_close - ny_open - 2:       return "New York", "Close"
        return "New York", "Mid"

    if tokyo_on:
        if h < 2:  return "Tokyo", "Open"
        if h >= 7: return "Tokyo", "Close"
        return "Tokyo", "Mid"

    if sydney_on:
        return "Sydney", "—"

    return "Dead Zone", "—"


def parse_datetimes(lines):
    """
    Returns (entry_dt, exit_dt, day_of_week, session_name, session_phase).

    exitTime  ← "Last processed tick: YYYY-MM-DD HH:MM"
    entryTime ← highlighted date on the bottom timeline bar
    """
    months = {'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
              'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}
    joined  = " ".join(lines)
    cleaned = _clean_digit_ocr(joined)

    entry_dt = exit_dt = day_of_week = None

    # ── Exit: "Last processed tick: 2021-01-04 11:59" ───────────────────
    m_exit = re.search(r'(\d{4}-\d{2}-\d{2})\s+(\d{2}[:.]\d{2})',
                       joined, re.IGNORECASE)
    if m_exit:
        h_part = int(m_exit.group(2)[:2])
        if 0 <= h_part <= 23:
            try:
                t_str = m_exit.group(2).replace('.', ':')[:5]
                dt = datetime.strptime(f"{m_exit.group(1)} {t_str}", '%Y-%m-%d %H:%M')
                exit_dt = dt.isoformat(sep=' ', timespec='minutes')
            except Exception:
                exit_dt = m_exit.group(1)

    # ── Entry: "Thu 10Jan'19 08:00" ─────────────────────────────────────
    ms = list(re.finditer(
        r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s*"
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'?(\d{2})\s+"
        r"(\d{2}):(\d{2})",
        cleaned, re.IGNORECASE
    ))
    if ms:
        gp = ms[0].groups()
        try:
            dt          = datetime(2000+int(gp[3]), months[gp[2].lower()],
                                   int(gp[1]), int(gp[4]), int(gp[5]))
            entry_dt    = dt.isoformat(sep=' ', timespec='minutes')
            day_of_week = dt.strftime('%A')
        except Exception:
            pass

    # ── Entry fallback: "Mon 04 Jan'21" (date only) ─────────────────────
    if not entry_dt:
        ms2 = list(re.finditer(
            r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+"
            r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'?(\d{2})\b",
            cleaned, re.IGNORECASE
        ))
        if ms2:
            gp = ms2[0].groups()
            try:
                dt          = datetime(2000+int(gp[3]), months[gp[2].lower()], int(gp[1]))
                entry_dt    = dt.strftime('%Y-%m-%d')
                day_of_week = dt.strftime('%A')
            except Exception:
                pass

    if not day_of_week and exit_dt:
        try:
            dt          = datetime.fromisoformat(exit_dt)
            day_of_week = dt.strftime('%A')
        except Exception:
            pass

    # ── Session + Phase (UTC, DST-aware) ────────────────────────────────
    session = session_phase = None
    ref_str = entry_dt or exit_dt
    if ref_str and (' ' in ref_str or 'T' in ref_str):
        try:
            t = datetime.fromisoformat(ref_str)
            session, session_phase = _get_session_and_phase(t.hour, dt=t)
        except Exception:
            pass

    return entry_dt, exit_dt, day_of_week, session, session_phase


def collect_replay_exit_time(img):
    """
    Scans bottom ~15% of image for dark-text replay bar:
    'Replay mode has been activated. Last processed tick: YYYY-MM-DD HH:MM:SS'
    """
    h, w = img.shape[:2]
    y1   = int(h * 0.82)
    y2   = int(h * 0.97)

    text = ocr_strip_dark_text(img, y1, y2, x2_pct=0.75, scale=3)

    m_date = re.search(r'(\d{4}-\d{2}-\d{2})', text)
    if not m_date:
        return ""

    date_str = m_date.group(1)
    rest       = text[m_date.end():]
    rest_clean = re.sub(r'[Oo]', '0', rest)
    rest_clean = re.sub(r'[Il]', '1', rest_clean)
    m_time     = re.search(r'(\d{2})[:\s.,](\d{2})', rest_clean)

    if m_time:
        hh = int(m_time.group(1))
        mm = int(m_time.group(2))
        if 0 <= hh <= 23 and 0 <= mm <= 59:
            return f"{date_str} {hh:02d}:{mm:02d}"

    return date_str


# ─────────────────────────────────────────────
# OUTCOME
# ─────────────────────────────────────────────

def parse_outcome(lines):
    """Win / Loss / BE derived from P/L USD sign."""
    joined = " ".join(lines)
    m = re.search(r'(?:Open|Closed)\s*P[/\\]L.*?USD\s*([+-]?\d+[\.,]\d+)',
                  joined, re.IGNORECASE)
    if m:
        val = _f(m.group(1))
        if val is None:   return None
        if val > 0.01:    return "Win"
        if val < -0.01:   return "Loss"
        return "BE"
    return None


# ─────────────────────────────────────────────
# PAIR CATEGORY
# ─────────────────────────────────────────────

def infer_pair_category(instrument):
    if not instrument:
        return None
    sym = instrument.upper().replace('/', '').replace('\\', '').replace('.', '')
    if any(x in sym for x in ['BTC','ETH','BNB','XRP','SOL','USDT']):
        return "Crypto"
    if any(x in sym for x in ['XAU','XAG','GOLD','SILVER','OIL','WTI']):
        return "Commodity"
    if any(x in sym for x in ['IDX','US30','NAS','SPX','DAX','FTSE','CAC','DOW','USA500']):
        return "Index"
    MAJORS = {'EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD'}
    if sym in MAJORS:
        return "Major"
    MINORS = {'EURGBP','EURJPY','GBPJPY','AUDJPY','CADJPY','CHFJPY',
              'EURAUD','EURCHF','GBPAUD','GBPCAD','AUDCAD','AUDCHF','AUDNZD'}
    if sym in MINORS:
        return "Minor"
    if len(sym) == 6 and sym.isalpha():
        return "Exotic"
    return None


# ─────────────────────────────────────────────
# MAIN EXTRACTOR
# ─────────────────────────────────────────────

def extract_fields(img):
    # ── 1. Collect text from all sources ──────────────────────────────
    text_rows  = collect_white_text_rows(img)
    all_lines  = [t for _, t in text_rows]

    green_text = collect_green_band_text(img)
    if green_text:
        all_lines.append(green_text)

    replay_text = collect_replay_exit_time(img)
    if replay_text:
        all_lines.append(replay_text)

    tokens = psm11_scan(img)

    # ── 2. Parse all fields ───────────────────────────────────────────
    instrument, timeframe = parse_instrument_timeframe(all_lines, tokens)
    sl_pts, sl_usd, tp_pts, tp_usd = parse_tp_sl(all_lines, instrument)
    trade_info  = parse_trade_info(all_lines)
    entry_dt, exit_dt, dow, session, session_phase = parse_datetimes(all_lines)
    direction   = detect_direction(img)
    entry_price = detect_entry_price(img, tokens)
    outcome     = parse_outcome(all_lines)
    rr          = trade_info.get("riskReward")

    # ── 3. SL/TP prices + pip distances ──────────────────────────────
    sl_price, sl_pips, tp_price, tp_pips, tp_pts_used, tp_from_rr = \
        calc_sl_tp(entry_price, direction, sl_pts, tp_pts, rr, instrument)

    # ── 4. Pair category ─────────────────────────────────────────────
    pair_category = infer_pair_category(instrument)

    # ── 5. Trade duration ─────────────────────────────────────────────
    # Calculated here — OCR owns this computation since it extracted
    # both timestamps. JournalForm only displays the result.
    trade_duration = compute_trade_duration(entry_dt, exit_dt)

    # ── 6. Assemble output ───────────────────────────────────────────
    fields = {
        # Instrument
        "instrument":         instrument,
        "pairCategory":       pair_category,
        "timeframe":          timeframe,
        # Direction
        "direction":          direction,
        # Entry price
        "entryPrice":         entry_price,
        # Stop Loss
        "stopLoss":           str(sl_price) if sl_price is not None else None,
        "stopLossPoints":     sl_pts,
        "stopLossPips":       sl_pips,
        "stopLossUSD":        sl_usd,
        # Take Profit
        "takeProfit":         str(tp_price) if tp_price is not None else None,
        "takeProfitPoints":   tp_pts_used,
        "takeProfitPips":     tp_pips,
        "takeProfitUSD":      tp_usd,
        "tpCalculatedFromRR": tp_from_rr,
        # Position size
        "lotSize":            trade_info.get("lotSize"),
        "units":              trade_info.get("units"),
        "contractSize":       trade_info.get("contractSize"),
        # P&L
        "openPLPoints":       trade_info.get("openPLPoints"),
        "openPLUSD":          trade_info.get("openPLUSD"),
        # Outcome
        "outcome":            outcome,
        # Risk/Reward
        "riskReward":         rr,
        # MFE / MAE
        "runUpPoints":        trade_info.get("runUpPoints"),
        "runUpUSD":           trade_info.get("runUpUSD"),
        "drawdownPoints":     trade_info.get("drawdownPoints"),
        "drawdownUSD":        trade_info.get("drawdownUSD"),
        # Timing
        "entryTime":          entry_dt,
        "exitTime":           exit_dt,
        "tradeDuration":      trade_duration,   # ← new field
        "dayOfWeek":          dow,
        "sessionName":        session,
        "sessionPhase":       session_phase,
        # Debug
        "rawLines":           all_lines,
    }

    # Confidence score
    key_fields = [instrument, timeframe, direction, sl_pts, entry_price, rr, entry_dt]
    filled     = sum(1 for f in key_fields if f is not None)
    confidence = "high" if filled >= 6 else "medium" if filled >= 3 else "low"

    return {"fields": fields, "confidence": confidence}


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

def main():
    b64 = sys.stdin.read().strip()
    try:
        img    = load_image_from_b64(b64)
        result = extract_fields(img)
        output = {
            "success": True,
            "fields":  result["fields"],
            "aiExtractedRaw": {
                "method":        "ocr_v6",
                "ocrConfidence": result["confidence"],
                "notes": [
                    "SL/TP absolute prices calculated from entry ± (points × point_size).",
                    "tpCalculatedFromRR=true means TP was derived from RR × SL (no explicit TP on screenshot).",
                    "exitTime comes from 'Last processed tick' on outcome screenshots.",
                    "tradeDuration calculated from entryTime and exitTime when both are present.",
                    "For index instruments (USA500.IDX etc.), absolute TP price lines are ignored.",
                    "Instrument/timeframe require a visible top bar — may need manual entry if cropped.",
                ]
            }
        }
    except Exception as e:
        output = {
            "success":   False,
            "error":     str(e),
            "traceback": traceback.format_exc()
        }
    print(json.dumps(output, indent=2, default=str))


if __name__ == "__main__":
    main()