#!/usr/bin/env python3
"""
Trading Screenshot OCR Analyzer v7
Optimized for cTrader Replay-mode dark-theme screenshots.

TWO-SCREENSHOT WORKFLOW
  Screenshot 1 (setup)   -> entryPrice, SL/TP distances, direction, plannedRR, entryTime
  Screenshot 2 (outcome) -> outcome (Win/Loss/Open) via candle-vs-level detection,
                            achievedRR from pixel measurement, exitTime

OUTCOME DETECTION (v7 - visual, not text-based)
  cTrader replay mode never shows "Closed P/L". Outcome is determined by comparing
  candle extremes AFTER entry to the TP/SL level lines:

    WIN  - highest candle wick after entry reaches/crosses TP line
    LOSS - lowest candle wick after entry reaches/crosses SL line
    OPEN - neither level touched (trade still running at replay tick)

  When both are touched, whichever was touched FIRST (leftmost x) wins.

ACHIEVED RR (v7)
  Screenshot 1: riskReward from text -> plannedRR
  Screenshot 2: pixel distance (entry->candle extreme) / pixel distance (entry->SL)
                -> achievedRR  (ratio is scale-invariant, works at any zoom)

PIXEL CALIBRATION (verified on real USDCHF 4H screenshot)
  TP line at y=134, Entry at y=451, SL at y=513
  SL distance: 33.3 points = 62px  -> 1.862 px/pt
  TP distance: 167.4 points = 317px -> 1.894 px/pt
  Average: 1.878 px/pt - highly consistent.
  The ratio method cancels units so no calibration constant is needed.
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
    gray       = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    white_rows = (gray > 175).sum(axis=1)
    has_text   = white_rows > 15
    labeled, n = nd.label(has_text)
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
            tokens.append({"text": t, "y": data['top'][i] // 2, "x": data['left'][i] // 2})
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
    text = re.sub(r'(?<=[0-9 ])C(?=[0-9])', '0', text)
    text = re.sub(r'(?<=[0-9])\]',           '1', text)
    text = re.sub(r'(?<=[0-9])O(?=[0-9])',   '0', text)
    text = re.sub(r'(?<=[0-9])I(?=[0-9])',   '1', text)
    return text


# ─────────────────────────────────────────────
# TRADE DURATION
# ─────────────────────────────────────────────

def compute_trade_duration(entry_dt_str, exit_dt_str):
    if not entry_dt_str or not exit_dt_str:
        return None
    fmts = ["%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M",
            "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"]
    entry_dt = exit_dt = None
    for fmt in fmts:
        try:
            entry_dt = datetime.strptime(str(entry_dt_str)[:len(fmt)], fmt)
            break
        except ValueError:
            continue
    for fmt in fmts:
        try:
            exit_dt = datetime.strptime(str(exit_dt_str)[:len(fmt)], fmt)
            break
        except ValueError:
            continue
    if entry_dt is None or exit_dt is None:
        return None
    delta = abs(exit_dt - entry_dt)
    total_minutes = int(delta.total_seconds() // 60)
    total_hours   = int(delta.total_seconds() // 3600)
    days          = delta.days
    rem_hrs       = int((delta.total_seconds() % 86400) // 3600)
    rem_min       = int((delta.total_seconds() % 3600)  // 60)
    if total_minutes < 60:
        return f"{total_minutes}m"
    elif total_hours < 24:
        return f"{total_hours}h" if rem_min == 0 else f"{total_hours}h {rem_min}m"
    else:
        return f"{days}d" if rem_hrs == 0 else f"{days}d {rem_hrs}h"


# ─────────────────────────────────────────────
# LEVEL LINE DETECTOR
# ─────────────────────────────────────────────

def detect_level_lines(img, chart_x_start=440, chart_x_end=None):
    """
    Detects horizontal dashed TP/SL/Entry level lines by finding rows
    with a high number of bright/dark transitions (the dash pattern).

    Returns sorted list of y-coordinates (one per line cluster).
    """
    h, w = img.shape[:2]
    if chart_x_end is None:
        chart_x_end = w - 100

    chart_top    = 100
    chart_bottom = int(h * 0.90)

    level_rows = []
    for y in range(chart_top, chart_bottom):
        row    = img[y, chart_x_start:chart_x_end, 0]
        bright = (row > 150).astype(np.int8)
        transitions  = int(np.sum(np.abs(np.diff(bright))))
        bright_count = int(np.sum(bright))
        if transitions >= 16 and bright_count >= 20 and transitions >= bright_count * 0.25:
            level_rows.append(y)

    if not level_rows:
        return []

    clusters = []
    current  = [level_rows[0]]
    for y in level_rows[1:]:
        if y - current[-1] <= 4:
            current.append(y)
        else:
            clusters.append(current)
            current = [y]
    clusters.append(current)

    return [int(np.mean(c)) for c in clusters]


def assign_level_lines(level_ys, entry_y, direction):
    """
    Assigns which detected level line is TP and which is SL,
    based on direction relative to entry.

    Long:  TP above entry (lower y), SL below (higher y)
    Short: TP below entry (higher y), SL above (lower y)
    """
    if entry_y is None or not level_ys:
        return None, None

    non_entry = [y for y in level_ys if abs(y - entry_y) > 20]
    long = (direction or "Long").lower() == "long"

    if long:
        above = [y for y in non_entry if y < entry_y]
        below = [y for y in non_entry if y > entry_y]
        tp_y  = min(above) if above else None
        sl_y  = max(below) if below else None
    else:
        above = [y for y in non_entry if y < entry_y]
        below = [y for y in non_entry if y > entry_y]
        tp_y  = max(below) if below else None
        sl_y  = min(above) if above else None

    return tp_y, sl_y


# ─────────────────────────────────────────────
# ENTRY ARROW DETECTOR
# ─────────────────────────────────────────────

def detect_entry_arrow(img):
    """
    Finds the orange entry arrow position (x, y).
    Excludes bottom 20% to avoid the replay warning triangle.
    """
    h, w = img.shape[:2]
    hsv  = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    orange = cv2.inRange(hsv, (10, 150, 150), (25, 255, 255))
    orange[int(h * 0.80):, :] = 0
    orange[:100, :] = 0

    ys, xs = np.where(orange > 0)
    if not len(ys):
        return None, None

    return int(xs.mean()), int(ys.mean())


# ─────────────────────────────────────────────
# OUTCOME DETECTOR (visual candle analysis)
# ─────────────────────────────────────────────

TOUCH_TOLERANCE_PX = 10  # pixels of tolerance for level-touch detection

def detect_outcome_visual(img, tp_y, sl_y, entry_x, entry_y, direction):
    """
    Determines trade outcome by comparing post-entry candle extremes
    to the TP and SL level line y-coordinates.

    Long:
      WIN  -> min_candle_y (highest price) <= tp_y + tolerance
      LOSS -> max_candle_y (lowest price)  >= sl_y - tolerance

    Short:
      WIN  -> max_candle_y (lowest price)  >= tp_y - tolerance
      LOSS -> min_candle_y (highest price) <= sl_y + tolerance

    When both touched: leftmost x determines which was first.

    Returns (outcome, achieved_rr, debug_dict)
      outcome:     "Win" | "Loss" | None (open)
      achieved_rr: float (ratio of move to risk, using pixels)
    """
    h, w = img.shape[:2]
    hsv  = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    if entry_x is None or entry_y is None or tp_y is None or sl_y is None:
        return None, None, {"reason": "missing_inputs"}

    scan_x_start = max(0, entry_x - 10)
    scan_x_end   = w - 100
    scan_y_start = 100
    scan_y_end   = int(h * 0.88)

    if scan_x_start >= scan_x_end:
        return None, None, {"reason": "entry_at_right_edge"}

    region = hsv[scan_y_start:scan_y_end, scan_x_start:scan_x_end, :]

    green = cv2.inRange(region, (40, 40, 60), (95, 255, 255))
    red1  = cv2.inRange(region, (0,  40, 60), (10, 255, 255))
    red2  = cv2.inRange(region, (165, 40, 60), (180, 255, 255))
    mask  = cv2.bitwise_or(green, cv2.bitwise_or(red1, red2))

    ys, xs = np.where(mask > 0)
    if not len(ys):
        return None, None, {"reason": "no_candles_detected"}

    abs_ys = ys + scan_y_start
    abs_xs = xs + scan_x_start

    long = (direction or "Long").lower() == "long"

    min_y = int(abs_ys.min())
    max_y = int(abs_ys.max())
    risk_px = max(abs(sl_y - entry_y), 1)

    if long:
        tp_touched = min_y <= tp_y + TOUCH_TOLERANCE_PX
        sl_touched = max_y >= sl_y - TOUCH_TOLERANCE_PX
        move_px    = entry_y - min_y
    else:
        tp_touched = max_y >= tp_y - TOUCH_TOLERANCE_PX
        sl_touched = min_y <= sl_y + TOUCH_TOLERANCE_PX
        move_px    = max_y - entry_y

    achieved_rr = round(max(move_px, 0) / risk_px, 2)

    debug = {
        "tp_y": tp_y, "sl_y": sl_y, "entry_y": entry_y,
        "min_candle_y": min_y, "max_candle_y": max_y,
        "tp_touched": tp_touched, "sl_touched": sl_touched,
        "risk_px": risk_px, "move_px": int(move_px),
        "achievedRR": achieved_rr,
    }

    if tp_touched and sl_touched:
        # Determine which was hit first by leftmost x
        if long:
            tp_xs = abs_xs[abs_ys <= tp_y + TOUCH_TOLERANCE_PX]
            sl_xs = abs_xs[abs_ys >= sl_y - TOUCH_TOLERANCE_PX]
        else:
            tp_xs = abs_xs[abs_ys >= tp_y - TOUCH_TOLERANCE_PX]
            sl_xs = abs_xs[abs_ys <= sl_y + TOUCH_TOLERANCE_PX]

        tp_first = int(tp_xs.min()) if len(tp_xs) else 99999
        sl_first = int(sl_xs.min()) if len(sl_xs) else 99999
        debug["tp_first_x"] = tp_first
        debug["sl_first_x"] = sl_first

        if tp_first < sl_first:
            achieved_rr = round(abs(tp_y - entry_y) / risk_px, 2)
            debug["achievedRR"] = achieved_rr
            return "Win", achieved_rr, debug
        else:
            return "Loss", 0.0, debug

    if tp_touched:
        achieved_rr = round(abs(tp_y - entry_y) / risk_px, 2)
        debug["achievedRR"] = achieved_rr
        return "Win", achieved_rr, debug

    if sl_touched:
        return "Loss", 0.0, debug

    return None, achieved_rr, debug  # still open, partial move returned


# ─────────────────────────────────────────────
# DIRECTION
# ─────────────────────────────────────────────

def detect_direction(img):
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
    h, w = img.shape[:2]
    hsv  = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    yellow = cv2.inRange(hsv, (15, 100, 140), (40, 255, 255))
    yellow[int(h * 0.80):, :] = 0
    row_sums  = yellow.sum(axis=1)
    yellow_ys = np.where(row_sums > 300)[0]

    if len(yellow_ys):
        yb1  = max(0, int(yellow_ys[0]) - 2)
        yb2  = min(h, int(yellow_ys[0]) + 25)
        strip = img[yb1:yb2, :]
        sh, sw = strip.shape[:2]
        sc   = cv2.resize(strip, (sw * 4, sh * 4), interpolation=cv2.INTER_CUBIC)
        g    = cv2.cvtColor(sc, cv2.COLOR_BGR2GRAY)
        _, thr = cv2.threshold(g, 100, 255, cv2.THRESH_BINARY_INV)
        text = pytesseract.image_to_string(thr, config="--psm 7 --oem 3").strip()
        text_clean = re.sub(r'(\d),(\d{3})', r'\1\2', text)
        m = re.search(r'\b(\d{1,4}[.,]\d{4,6})\b', text_clean)
        if m:
            return m.group(1).replace(',', '.')

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
        text = ocr_region_clahe(img, max(0, xl-200), max(0, by-18),
                                 xright+15, min(h, by+18), scale=8, psm=7)
        text_clean = re.sub(r'(\d),(\d{3})', r'\1\2', text)
        m = re.search(r'\b(\d{1,4}[.,]\d{3,6})\b', text_clean)
        if m:
            return m.group(1).replace(',', '.')

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

VALID_TF = {'1M','2M','3M','4M','5M','10M','15M','20M','30M',
            '1H','2H','3H','4H','6H','8H','12H','1D','1W'}

SKIP_TF_KEYWORDS = re.compile(
    r'\b(units|contract|P[/\\]L|points|Risk|Reward|Run.Up|Drawdown)\b', re.IGNORECASE)


def parse_instrument_timeframe(lines, tokens):
    instrument = timeframe = None
    top_tokens = [tok["text"] for tok in tokens if tok["y"] < 80]
    all_text   = lines + top_tokens

    for line in all_text:
        if not instrument:
            m = re.search(
                r'\b((?:EUR|GBP|AUD|NZD|CAD|CHF|JPY|XAU|XAG|BTC|ETH|BNB)'
                r'[/\\]?(?:EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY|XAU|XAG|BTC|ETH|BNB))\b',
                line, re.IGNORECASE)
            if not m:
                m = re.search(
                    r'\b(USA500[.,_]?IDX|USAS[O0]{2}[.,_]?IDX|US30|NAS100|DAX40'
                    r'|SPX500|XAUUSD|XAGUSD|BTCUSDT?|ETHUSD)\b', line, re.IGNORECASE)
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
    sl_pts = sl_usd = tp_pts = tp_usd = None
    is_idx = _is_index(instrument)

    for line in lines:
        m = re.search(
            r'\b(TP|SL)\b.*?([+-]?\d+[\.,]\d+)\s*points?\s*[/]?\s*USD\s*([+-]?\d+[\.,]\d+)',
            line, re.IGNORECASE)
        if not m:
            continue
        tag = m.group(1).upper()
        pts = _f(m.group(2))
        usd = _f(m.group(3))
        if tag == "SL":
            sl_pts = abs(pts) if pts is not None else None
            sl_usd = usd
        elif tag == "TP":
            if pts is not None and abs(pts) > 1000 and is_idx:
                continue
            tp_pts = abs(pts) if pts is not None else None
            tp_usd = usd

    return sl_pts, sl_usd, tp_pts, tp_usd


def _is_index(instrument):
    sym = (instrument or "").upper()
    return any(x in sym for x in ['IDX','US30','NAS','SPX','DAX','FTSE','CAC','DOW'])


# ─────────────────────────────────────────────
# TRADE INFO (green overlay band)
# ─────────────────────────────────────────────

def parse_trade_info(lines):
    result = {}
    joined = " ".join(lines)

    m = re.search(r"(\d[\d',]*)\s*units", joined, re.IGNORECASE)
    if m:
        raw = m.group(1).replace("'", "").replace(",", "")
        u   = _f(raw)
        if u and u > 0:
            valid_units = [100,1000,2000,3000,5000,10000,20000,50000,
                           100000,200000,500000,1000000,10000000]
            closest = min(valid_units, key=lambda x: abs(x - u))
            ratio   = u / closest if closest > 0 else 999
            result["lotSize"] = round(closest/100000 if 0.8<=ratio<=1.2 else u/100000, 5)
            result["units"]   = int(closest if 0.8<=ratio<=1.2 else u)

    if "lotSize" not in result:
        m = re.search(r'([0-9]+[\.,][0-9]+)\s*contract', joined, re.IGNORECASE)
        if not m:
            m = re.search(r'\b(0\.[0-9]+)\s*contract', joined, re.IGNORECASE)
        if m:
            val = _f(m.group(1))
            if val and val < 10:
                result["lotSize"] = result["contractSize"] = val

    # Open P/L (unrealised — stored for reference but NOT used for outcome)
    m = re.search(r'Open\s*P[/\\]L\s*([+-]?\d+[\.,]\d+)\s*points?', joined, re.IGNORECASE)
    if m: result["openPLPoints"] = _f(m.group(1))
    m = re.search(r'Open\s*P[/\\]L.*?USD\s*([+-]?\d+[\.,]\d+)', joined, re.IGNORECASE)
    if m: result["openPLUSD"] = _f(m.group(1))

    # Closed P/L (realised — used for outcome when present)
    m = re.search(r'Closed\s*P[/\\]L\s*([+-]?\d+[\.,]\d+)\s*points?', joined, re.IGNORECASE)
    if m: result["closedPLPoints"] = _f(m.group(1))
    m = re.search(r'Closed\s*P[/\\]L.*?USD\s*([+-]?\d+[\.,]\d+)', joined, re.IGNORECASE)
    if m: result["closedPLUSD"] = _f(m.group(1))

    # Drawdown (MAE)
    m = re.search(r'Drawdown\s*([+-]?\d+[\.,]\d+)\s*points?.*?USD\s*([+-]?\d+[\.,]\d+)',
                  joined, re.IGNORECASE)
    if m:
        result["drawdownPoints"] = _f(m.group(1))
        result["drawdownUSD"]    = _f(m.group(2))

    # Run-Up (MFE)
    m = re.search(r'Run[\s-]?Up\s*([+-]?\d+[\.,]\d+)\s*points?.*?USD\s*([+-]?\d+[\.,]\d+)',
                  joined, re.IGNORECASE)
    if m:
        result["runUpPoints"] = _f(m.group(1))
        result["runUpUSD"]    = _f(m.group(2))

    # Risk/Reward
    m = re.search(r'Risk[/\\]?Reward\s*([0-9]+[\.,][0-9]+)', joined, re.IGNORECASE)
    if m: result["riskReward"] = _f(m.group(1))

    return result


# ─────────────────────────────────────────────
# OUTCOME FROM TEXT (Closed P/L only)
# ─────────────────────────────────────────────

def parse_outcome_from_text(trade_info):
    """
    Uses Closed P/L only. Open P/L is explicitly ignored — it is
    unrealised mid-trade P/L and must never determine outcome.
    """
    v = trade_info.get("closedPLUSD")
    if v is None:
        return None
    if v > 0.01:  return "Win"
    if v < -0.01: return "Loss"
    return "BE"


# ─────────────────────────────────────────────
# PRICE CALCULATIONS
# ─────────────────────────────────────────────

def get_instrument_specs(instrument):
    sym = (instrument or "").upper()
    if any(x in sym for x in ['IDX','US30','NAS','SPX','DAX','CAC','FTSE','DOW','USA500']):
        return 1.0, 1.0, 1.0, 1
    if 'JPY' in sym:
        return 0.001, 0.01, 0.1, 3
    if 'XAU' in sym or 'GOLD' in sym:
        return 0.01, 0.1, 0.1, 2
    if 'XAG' in sym or 'SILVER' in sym:
        return 0.001, 0.01, 0.1, 3
    return 0.00001, 0.0001, 0.1, 5


def calc_sl_tp(entry_price_str, direction, sl_pts, tp_pts, rr, instrument):
    ep = _f(entry_price_str)
    if ep is None:
        return None, None, None, None, tp_pts, False
    ps, pip_s, p2p, dec = get_instrument_specs(instrument)
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


# ─────────────────────────────────────────────
# DATETIME
# ─────────────────────────────────────────────

def _get_london_ny_opens(dt):
    import calendar as _cal
    year = dt.year
    def _last_sun(y, m):
        last = _cal.monthrange(y, m)[1]
        d = date(y, m, last)
        return d - timedelta(days=(d.weekday()+1)%7)
    def _nth_sun(y, m, n):
        first = date(y, m, 1)
        off = (6-first.weekday())%7
        return date(y, m, 1+off+(n-1)*7)
    d = dt.date() if hasattr(dt, 'date') else dt
    uk_bst = _last_sun(year,3) <= d < _last_sun(year,10)
    us_edt = _nth_sun(year,3,2) <= d < _nth_sun(year,11,1)
    return (7 if uk_bst else 8), (13 if us_edt else 14), uk_bst, us_edt


def _get_session_and_phase(h_utc, dt=None):
    h = h_utc
    if dt is not None:
        lon_open, ny_open, _, _ = _get_london_ny_opens(dt)
    else:
        lon_open, ny_open = 8, 14
    lon_close = lon_open + 9
    ny_close  = ny_open  + 8
    tokyo_on   = 0 <= h < 9
    london_on  = lon_open <= h < lon_close
    newyork_on = ny_open  <= h < ny_close
    sydney_on  = h >= 22 or h < 6
    if london_on and newyork_on: return "London/New York", "Overlap"
    if tokyo_on  and london_on:  return "Tokyo/London",    "Overlap"
    if london_on:
        into = h - lon_open
        if into < 2:                         return "London", "Open"
        if into >= lon_close - lon_open - 2: return "London", "Close"
        return "London", "Mid"
    if newyork_on:
        into = h - ny_open
        if into < 2:                        return "New York", "Open"
        if into >= ny_close - ny_open - 2:  return "New York", "Close"
        return "New York", "Mid"
    if tokyo_on:
        if h < 2: return "Tokyo", "Open"
        if h >= 7: return "Tokyo", "Close"
        return "Tokyo", "Mid"
    if sydney_on: return "Sydney", "—"
    return "Dead Zone", "—"


def parse_datetimes(lines):
    months = {'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
              'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12}
    joined  = " ".join(lines)
    cleaned = _clean_digit_ocr(joined)
    entry_dt = exit_dt = day_of_week = None

    m_exit = re.search(r'(\d{4}-\d{2}-\d{2})\s+(\d{2}[:.]\d{2})', joined, re.IGNORECASE)
    if m_exit:
        h_part = int(m_exit.group(2)[:2])
        if 0 <= h_part <= 23:
            try:
                t_str = m_exit.group(2).replace('.', ':')[:5]
                dt = datetime.strptime(f"{m_exit.group(1)} {t_str}", '%Y-%m-%d %H:%M')
                exit_dt = dt.isoformat(sep=' ', timespec='minutes')
            except Exception:
                exit_dt = m_exit.group(1)

    ms = list(re.finditer(
        r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s*"
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'?(\d{2})\s+(\d{2}):(\d{2})",
        cleaned, re.IGNORECASE))
    if ms:
        gp = ms[0].groups()
        try:
            dt = datetime(2000+int(gp[3]), months[gp[2].lower()], int(gp[1]), int(gp[4]), int(gp[5]))
            entry_dt    = dt.isoformat(sep=' ', timespec='minutes')
            day_of_week = dt.strftime('%A')
        except Exception:
            pass

    if not entry_dt:
        ms2 = list(re.finditer(
            r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+"
            r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'?(\d{2})\b",
            cleaned, re.IGNORECASE))
        if ms2:
            gp = ms2[0].groups()
            try:
                dt = datetime(2000+int(gp[3]), months[gp[2].lower()], int(gp[1]))
                entry_dt    = dt.strftime('%Y-%m-%d')
                day_of_week = dt.strftime('%A')
            except Exception:
                pass

    if not day_of_week and exit_dt:
        try:
            dt = datetime.fromisoformat(exit_dt)
            day_of_week = dt.strftime('%A')
        except Exception:
            pass

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
    h, w = img.shape[:2]
    text = ocr_strip_dark_text(img, int(h*0.82), int(h*0.97), x2_pct=0.75, scale=3)
    m_date = re.search(r'(\d{4}-\d{2}-\d{2})', text)
    if not m_date:
        return ""
    date_str   = m_date.group(1)
    rest       = re.sub(r'[Oo]', '0', re.sub(r'[Il]', '1', text[m_date.end():]))
    m_time     = re.search(r'(\d{2})[:\s.,](\d{2})', rest)
    if m_time:
        hh, mm = int(m_time.group(1)), int(m_time.group(2))
        if 0 <= hh <= 23 and 0 <= mm <= 59:
            return f"{date_str} {hh:02d}:{mm:02d}"
    return date_str


# ─────────────────────────────────────────────
# PAIR CATEGORY
# ─────────────────────────────────────────────

def infer_pair_category(instrument):
    if not instrument:
        return None
    sym = instrument.upper().replace('/','').replace('\\','').replace('.','')
    if any(x in sym for x in ['BTC','ETH','BNB','XRP','SOL','USDT']): return "Crypto"
    if any(x in sym for x in ['XAU','XAG','GOLD','SILVER','OIL','WTI']): return "Commodity"
    if any(x in sym for x in ['IDX','US30','NAS','SPX','DAX','FTSE','CAC','DOW','USA500']): return "Index"
    if sym in {'EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD'}: return "Major"
    if sym in {'EURGBP','EURJPY','GBPJPY','AUDJPY','CADJPY','CHFJPY',
               'EURAUD','EURCHF','GBPAUD','GBPCAD','AUDCAD','AUDCHF','AUDNZD'}: return "Minor"
    if len(sym) == 6 and sym.isalpha(): return "Exotic"
    return None


# ─────────────────────────────────────────────
# MAIN EXTRACTOR
# ─────────────────────────────────────────────

def extract_fields(img):
    text_rows   = collect_white_text_rows(img)
    all_lines   = [t for _, t in text_rows]

    green_text  = collect_green_band_text(img)
    if green_text: all_lines.append(green_text)

    replay_text = collect_replay_exit_time(img)
    if replay_text: all_lines.append(replay_text)

    tokens = psm11_scan(img)

    instrument, timeframe = parse_instrument_timeframe(all_lines, tokens)
    sl_pts, sl_usd, tp_pts, tp_usd = parse_tp_sl(all_lines, instrument)
    trade_info  = parse_trade_info(all_lines)
    entry_dt, exit_dt, dow, session, session_phase = parse_datetimes(all_lines)
    direction   = detect_direction(img)
    entry_price = detect_entry_price(img, tokens)
    rr_text     = trade_info.get("riskReward")

    sl_price, sl_pips, tp_price, tp_pips, tp_pts_used, tp_from_rr = \
        calc_sl_tp(entry_price, direction, sl_pts, tp_pts, rr_text, instrument)

    pair_category  = infer_pair_category(instrument)
    trade_duration = compute_trade_duration(entry_dt, exit_dt)

    # Visual outcome detection
    entry_x, entry_y = detect_entry_arrow(img)
    level_ys         = detect_level_lines(img)
    tp_y_px, sl_y_px = assign_level_lines(level_ys, entry_y, direction)

    outcome_visual, achieved_rr, outcome_debug = detect_outcome_visual(
        img, tp_y_px, sl_y_px, entry_x, entry_y, direction)

    # Text outcome (Closed P/L only) overrides visual when present
    outcome_text = parse_outcome_from_text(trade_info)
    outcome      = outcome_text if outcome_text is not None else outcome_visual

    # P/L: prefer closed over open
    final_pl_usd    = trade_info.get("closedPLUSD")    or trade_info.get("openPLUSD")
    final_pl_points = trade_info.get("closedPLPoints") or trade_info.get("openPLPoints")

    fields = {
        "instrument":         instrument,
        "pairCategory":       pair_category,
        "timeframe":          timeframe,
        "direction":          direction,
        "entryPrice":         entry_price,
        "stopLoss":           str(sl_price)    if sl_price  is not None else None,
        "stopLossPoints":     sl_pts,
        "stopLossPips":       sl_pips,
        "stopLossUSD":        sl_usd,
        "takeProfit":         str(tp_price)    if tp_price  is not None else None,
        "takeProfitPoints":   tp_pts_used,
        "takeProfitPips":     tp_pips,
        "takeProfitUSD":      tp_usd,
        "tpCalculatedFromRR": tp_from_rr,
        "lotSize":            trade_info.get("lotSize"),
        "units":              trade_info.get("units"),
        "contractSize":       trade_info.get("contractSize"),
        "openPLPoints":       final_pl_points,
        "openPLUSD":          final_pl_usd,
        "outcome":            outcome,
        "tradeIsOpen":        outcome is None,
        # RR — JournalForm writes riskReward into plannedRR on screenshot 1
        #      and achievedRR into achievedRR on screenshot 2
        "riskReward":         rr_text,
        "achievedRR":         achieved_rr,
        "runUpPoints":        trade_info.get("runUpPoints"),
        "runUpUSD":           trade_info.get("runUpUSD"),
        "drawdownPoints":     trade_info.get("drawdownPoints"),
        "drawdownUSD":        trade_info.get("drawdownUSD"),
        "entryTime":          entry_dt,
        "exitTime":           exit_dt,
        "tradeDuration":      trade_duration,
        "dayOfWeek":          dow,
        "sessionName":        session,
        "sessionPhase":       session_phase,
        "_visual": {
            "entryArrowX":   entry_x,
            "entryArrowY":   entry_y,
            "tpLineY":       tp_y_px,
            "slLineY":       sl_y_px,
            "levelLines":    level_ys,
            "outcomeDebug":  outcome_debug,
            "outcomeSource": "text" if outcome_text is not None else (
                             "visual" if outcome_visual is not None else "none"),
        },
        "rawLines": all_lines,
    }

    key_fields = [instrument, timeframe, direction, sl_pts, entry_price, rr_text, entry_dt]
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
                "method":        "ocr_v7",
                "ocrConfidence": result["confidence"],
                "notes": [
                    "Outcome: visual candle-vs-level detection. Open P/L never used.",
                    "WIN when post-entry candle wick reaches TP line (y <= tp_y + 10px).",
                    "LOSS when post-entry candle wick reaches SL line (y >= sl_y - 10px).",
                    "Both touched: whichever leftmost x wins.",
                    "riskReward (text) -> plannedRR on screenshot 1.",
                    "achievedRR (pixels) -> achievedRR on screenshot 2.",
                    "tradeIsOpen=true: neither level touched at this replay tick.",
                    "SL/TP prices: entry +/- (points x point_size), instrument-specific.",
                    "tradeDuration: calculated from entryTime and exitTime.",
                ]
            }
        }
    except Exception as e:
        output = {"success": False, "error": str(e), "traceback": traceback.format_exc()}
    print(json.dumps(output, indent=2, default=str))


if __name__ == "__main__":
    main()
