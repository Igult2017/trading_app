#!/usr/bin/env python3
"""
Trading Screenshot OCR Analyzer v3
Optimized for cTrader / Dxtrade / TradingView dark-theme screenshots.

Strategy:
  1. Detect text rows by finding horizontal bands with many bright (white) pixels
  2. Invert each strip + threshold → black text on white → Tesseract reads well
  3. Parse known field patterns from the collected text lines
  4. Detect direction (Buy/Sell) from green/red color dominance in right panel
  5. Entry price from orange arrow region

Accepts: base64-encoded image via stdin
Outputs: JSON to stdout
"""

import sys, json, base64, re, io, traceback
from datetime import datetime
from collections import Counter

try:
    import numpy as np
    import cv2
    from PIL import Image
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
    padding = (4 - len(b64_str) % 4) % 4
    b64_str += "=" * padding
    data = base64.b64decode(b64_str)
    arr  = np.frombuffer(data, np.uint8)
    img  = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img


# ─────────────────────────────────────────────
# CORE: STRIP OCR
# ─────────────────────────────────────────────

def ocr_strip(img, y1, y2, scale=4, psm=6):
    """Cut a horizontal strip, invert (white text on dark), upscale, OCR."""
    h, w = img.shape[:2]
    y1, y2 = max(0, y1), min(h, y2)
    if y2 <= y1:
        return ""
    strip  = img[y1:y2, :]
    sh, sw = strip.shape[:2]
    scaled = cv2.resize(strip, (sw * scale, sh * scale), interpolation=cv2.INTER_CUBIC)
    gray   = cv2.cvtColor(scaled, cv2.COLOR_BGR2GRAY)
    inv    = cv2.bitwise_not(gray)
    _, thr = cv2.threshold(inv, 90, 255, cv2.THRESH_BINARY)
    cfg    = f"--psm {psm} --oem 3"
    return pytesseract.image_to_string(thr, config=cfg).strip()


def find_text_row_clusters(img, min_white=15, min_height=3):
    """
    Find horizontal bands of the image that contain bright (white/light) pixels.
    Returns list of (y_start, y_end) tuples.
    """
    gray       = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    white_rows = (gray > 175).sum(axis=1)
    has_text   = white_rows > min_white
    labeled, n = nd.label(has_text)
    clusters   = []
    for i in range(1, n + 1):
        rows = np.where(labeled == i)[0]
        ys, ye = int(rows[0]), int(rows[-1])
        if ye - ys >= min_height:
            clusters.append((ys, ye))
    return clusters


def collect_all_text(img):
    """OCR every text-row cluster. Returns list of (y, text) pairs."""
    clusters = find_text_row_clusters(img)
    results  = []
    pad      = 3
    for ys, ye in clusters:
        text = ocr_strip(img, ys - pad, ye + pad, scale=4, psm=6)
        if text and len(text) > 3 and re.search(r'[0-9a-zA-Z/]', text):
            results.append((ys, text))
    return results


# ─────────────────────────────────────────────
# DIRECTION DETECTION (color-based)
# ─────────────────────────────────────────────

def detect_direction(img):
    """
    In the RIGHT half of the image (chart panel excluded),
    count green vs red pixels. Green dominant → Long/Buy, Red → Short/Sell.
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
# ENTRY PRICE (orange arrow)
# ─────────────────────────────────────────────

def detect_entry_price(img):
    """
    The platform draws an orange/yellow arrow at entry price level.
    Find that arrow, grab the text immediately to its right.
    """
    h, w = img.shape[:2]
    hsv  = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # Tight orange range
    orange = cv2.inRange(hsv, (10, 160, 160), (25, 255, 255))
    ys, xs = np.where(orange > 0)
    if not len(ys):
        return None

    # Find the y-row with most orange pixels
    y_counts = Counter(ys.tolist())
    best_y   = max(y_counts, key=y_counts.get)

    # Filter to that y-row +/-5px
    mask    = (ys >= best_y - 5) & (ys <= best_y + 5)
    xs_row  = xs[mask]
    if not len(xs_row):
        return None

    x_right = int(xs_row.max())
    y_mid   = best_y

    # OCR region to the right of the arrow
    x1, x2 = x_right + 2, min(w, x_right + 180)
    y1, y2  = max(0, y_mid - 10), min(h, y_mid + 16)
    if x2 <= x1 or y2 <= y1:
        return None

    strip  = img[y1:y2, x1:x2]
    sh, sw = strip.shape[:2]
    if sh < 2 or sw < 2:
        return None
    scaled = cv2.resize(strip, (sw * 5, sh * 5), interpolation=cv2.INTER_CUBIC)
    gray   = cv2.cvtColor(scaled, cv2.COLOR_BGR2GRAY)
    inv    = cv2.bitwise_not(gray)
    _, thr = cv2.threshold(inv, 80, 255, cv2.THRESH_BINARY)
    text   = pytesseract.image_to_string(thr, config="--psm 7 --oem 3").strip()

    # Extract a price-like number
    m = re.search(r'\b(\d{1,4}[.,]\d{2,6})\b', text)
    return m.group(1).replace(',', '.') if m else None


# ─────────────────────────────────────────────
# TEXT PARSERS
# ─────────────────────────────────────────────

def _f(s):
    try:
        return float(str(s).replace(',', '.').replace("'", ""))
    except Exception:
        return None


def parse_instrument_timeframe(lines):
    """Top bar: 'EUR/USD  5 Minutes  Candles  Bid'"""
    instrument = None
    timeframe  = None
    for line in lines:
        # Must contain a slash or be a known single-word instrument
        m = re.search(
            r'\b((?:EUR|GBP|AUD|NZD|CAD|CHF|JPY|XAU|XAG|BTC|ETH|BNB|SPX|NAS|DAX|US30|GOLD|OIL|USD)'
            r'[/\\]'
            r'(?:EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY|XAU|XAG|BTC|ETH|BNB|SPX|NAS|DAX|USDT))\b',
            line, re.IGNORECASE
        )
        if not m:
            # Single-word instruments (indices, metals)
            m = re.search(r'\b(XAUUSD|XAGUSD|BTCUSDT?|ETHUSD|US30|SPX500|NAS100|DAX40)\b',
                          line, re.IGNORECASE)
        if m:
            instrument = m.group(1).upper()

        tm = re.search(
            r'\b(\d+)\s*(Minute[s]?|Hour[s]?|Day|Week|Month|Min|H|M|W|D)\b',
            line, re.IGNORECASE
        )
        if tm:
            n, unit = tm.group(1), tm.group(2).lower()
            if 'min' in unit or unit == 'm':
                timeframe = f"{n}M"
            elif 'hour' in unit or unit == 'h':
                timeframe = f"{n}H"
            elif 'day' in unit or unit == 'd':
                timeframe = f"{n}D"
            elif 'week' in unit or unit == 'w':
                timeframe = f"{n}W"

    return instrument, timeframe


def parse_tp_sl(lines):
    """
    Lines like:
      'TP 45.4 points USD 4.54'
      'SL -9.9 points USD -0.99'
    Returns: sl_pts, sl_usd, tp_pts, tp_usd
    """
    sl_pts = sl_usd = tp_pts = tp_usd = None

    for line in lines:
        m = re.search(
            r'\b(TP|SL)\b.*?([+-]?\d+[\.,]\d+)\s*points?\s*USD\s*([+-]?\d+[\.,]\d+)',
            line, re.IGNORECASE
        )
        if m:
            tag  = m.group(1).upper()
            pts  = _f(m.group(2))
            usd  = _f(m.group(3))
            if tag == "TP":
                tp_pts = abs(pts) if pts is not None else None
                tp_usd = usd
            else:
                sl_pts = abs(pts) if pts is not None else None
                sl_usd = usd

    return sl_pts, sl_usd, tp_pts, tp_usd


def parse_trade_info(lines):
    """
    Lines like:
      '1'000 units  Open P/L 7.2 points / USD 0.72'
      'Drawdown -4.3 points / USD -0.43  Risk/Reward 4.59'
      'Run-Up 42.4 points / USD 4.24  Risk/Reward 4.05'
    """
    result = {}
    joined = " ".join(lines)

    m = re.search(r"(\d[\d',.\/]*)\s*units", joined, re.IGNORECASE)
    if m:
        raw_units = m.group(1).replace("'","").replace(",","").replace("/","")
        units = _f(raw_units)
        if units:
            cleaned_units = str(units).replace("'","").replace(",","").replace("/","")
            u = _f(cleaned_units) if cleaned_units.replace('.','').isdigit() else None
            if u:
                result["lotSize"] = round(u / 100000, 5)
                result["units"]   = int(u)

    # Open P/L points
    m = re.search(r'Open\s*P[/\\]L\s*([+-]?\d+[\.,]\d+)\s*points', joined, re.IGNORECASE)
    if m:
        result["openPLPoints"] = _f(m.group(1))

    # Open P/L USD
    m = re.search(r'Open\s*P[/\\]L.*?USD\s*([+-]?\d+[\.,]\d+)', joined, re.IGNORECASE)
    if m:
        result["openPLUSD"] = _f(m.group(1))

    # Drawdown
    m = re.search(r'Drawdown\s*([+-]?\d+[\.,]\d+)\s*points.*?USD\s*([+-]?\d+[\.,]\d+)',
                  joined, re.IGNORECASE)
    if m:
        result["drawdownPoints"] = _f(m.group(1))
        result["drawdownUSD"]    = _f(m.group(2))

    # Run-Up (MFE)
    m = re.search(r'Run[\s-]?Up\s*([+-]?\d+[\.,]\d+)\s*points.*?USD\s*([+-]?\d+[\.,]\d+)',
                  joined, re.IGNORECASE)
    if m:
        result["runUpPoints"] = _f(m.group(1))
        result["runUpUSD"]    = _f(m.group(2))

    # Risk/Reward
    m = re.search(r'Risk[/\\]?Reward\s*([0-9]+[\.,][0-9]+)', joined, re.IGNORECASE)
    if m:
        result["riskReward"] = _f(m.group(1))

    return result


def parse_datetime_from_lines(lines):
    """
    Look for dates like:
      'Fri 06 Mar'26 22:10'
      '2021-02-25 15:59:59'  (replay mode status bar)
    Returns (entry_time_str, day_of_week, session)
    """
    joined = " ".join(lines)
    entry_dt = None
    day_of_week = None

    # Pattern 1: find ALL matches, pick the first (= leftmost = entry date)
    # Note: OCR sometimes drops space: "Fri06" instead of "Fri 06"
    matches = list(re.finditer(
        r'\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*'
        r'(\d{1,2})\s+'
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'(\d{2})\s+"
        r'(\d{2}):(\d{2})',
        joined, re.IGNORECASE
    ))
    if matches:
        m = matches[0]  # first occurrence = leftmost on x-axis = entry date
        dow, day, mon, yr, hr, mn = m.groups()
        months = {
            'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
            'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12
        }
        month_n = months.get(mon.lower(), 1)
        full_yr = 2000 + int(yr)
        try:
            dt = datetime(full_yr, month_n, int(day), int(hr), int(mn))
            entry_dt    = dt.isoformat(sep=' ', timespec='minutes')
            day_of_week = dt.strftime('%A')
        except Exception:
            pass

    # Pattern 2: ISO from replay status bar '2021-02-25 15:59:59'
    if not entry_dt:
        m2 = re.search(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})', joined)
        if m2:
            try:
                dt = datetime.strptime(m2.group(1), '%Y-%m-%d %H:%M:%S')
                entry_dt    = dt.isoformat(sep=' ', timespec='minutes')
                day_of_week = dt.strftime('%A')
            except Exception:
                pass

    # Session from time
    session = None
    if entry_dt:
        try:
            t = datetime.fromisoformat(entry_dt)
            h = t.hour
            if 0  <= h < 3:   session = "Tokyo"
            elif 3 <= h < 8:  session = "Tokyo/London Overlap"
            elif 8 <= h < 12: session = "London"
            elif 12<= h < 17: session = "New York"
            elif 17<= h < 21: session = "New York Close"
            else:              session = "Tokyo"
        except Exception:
            pass

    return entry_dt, day_of_week, session


def parse_outcome_from_lines(lines):
    """Infer outcome from P/L sign."""
    joined = " ".join(lines)
    m = re.search(r'Open\s*P[/\\]L.*?USD\s*([+-]?\d+[\.,]\d+)', joined, re.IGNORECASE)
    if m:
        val = _f(m.group(1))
        if val is None:
            return None
        if val > 0.01:
            return "Win"
        elif val < -0.01:
            return "Loss"
        else:
            return "Breakeven"
    return None


# ─────────────────────────────────────────────
# MAIN EXTRACTOR
# ─────────────────────────────────────────────

def extract_fields(img):
    # 1. Collect all readable text rows
    text_rows  = collect_all_text(img)
    all_lines  = [t for _, t in text_rows]

    # 2. Parse each component
    instrument, timeframe = parse_instrument_timeframe(all_lines)
    sl_pts, sl_usd, tp_pts, tp_usd = parse_tp_sl(all_lines)
    trade_info  = parse_trade_info(all_lines)
    entry_dt, dow, session = parse_datetime_from_lines(all_lines)
    direction   = detect_direction(img)
    entry_price = detect_entry_price(img)
    outcome     = parse_outcome_from_lines(all_lines)

    # 3. Assemble result
    fields = {
        "instrument":       instrument,
        "timeframe":        timeframe,
        "direction":        direction,
        "orderType":        None,
        "entryPrice":       entry_price,
        "stopLossPoints":   sl_pts,
        "stopLossUSD":      sl_usd,
        "takeProfitPoints": tp_pts,
        "takeProfitUSD":    tp_usd,
        "lotSize":          trade_info.get("lotSize"),
        "units":            trade_info.get("units"),
        "riskReward":       trade_info.get("riskReward"),
        "openPLPoints":     trade_info.get("openPLPoints"),
        "openPLUSD":        trade_info.get("openPLUSD"),
        "drawdownPoints":   trade_info.get("drawdownPoints"),
        "drawdownUSD":      trade_info.get("drawdownUSD"),
        "runUpPoints":      trade_info.get("runUpPoints"),
        "runUpUSD":         trade_info.get("runUpUSD"),
        "entryTime":        entry_dt,
        "dayOfWeek":        dow,
        "sessionName":      session,
        "outcome":          outcome,
        "rawLines":         all_lines,
    }

    # Confidence score
    key_fields = [instrument, timeframe, direction, sl_pts, tp_pts,
                  trade_info.get("riskReward"), entry_dt]
    filled = sum(1 for f in key_fields if f is not None)
    if filled >= 6:   confidence = "high"
    elif filled >= 3: confidence = "medium"
    else:             confidence = "low"

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
            "fields": result["fields"],
            "aiExtractedRaw": {
                "method":        "ocr_v3",
                "ocrConfidence": result["confidence"],
                "note": "Extracted via Tesseract OCR v3 (white-row detection). Review and correct any inaccurate fields."
            }
        }
    except Exception as e:
        output = {
            "success": False,
            "error":   str(e),
            "traceback": traceback.format_exc()
        }

    print(json.dumps(output, indent=2, default=str))


if __name__ == "__main__":
    main()
