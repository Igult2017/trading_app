"""
analyzer.py  (v8 — JForex calibrated, timeframe removed)
──────────────────────────────────────────────────────────
Orchestrates the full pipeline:

  image_preprocessor → layout_detector → object_detector
  → candle_detector → ocr_engine → trade_parser
  → trade_logic_engine → validation_engine → JSON output

Timeframe is NOT extracted (user-entered field).
Entry arrow detection calibrated for JForex orange (HSV 14-26).
"""

import sys
import json
import traceback
import re
import numpy as np
import cv2

from image_preprocessor   import load_from_b64, PreprocessedImage
from layout_detector      import detect_layout
from object_detector      import detect_objects
from candle_detector      import detect_candles, find_entry_candle_index
from ocr_engine           import run_all_ocr
from trade_parser         import (parse_all, calc_sl_tp_prices,
                                   find_price_in_tokens)
from price_axis_reader    import read_open_close_prices
from trade_logic_engine   import (evaluate_outcome_from_candles,
                                   outcome_from_closed_pl,
                                   achieved_rr_from_pixels)
from validation_engine    import validate


# ── Direction ─────────────────────────────────────────────────────────────────


def _calc_closing_price(entry_price_str, direction: str,
                         pl_points, instrument: str) -> object:
    """
    Compute closing price from entry price + P/L points.
    closing = entry ± (pl_points × point_size)
    Long:  closing = entry + pl_points × point_size
    Short: closing = entry - pl_points × point_size
    """
    from trade_parser import _instrument_specs
    if not entry_price_str or pl_points is None:
        return None
    try:
        entry  = float(str(entry_price_str))
        pt_sz, _, _, dec = _instrument_specs(instrument)
        if direction is None:
            import sys
            print("[OCR WARNING] _calc_closing_price: direction is None, defaulting to Long", file=sys.stderr)
        sign   = 1 if (direction or "Long").lower() == "long" else -1
        return round(entry + sign * float(pl_points) * pt_sz, dec)
    except Exception:
        return None



def _good_calibration(axis_prices: dict) -> bool:
    """True if the coordinate-mapping calibration is reliable."""
    return (axis_prices.get("calibrationR2", 0) >= 0.99 and
            axis_prices.get("calibrationPts", 0) >= 3)


def _hybrid_open_price(axis_prices, entry_price, direction, sl_pts, instrument):
    """Opening price: axis mapping if calibration good, else entry price."""
    if _good_calibration(axis_prices) and axis_prices.get("openingPrice"):
        return axis_prices["openingPrice"]
    return entry_price  # entry price IS the opening price


def _hybrid_close_price(axis_prices, entry_price, direction,
                         closed_pl_points, tp_pts, instrument):
    """
    Closing price strategy:
      1. Axis-mapped (coordinate mapping) — if calibration R²≥0.99
      2. entry ± closed_pl_points × point_size — if trade is closed (Closed P/L known)
      3. entry ± tp_pts × point_size — planned TP target (for open trades)
    """
    if _good_calibration(axis_prices) and axis_prices.get("closingPrice"):
        return axis_prices["closingPrice"]
    # Use closed P/L for actual closing price (most accurate)
    if closed_pl_points is not None and entry_price is not None:
        return _calc_closing_price(entry_price, direction,
                                    closed_pl_points, instrument or "")
    # Use TP distance for planned closing price
    if tp_pts is not None and entry_price is not None:
        return _calc_closing_price(entry_price, direction,
                                    tp_pts, instrument or "")
    return None


def _detect_direction(pimg: PreprocessedImage,
                      layout=None) -> str | None:
    """
    Detect trade direction from info panel band colour.
    Green band = Long, Red/maroon band = Short.
    Falls back to right-half chart scan if layout not available.
    Using the info panel is more reliable because the trade progress
    fill (green for profit, red for loss) can fool a chart-wide scan.
    """
    h, w = pimg.height, pimg.width

    # Prefer info panel band — top 20px of detected panel
    if layout is not None and layout.info_panel is not None:
        ix1, iy1, ix2, iy2 = layout.info_panel
        band = pimg.hsv[iy1:min(iy1+25, iy2), ix1:ix2, :]
        g = int(cv2.inRange(band, (45, 40, 40), (110, 255, 255)).sum()) // 255
        r1 = int(cv2.inRange(band, (0,  60, 40), (15,  255, 255)).sum()) // 255
        r2 = int(cv2.inRange(band, (165, 60, 40), (180, 255, 255)).sum()) // 255
        r = r1 + r2
        if max(g, r) > 50:
            return "Long" if g > r else "Short"

    # Fallback: right half of image (works when no trade progress fill)
    panel = pimg.hsv[:, w // 2:, :]
    green = cv2.inRange(panel, (45, 80, 80),  (90, 255, 255))
    red1  = cv2.inRange(panel, (0,  80, 80),  (10, 255, 255))
    red2  = cv2.inRange(panel, (170, 80, 80), (180, 255, 255))
    red   = cv2.bitwise_or(red1, red2)
    g = int(green.sum()) // 255
    r = int(red.sum())   // 255
    if g == 0 and r == 0:
        return None
    return "Long" if g > r else "Short"


# ── Entry price ───────────────────────────────────────────────────────────────

def _detect_entry_price(pimg: PreprocessedImage, objects, tokens, layout):
    """
    Three strategies in priority order:
      1. Orange price label next to entry arrow (JForex: HSV hue 14-26)
      2. Yellow horizontal entry line
      3. PSM-11 token that looks like a price in the chart zone
    """
    import pytesseract
    h, w = pimg.height, pimg.width

    def _ocr_strip(y1, y2, x1=0, x2=None, scale=6, psm=7):
        x2  = x2 or w
        bgr = pimg.bgr[max(0,y1):min(h,y2), max(0,x1):min(w,x2)]
        if bgr.size == 0: return ""
        sh, sw = bgr.shape[:2]
        sc    = cv2.resize(bgr, (sw*scale, sh*scale), interpolation=cv2.INTER_CUBIC)
        gray  = cv2.cvtColor(sc, cv2.COLOR_BGR2GRAY)
        _, thr = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
        return pytesseract.image_to_string(thr, config=f"--psm {psm} --oem 3").strip()

    def _extract_price(text):
        text = re.sub(r'(\d),(\d{3})', r'\1\2', text)
        m = re.search(r'\b(\d{1,4}[.,]\d{3,6})\b', text)
        return m.group(1).replace(',', '.') if m else None

    # 1. Orange label near entry arrow
    orange = cv2.inRange(pimg.hsv, (14, 120, 120), (26, 255, 255))
    orange[int(h*0.80):, :] = 0
    orange[:int(h*0.08), :] = 0
    row_sums = orange.sum(axis=1)
    orange_ys = np.where(row_sums > 300)[0]
    if len(orange_ys) > 0:
        oy = int(orange_ys.mean())
        price = _extract_price(_ocr_strip(oy - 10, oy + 12, scale=4, psm=7))
        if price: return price

    # 2. Yellow horizontal entry line
    yellow = cv2.inRange(pimg.hsv, (15, 100, 140), (40, 255, 255))
    yellow[int(h*0.80):, :] = 0
    ry = np.where(yellow.sum(axis=1) > 300)[0]
    if len(ry):
        price = _extract_price(
            _ocr_strip(int(ry[0]) - 2, int(ry[0]) + 20, scale=4, psm=7))
        if price: return price

    # 3. Token scan
    return find_price_in_tokens(
        tokens, layout.chart_top_frac, layout.chart_bottom_frac, h)


# ── Confidence ────────────────────────────────────────────────────────────────

def _confidence(parsed, val_report) -> str:
    key_fields = [parsed.instrument, parsed.direction,
                  parsed.sl_pts, parsed.entry_price_str,
                  parsed.risk_reward, parsed.entry_time]
    filled = sum(1 for f in key_fields if f is not None)
    if val_report.has_error:                      return "low"
    if filled >= 5 and not val_report.warnings(): return "high"
    if filled >= 3:                               return "medium"
    return "low"


# ── Main pipeline ─────────────────────────────────────────────────────────────

def analyze(b64_or_img) -> dict:
    # 1. Load
    if isinstance(b64_or_img, str):
        pimg = PreprocessedImage(load_from_b64(b64_or_img))
    else:
        pimg = b64_or_img

    # 2. Layout
    layout = detect_layout(pimg)

    # 3. Direction
    direction = _detect_direction(pimg, layout=layout)


    # 4. Objects (arrow + level lines)
    objects = detect_objects(pimg, layout, direction=direction)

    # 4b. Opening/closing prices — pass TP/SL y-hints from object_detector
    _tp_y = objects.tp_line.y if objects.tp_line else None
    _sl_y = objects.sl_line.y if objects.sl_line else None
    axis_prices = read_open_close_prices(
        pimg, layout, direction,
        tp_y_hint=_tp_y, sl_y_hint=_sl_y)

    # 5. Candles
    candles = detect_candles(pimg, layout)

    # 6. Entry candle index
    entry_x = objects.entry_arrow.x if objects.entry_arrow else None
    entry_y = objects.entry_arrow.y if objects.entry_arrow else None
    entry_candle_idx = find_entry_candle_index(candles, entry_x)

    # 7. OCR
    ocr_result = run_all_ocr(pimg, layout)

    # 8. Parse text
    parsed = parse_all(ocr_result)
    if direction and not parsed.direction:
        parsed.direction = direction

    # 9. Entry price
    entry_price = _detect_entry_price(
        pimg, objects, ocr_result.psm11_tokens, layout)
    parsed.entry_price_str = entry_price

    # 10. SL/TP prices
    sl_price, sl_pips, tp_price, tp_pips, tp_pts_used, tp_from_rr = \
        calc_sl_tp_prices(
            entry_price, parsed.direction,
            parsed.sl_pts, parsed.tp_pts,
            parsed.risk_reward, parsed.instrument)

    # 11. Outcome (chronological candle scan)
    tp_y = objects.tp_line.y if objects.tp_line else None
    sl_y = objects.sl_line.y if objects.sl_line else None

    trade_outcome = evaluate_outcome_from_candles(
        candles          = candles,
        entry_candle_idx = entry_candle_idx,
        tp_y             = tp_y,
        sl_y             = sl_y,
        entry_y          = entry_y,
        direction        = parsed.direction or "Long",
    )

    # Text override: Closed P/L beats visual
    text_outcome   = outcome_from_closed_pl(parsed.closed_pl_usd)
    final_outcome  = text_outcome if text_outcome is not None else trade_outcome.outcome
    outcome_source = ("text"   if text_outcome      is not None else
                      "visual" if trade_outcome.outcome is not None else "none")

    achieved_rr = trade_outcome.achieved_rr
    if achieved_rr is None and entry_y is not None:
        achieved_rr = achieved_rr_from_pixels(
            entry_y, tp_y, sl_y, parsed.direction or "Long")

    # 12. Validation
    val_report = validate(
        instrument           = parsed.instrument,
        direction            = parsed.direction,
        entry_price_str      = entry_price,
        sl_price_str         = str(sl_price) if sl_price else None,
        tp_price_str         = str(tp_price) if tp_price else None,
        sl_pts               = parsed.sl_pts,
        tp_pts               = tp_pts_used,
        lot_size             = parsed.lot_size,
        risk_reward          = parsed.risk_reward,
        outcome              = final_outcome,
        closed_pl_usd        = parsed.closed_pl_usd,
        entry_time           = parsed.entry_time,
        exit_time            = parsed.exit_time,
        confidence           = "medium",
        entry_arrow_y        = entry_y,
        tp_line_y            = tp_y,
        sl_line_y            = sl_y,
        candles_detected     = len(candles),
        level_lines_detected = len(objects.level_lines),
    )

    confidence = _confidence(parsed, val_report)

    # 13. Assemble output — timeframe field is absent
    pl_usd    = parsed.closed_pl_usd    or parsed.open_pl_usd
    pl_points = parsed.closed_pl_points or parsed.open_pl_points

    fields = {
        "instrument":         parsed.instrument,
        "pairCategory":       parsed.pair_category,
        # timeframe intentionally omitted
        "direction":          parsed.direction,
        "entryPrice":         entry_price,
        # Opening price = SL line right-edge label (SL placed relative to entry)
        # Closing price = TP line right-edge label (TP target)
        # Opening/closing price:
        # - Good calibration (R²≥0.99, ≥3 pts) → coordinate-mapped axis prices
        # - Weak calibration (forex dim axis) → arithmetic from entry + P/L
        "openingPrice":       _hybrid_open_price(
                                  axis_prices, entry_price,
                                  parsed.direction, parsed.sl_pts,
                                  parsed.instrument),
        # Closing price: axis-mapped (if good calib) or entry ± TP distance
        # Use tp_pts for target price, closed_pl_pts for actual achieved price
        "closingPrice":       _hybrid_close_price(
                                  axis_prices, entry_price,
                                  parsed.direction,
                                  parsed.closed_pl_points,  # actual close only
                                  parsed.tp_pts, parsed.instrument),

        "stopLoss":           str(sl_price)   if sl_price   is not None else None,
        "stopLossPoints":     parsed.sl_pts,
        "stopLossPips":       sl_pips,
        "stopLossUSD":        parsed.sl_usd,
        "takeProfit":         str(tp_price)   if tp_price   is not None else None,
        "takeProfitPoints":   tp_pts_used,
        "takeProfitPips":     tp_pips,
        "takeProfitUSD":      parsed.tp_usd,
        "tpCalculatedFromRR": tp_from_rr,
        # ── Planned / Actual SL & TP (for journal UI fields) ──────────────
        # Planned = from setup screenshot labels. Actual = filled by analyze_pair().
        "plannedSLPoints":    parsed.sl_pts,
        "plannedSLPips":      sl_pips,
        "plannedTPPoints":    tp_pts_used,
        "plannedTPPips":      tp_pips,
        "actualSLPoints":     None,   # filled by analyze_pair() if outcome=Loss
        "actualSLPips":       None,
        "actualTPPoints":     None,   # filled by analyze_pair() if outcome=Win
        "actualTPPips":       None,
        "lotSize":            parsed.lot_size,
        "units":              parsed.units,
        "contractSize":       parsed.contract_size,
        "openPLPoints":       pl_points,
        "openPLUSD":          pl_usd,
        "outcome":            final_outcome,
        "tradeIsOpen":        (trade_outcome.trade_is_open
                               if text_outcome is None else False),
        "riskReward":         parsed.risk_reward,
        "plannedRR":          parsed.risk_reward,
        "takeProfitR":        parsed.risk_reward,
        # priceExcursionR: how many R did price travel (pixel-based, chart geometry)
        # Useful for open trades — measures move relative to SL distance
        "priceExcursionR":    achieved_rr,
        # achievedRR: RR from outcome screenshot info panel (set by analyze_pair)
        "achievedRR":         (parsed.risk_reward
                               if final_outcome in ("Win", "Loss") else None),
        "runUpPoints":        parsed.run_up_pts,
        "runUpUSD":           parsed.run_up_usd,
        "drawdownPoints":     parsed.drawdown_pts,
        "drawdownUSD":        parsed.drawdown_usd,
        "entryTime":          parsed.entry_time,
        "exitTime":           parsed.exit_time,
        "tradeDuration":      parsed.trade_duration,
        "dayOfWeek":          parsed.day_of_week,
        "sessionName":        parsed.session_name,
        "sessionPhase":       parsed.session_phase,
    }

    debug = {
        "tpAxisPrice":          axis_prices.get("tpAxisPrice"),
        "slAxisPrice":          axis_prices.get("slAxisPrice"),
        "tpAxisY":              axis_prices.get("tpAxisY"),
        "slAxisY":              axis_prices.get("slAxisY"),
        "calibrationR2":        axis_prices.get("calibrationR2"),
        "calibrationPts":       axis_prices.get("calibrationPts"),
        "allLinesPrices":       axis_prices.get("allLinesPrices", []),
        "entryArrowX":          entry_x,
        "entryArrowY":          entry_y,
        "entryArrowConfidence": (objects.entry_arrow.confidence
                                  if objects.entry_arrow else None),
        "tpLineY":              tp_y,
        "slLineY":              sl_y,
        "levelLinesDetected":   [l.y for l in objects.level_lines],
        "candlesDetected":      len(candles),
        "entryCandelIndex":     entry_candle_idx,
        "candlesAfterEntry":    trade_outcome.candles_after_entry,
        "firstTouchCandle":     trade_outcome.first_touch_candle_idx,
        "outcomeSource":        outcome_source,
        "outcomeDebug":         trade_outcome.debug,
        "layoutConfidence":     layout.confidence,
        "validationSummary":    val_report.summary(),
        "validationIssues":     [
            {"field": i.field, "severity": i.severity, "message": i.message}
            for i in val_report.issues
        ],
        "rawLines":             ocr_result.all_lines,
    }

    return {
        "success":    True,
        "fields":     fields,
        "confidence": confidence,
        "validation": {
            "passed":  val_report.passed,
            "summary": val_report.summary(),
            "issues":  debug["validationIssues"],
        },
        "aiExtractedRaw": {
            "method":        "ocr_v8_jforex",
            "ocrConfidence": confidence,
            "debug":         debug,
            "notes": [
                "v8: Modular pipeline, JForex-calibrated.",
                "Timeframe intentionally not extracted (user-entered field).",
                "Entry arrow: JForex orange HSV (14,120,120)-(26,255,255), min area 8px.",
                "Info panel: white-pixel isolation on green band.",
                "TP/SL labels: mid-brightness row detection, inv thr=110.",
                "Outcome: post-entry candles only — pre-entry candles excluded.",
                "Closed P/L overrides visual outcome when present.",
                "Open P/L never used for outcome.",
            ],
        },
    }






def _calc_actual_sl_tp(f_setup: dict, f_outcome: dict,
                        outcome: str, instrument: str) -> dict:
    """
    Compute actualSL and actualTP from Closed P/L points vs planned distances.

    actualTP (outcome=Win):
      = Closed P/L points from outcome screenshot (the points actually captured)
      If Closed P/L unavailable, fall back to plannedTPPoints (full TP was hit)

    actualSL (outcome=Loss):
      = abs(Closed P/L points) from outcome screenshot (the points actually lost)
      If Closed P/L unavailable, fall back to plannedSLPoints (full SL was hit)

    Pip conversion: for standard pairs, 1 point = 1 pip.
    For JPY pairs, indices: use instrument_specs factor.
    """
    from trade_parser import _instrument_specs   # reuse existing conversion table
    _, _, pts_to_pips, _ = _instrument_specs(instrument)

    def to_pips(pts):
        if pts is None: return None
        return round(abs(pts) * pts_to_pips, 1)

    result = {
        "actualSLPoints": None, "actualSLPips": None,
        "actualTPPoints": None, "actualTPPips": None,
    }

    # Closed P/L points from outcome screenshot
    # openPLPoints holds whichever is set (closed or open)
    closed_pts = f_outcome.get("openPLPoints")

    if outcome == "Win":
        pts = abs(closed_pts) if closed_pts is not None else f_setup.get("plannedTPPoints")
        result["actualTPPoints"] = pts
        result["actualTPPips"]   = to_pips(pts)
        result["actualSLPoints"] = 0.0
        result["actualSLPips"]   = 0.0

    elif outcome == "Loss":
        pts = abs(closed_pts) if closed_pts is not None else f_setup.get("plannedSLPoints")
        result["actualSLPoints"] = pts
        result["actualSLPips"]   = to_pips(pts)
        result["actualTPPoints"] = 0.0
        result["actualTPPips"]   = 0.0

    # Open trade: both remain None (not yet resolved)
    return result


# ── Screenshot classification ────────────────────────────────────────────────

def _classify_screenshot(result: dict) -> str:
    """
    Classify a screenshot as 'outcome' or 'open' based on OCR signals.

    'outcome' : Closed P/L present → trade has resolved (Win or Loss)
    'open'    : Open P/L only, no Closed P/L → trade still running or
                TP was hit and is visible as a visual outcome in the chart
                (trade_logic_engine will have already set outcome='Win' via candle scan)
    """
    f = result["fields"]
    d = result.get("aiExtractedRaw", {}).get("debug", {})

    # Strongest signal: Closed P/L text was extracted
    has_closed_pl = (f.get("openPLUSD") is not None and
                     result.get("screenshot_type") == "closed")

    # Check raw lines for "Closed P/L" text
    raw_lines = d.get("rawLines", [])
    closed_pl_in_text = any(
        "closed" in l.lower() and ("p/l" in l.lower() or "pl" in l.lower())
        for l in raw_lines
    )

    # outcome already resolved by trade_logic_engine (visual candle scan or text)
    outcome_source = d.get("outcomeSource", "none")
    outcome        = f.get("outcome")

    if closed_pl_in_text or outcome_source == "text":
        return "outcome"
    if outcome in ("Win", "Loss"):
        return "outcome"
    return "open"


# ── Two-screenshot workflow ───────────────────────────────────────────────────

def _pips_gained_lost(f: dict) -> dict:
    """Extract pips/points gained or lost. Used when SL was hit."""
    result = {}
    pl_pts = f.get("openPLPoints")
    pl_usd = f.get("openPLUSD")
    if pl_pts is not None:
        result["pipsGainedLost"]    = pl_pts
        result["pipsGainedLostUSD"] = pl_usd
    return result


def analyze_pair(img_a, img_b) -> dict:
    """
    Two-screenshot pipeline — order does NOT matter.

    The function analyses both screenshots independently, then auto-classifies
    which is the SETUP (open trade) and which is the OUTCOME (closed/resolved).

    Classification:
      - "Closed P/L" in OCR text, OR outcome already resolved by candle scan
        → that screenshot is the OUTCOME
      - Otherwise → SETUP (open trade, entry arrow visible)

    If both are 'open'  → treat as two independent analyses; use the one with
                          more fields as primary.
    If both are 'outcome' → the one with Closed P/L text is outcome; other is setup.

    TP recording rules:
      outcome = Win  → takeProfit kept from setup, takeProfitR = RR (decimal)
      outcome = Loss → takeProfit cleared, pipsGainedLost recorded instead
      outcome = None (still open) → takeProfit = planned TP, tradeIsOpen = True

    takeProfitR is the decimal reward ratio only (e.g. RR=6 → takeProfitR=6.0).
    """
    r_a = analyze(img_a)
    r_b = analyze(img_b)

    type_a = _classify_screenshot(r_a)
    type_b = _classify_screenshot(r_b)

    # ── Assign setup vs outcome ───────────────────────────────────────────────
    if type_a == "outcome" and type_b == "open":
        r_outcome, r_setup = r_a, r_b
    elif type_b == "outcome" and type_a == "open":
        r_outcome, r_setup = r_b, r_a
    elif type_a == "outcome" and type_b == "outcome":
        # Both closed — the one with more fields is likely the fuller outcome shot
        score_a = sum(1 for v in r_a["fields"].values() if v is not None)
        score_b = sum(1 for v in r_b["fields"].values() if v is not None)
        r_outcome = r_a if score_a >= score_b else r_b
        r_setup   = r_b if score_a >= score_b else r_a
    else:
        # Both open — use the one with entry arrow + SL/TP as setup,
        # the other (more progressed) as outcome
        score_a = sum(1 for v in r_a["fields"].values() if v is not None)
        score_b = sum(1 for v in r_b["fields"].values() if v is not None)
        r_setup   = r_a if score_a >= score_b else r_b
        r_outcome = r_b if score_a >= score_b else r_a

    f_setup   = r_setup["fields"]
    f_outcome = r_outcome["fields"]

    # ── Outcome and RR ────────────────────────────────────────────────────────
    outcome = f_outcome.get("outcome") or f_setup.get("outcome")
    rr      = f_outcome.get("riskReward") or f_setup.get("riskReward")

    # ── TP decision ───────────────────────────────────────────────────────────
    sl_hit    = (outcome == "Loss")
    tp_hit    = (outcome == "Win")
    still_open = outcome is None

    if sl_hit:
        # Trade went against — clear TP, record pips lost
        tp_price_out = None
        tp_pts_out   = None
        tp_pips_out  = None
        tp_usd_out   = None
        tp_r_out     = None
        pips_fields  = _pips_gained_lost(f_outcome)
    else:
        # Win or still open — keep planned TP from setup screenshot
        tp_price_out = f_setup.get("takeProfit")
        tp_pts_out   = f_setup.get("takeProfitPoints")
        tp_pips_out  = f_setup.get("takeProfitPips")
        tp_usd_out   = f_setup.get("takeProfitUSD")
        tp_r_out     = rr   # decimal only
        pips_fields  = {}

    # ── Merge: setup as base, outcome overrides resolution fields ─────────────
    merged = dict(f_setup)
    for key in ("outcome", "tradeIsOpen", "openPLPoints", "openPLUSD",
                "runUpPoints", "runUpUSD", "drawdownPoints", "drawdownUSD",
                "exitTime", "tradeDuration", "achievedRR", "priceExcursionR"):
        if f_outcome.get(key) is not None:
            merged[key] = f_outcome[key]

    merged["takeProfit"]       = tp_price_out
    merged["takeProfitPoints"] = tp_pts_out
    merged["takeProfitPips"]   = tp_pips_out
    merged["takeProfitUSD"]    = tp_usd_out
    merged["riskReward"]       = rr
    merged["takeProfitR"]      = tp_r_out
    merged["outcome"]          = outcome
    merged["tradeIsOpen"]      = still_open
    merged.update(pips_fields)

    # ── Planned / Actual SL & TP ──────────────────────────────────────────
    # Planned always comes from setup screenshot
    merged["plannedSLPoints"] = f_setup.get("plannedSLPoints") or f_setup.get("stopLossPoints")
    merged["plannedSLPips"]   = f_setup.get("plannedSLPips")   or f_setup.get("stopLossPips")
    merged["plannedTPPoints"] = f_setup.get("plannedTPPoints") or f_setup.get("takeProfitPoints")
    merged["plannedTPPips"]   = f_setup.get("plannedTPPips")   or f_setup.get("takeProfitPips")
    # Actual computed from outcome
    actual = _calc_actual_sl_tp(f_setup, f_outcome, outcome,
                                 merged.get("instrument") or "")
    merged.update(actual)

    # ── Planned RR = setup screenshot RR
    # ── Achieved RR = outcome screenshot RR (what JForex calculated at close)
    merged["plannedRR"]  = f_setup.get("riskReward")
    merged["achievedRR"] = f_outcome.get("riskReward")

    # dayOfWeek / session: prefer setup, fall back to outcome
    for key in ("dayOfWeek", "sessionName", "sessionPhase", "entryTime"):
        if merged.get(key) is None and f_outcome.get(key) is not None:
            merged[key] = f_outcome[key]

    # Recompute trade duration
    entry_t = merged.get("entryTime")
    exit_t  = merged.get("exitTime")
    if entry_t and exit_t and not merged.get("tradeDuration"):
        from datetime import datetime
        fmts = ["%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"]
        def _p(s):
            for fmt in fmts:
                try: return datetime.strptime(str(s)[:len(fmt)], fmt)
                except ValueError: continue
            return None
        te, tx = _p(entry_t), _p(exit_t)
        if te and tx:
            delta   = abs(tx - te)
            total_h = int(delta.total_seconds() // 3600)
            rem_m   = int((delta.total_seconds() % 3600) // 60)
            d, rh   = delta.days, total_h % 24
            merged["tradeDuration"] = (
                f"{total_h}h {rem_m}m" if total_h < 24 and rem_m else
                f"{total_h}h"          if total_h < 24 else
                f"{d}d {rh}h"          if rh else f"{d}d"
            )

    confidence = ("high"   if r_setup["confidence"] == "high" and
                               r_outcome["confidence"] in ("high","medium")
                  else "medium" if r_setup["confidence"] in ("high","medium")
                  else "low")

    return {
        "success":     True,
        "fields":      merged,
        "confidence":  confidence,
        "validation":  r_setup["validation"],
        "screenshotSetup":   r_setup,
        "screenshotOutcome": r_outcome,
        "screenshotClassification": {
            "imgA": type_a,
            "imgB": type_b,
            "assignedSetup":   "imgA" if r_setup is r_a else "imgB",
            "assignedOutcome": "imgA" if r_outcome is r_a else "imgB",
        },
        "aiExtractedRaw": {
            "method": "ocr_v8_jforex_pair",
            "notes": [
                "Order-independent: auto-classifies setup vs outcome from OCR signals.",
                "Outcome signal: Closed P/L in text, or outcome resolved by candle scan.",
                "Win → takeProfit kept, takeProfitR = RR decimal from outcome screenshot.",
                "Loss → takeProfit cleared, pipsGainedLost recorded instead.",
                "Open → takeProfit = planned TP, tradeIsOpen=True.",
                "takeProfitR is reward decimal only (RR=6 → 6.0, not 7).",
            ],
        },
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    b64 = sys.stdin.read().strip()
    try:
        result = analyze(b64)
    except Exception as e:
        result = {"success": False, "error": str(e),
                   "traceback": traceback.format_exc()}
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
