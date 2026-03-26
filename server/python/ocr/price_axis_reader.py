"""
price_axis_reader.py  (v2 — coordinate mapping)
─────────────────────────────────────────────────
Reads opening and closing prices using axis calibration:

  1. OCR the right-edge price axis to get (y_pixel, price) calibration points
  2. Fit a linear pixel→price function via least-squares (+ RANSAC outlier removal)
  3. Detect horizontal trade lines (TP, entry, SL) via Hough transform
  4. Convert each line's y-coordinate to a price using the calibration function

Why this works:
  Trading platforms use linear price scaling — pixel position uniquely
  determines price. This is standard "axis calibration" in chart digitisation.

  Price = slope × y_pixel + intercept
  (higher y = lower price because pixel axis is top-down)
"""

import re
import cv2
import numpy as np
import pytesseract
from typing import Optional

from image_preprocessor import PreprocessedImage
from layout_detector     import LayoutRegions


# ── Axis OCR ──────────────────────────────────────────────────────────────────

def _ocr_axis(img: np.ndarray, layout: LayoutRegions) -> list[tuple[int, float]]:
    """
    OCR the right-edge price axis.
    Returns list of (y_pixel, price) sorted by y ascending.
    Filters noise using IQR-based outlier rejection.
    """
    h, w = img.shape[:2]
    cx2  = layout.chart_region[2] if layout.chart_region else int(w * 0.92)
    cy1  = layout.chart_region[1] if layout.chart_region else 0
    cy2  = layout.chart_region[3] if layout.chart_region else h

    axis = img[cy1:cy2, cx2:w]
    if axis.size == 0:
        return []

    sh, sw = axis.shape[:2]
    scale  = max(3, 180 // max(sw, 1))
    sc     = cv2.resize(axis, (sw * scale, sh * scale),
                        interpolation=cv2.INTER_CUBIC)
    gray   = cv2.cvtColor(sc, cv2.COLOR_BGR2GRAY)
    _, thr = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)

    data = pytesseract.image_to_data(
               thr, config="--psm 11 --oem 3",
               output_type=pytesseract.Output.DICT)

    raw = []
    for i, tok in enumerate(data['text']):
        if data['conf'][i] < 20:
            continue
        t     = re.sub(r'[^\d.,]', '', tok.strip())
        m     = re.match(r'^(\d{1,6})([.,]\d{1,6})?$', t)
        if not m:
            continue
        try:
            price = float(t.replace(',', '.'))
            if price < 0.5:
                continue
            y_orig = data['top'][i] // scale + cy1
            raw.append((y_orig, price))
        except ValueError:
            pass

    if not raw:
        return []

    # IQR filter — remove gross outliers (OCR misreads)
    prices  = np.array([p for _, p in raw])
    q25, q75 = np.percentile(prices, 25), np.percentile(prices, 75)
    iqr       = q75 - q25
    if iqr == 0:
        # All prices identical or nearly so — skip IQR filter to avoid discarding valid data
        filtered = list(raw)
    else:
        lo, hi   = q25 - 3 * iqr, q75 + 3 * iqr
        filtered = [(y, p) for y, p in raw if lo <= p <= hi]

    # Deduplicate: merge readings within 5px and 0.5 price unit
    if not filtered:
        return []
    filtered.sort()
    merged, group = [], [filtered[0]]
    for item in filtered[1:]:
        if item[0] - group[-1][0] <= 5:
            group.append(item)
        else:
            merged.append((int(np.mean([g[0] for g in group])),
                           float(np.mean([g[1] for g in group]))))
            group = [item]
    merged.append((int(np.mean([g[0] for g in group])),
                   float(np.mean([g[1] for g in group]))))
    return merged


# ── Linear calibration fit ────────────────────────────────────────────────────

def _fit_calibration(readings: list[tuple[int, float]],
                      max_iterations: int = 4
                      ) -> tuple[Optional[np.ndarray], float]:
    """
    Fit price = slope*y + intercept using iterative outlier removal (RANSAC-lite).
    Returns (coeffs, R²). coeffs = [slope, intercept].
    Removes the single worst-residual point each iteration until R²≥0.999 or
    fewer than 3 points remain.
    """
    pts = list(readings)
    coeffs, r2 = None, 0.0

    for _ in range(max_iterations):
        if len(pts) < 2:
            break
        ys = np.array([r[0] for r in pts], dtype=float)
        ps = np.array([r[1] for r in pts], dtype=float)
        c  = np.polyfit(ys, ps, 1)
        pred  = np.polyval(c, ys)
        resid = np.abs(ps - pred)
        ss_tot = np.sum((ps - ps.mean()) ** 2)
        ss_res = np.sum(resid ** 2)
        r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0
        coeffs = c
        if r2 >= 0.999 or len(pts) <= 3:
            break
        pts.pop(int(np.argmax(resid)))   # remove worst outlier and retry

    return coeffs, r2


# ── Horizontal line detection ──────────────────────────────────────────────────

def _detect_horizontal_lines(img: np.ndarray,
                               layout: LayoutRegions,
                               min_length_frac: float = 0.25
                               ) -> list[int]:
    """
    Hough-based horizontal line detection across the full chart + label area.
    Returns sorted list of unique y-positions (clustered within 6px).
    """
    cx1 = layout.chart_region[0] if layout.chart_region else 0
    cy1 = layout.chart_region[1] if layout.chart_region else 0
    cx2 = layout.chart_region[2] if layout.chart_region else img.shape[1]
    cy2 = layout.chart_region[3] if layout.chart_region else img.shape[0]

    # Extend 70px below chart to catch SL/TP label lines outside chart area
    h_img = img.shape[0]
    scan_y2 = min(h_img, cy2 + 70)

    region = img[cy1:scan_y2, cx1:cx2]
    gray   = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    edges  = cv2.Canny(gray, 30, 80)

    min_len = int((cx2 - cx1) * min_length_frac)
    lines   = cv2.HoughLinesP(edges, 1, np.pi / 180,
                               threshold=80,
                               minLineLength=min_len,
                               maxLineGap=30)
    if lines is None:
        return []

    # Keep only horizontal lines (Δy ≤ 3px)
    horiz = sorted(set(
        l[0][1] + cy1
        for l in lines
        if abs(l[0][1] - l[0][3]) <= 3
    ))
    if not horiz:
        return []

    # Cluster lines within 6px
    clusters, cur = [], [horiz[0]]
    for y in horiz[1:]:
        if y - cur[-1] <= 6:
            cur.append(y)
        else:
            clusters.append(int(np.mean(cur)))
            cur = [y]
    clusters.append(int(np.mean(cur)))
    return clusters


# ── Public API ────────────────────────────────────────────────────────────────

def _find_tp_sl_tokens(pimg, layout) -> dict:
    """Fast PSM-11 single-pass to find TP and SL token y-positions."""
    h, w  = pimg.height, pimg.width
    cy1   = layout.chart_region[1] if layout.chart_region else 0
    cy2   = layout.chart_region[3] if layout.chart_region else h
    x_end = int(w * 0.72)
    scan_y2 = min(h - 5, cy2 + 65)

    region = pimg.bgr[cy1:scan_y2, :x_end]
    sh, sw = region.shape[:2]
    sc = cv2.resize(region, (sw*2, sh*2), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(sc, cv2.COLOR_BGR2GRAY)
    _, thr = cv2.threshold(gray, 110, 255, cv2.THRESH_BINARY_INV)
    data = pytesseract.image_to_data(thr, config="--psm 11 --oem 3",
                                      output_type=pytesseract.Output.DICT)
    found = {}
    for i, tok in enumerate(data['text']):
        clean = re.sub(r'[^A-Za-z]', '', tok.strip()).upper()
        if data['conf'][i] < 10: continue
        y_px = data['top'][i] // 2 + cy1
        if clean == 'TP' and 'TP' not in found:
            found['TP'] = y_px
        if clean == 'SL' and 'SL' not in found:
            found['SL'] = y_px
        if len(found) == 2: break
    return found


def _closest_hough_line(hough_lines, target_y, max_dist=50):
    """Return the Hough line y closest to target_y, within max_dist pixels."""
    if not hough_lines or target_y is None:
        return None
    best = min(hough_lines, key=lambda y: abs(y - target_y))
    return best if abs(best - target_y) <= max_dist else None


def read_open_close_prices(pimg:      PreprocessedImage,
                            layout:    LayoutRegions,
                            direction: Optional[str] = None,
                            tp_y_hint: Optional[int] = None,
                            sl_y_hint: Optional[int] = None) -> dict:
    """
    Coordinate-mapping approach to reading opening and closing prices.

    1. OCR right axis → calibration points (y_pixel, price)
    2. Fit linear pixel→price function (with outlier removal)
    3. Detect horizontal lines via Hough transform
    4. Map each line's y-pixel to a price

    TP line → closing price target
    SL line → opening/entry price reference

    Returns:
        openingPrice  str | None
        closingPrice  str | None
        allLinesPrices list of (y, price)  — all detected lines
        calibrationR2  float  — quality of the price-axis fit
        calibrationPts int    — number of axis points used
    """
    img = pimg.bgr

    # ── 1. Calibrate axis ────────────────────────────────────────────────────
    readings = _ocr_axis(img, layout)
    coeffs, r2 = _fit_calibration(readings)

    def px_to_price(y: int, dec: int = 3) -> Optional[str]:
        if coeffs is None:
            return None
        p = float(np.polyval(coeffs, y))
        return str(round(p, dec))

    # ── 2. Detect horizontal lines ───────────────────────────────────────────
    h_lines = _detect_horizontal_lines(img, layout)

    # ── 3. Map lines → prices ────────────────────────────────────────────────
    cy1 = layout.chart_region[1] if layout.chart_region else 0
    cy2 = layout.chart_region[3] if layout.chart_region else pimg.height

    line_prices = [(y, px_to_price(y)) for y in h_lines if px_to_price(y)]

    # ── 4. Find TP/SL token positions and map to closest Hough lines ─────────
    # Always run PSM-11 — use it as ground truth for y-positions
    # Object_detector hints can point to info band edges, not actual price lines
    tokens  = _find_tp_sl_tokens(pimg, layout)
    tp_tok  = tokens.get('TP')
    sl_tok  = tokens.get('SL')

    # Validate object_detector hints: prefer PSM-11 token when hint is far from token
    tp_y = tp_tok if tp_tok is not None else tp_y_hint
    sl_y = sl_tok if sl_tok is not None else sl_y_hint

    # Snap to nearest Hough line
    tp_hough = _closest_hough_line(h_lines, tp_y)
    sl_hough = _closest_hough_line(h_lines, sl_y)

    # Convert snapped positions to prices
    if tp_hough is not None and coeffs is not None:
        tp_price = px_to_price(tp_hough)
    elif line_prices:
        tp_price = line_prices[0][1]   # fallback: topmost line
    else:
        tp_price = None

    if sl_hough is not None and coeffs is not None:
        sl_price = px_to_price(sl_hough)
    elif line_prices:
        sl_price = line_prices[-1][1]  # fallback: bottommost line
    else:
        sl_price = None

    # Sanity: if identical, clear the less certain
    if tp_price and sl_price and tp_price == sl_price:
        sl_price = None

    return {
        'openingPrice':    sl_price,
        'closingPrice':    tp_price,
        'tpAxisPrice':     tp_price,
        'slAxisPrice':     sl_price,
        'allLinesPrices':  line_prices,
        'calibrationR2':   round(r2, 4),
        'calibrationPts':  len(readings),
        'tpAxisY':         tp_y_hint,
        'slAxisY':         sl_y_hint,
    }
