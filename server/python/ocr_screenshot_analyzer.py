#!/usr/bin/env python3
"""
OCR Screenshot Analyzer - Alternative to Gemini AI for trading chart data extraction.
Uses Tesseract OCR + OpenCV image preprocessing to extract trading data from screenshots.
Supports TradingView, MT4/MT5, and other common trading platform screenshots.
"""

import sys
import json
import re
import base64
import io
import os
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple

try:
    import pytesseract
    from PIL import Image, ImageEnhance, ImageFilter
    import cv2
    import numpy as np
except ImportError as e:
    print(json.dumps({"success": False, "error": f"Missing OCR dependency: {e}. Install with: pip install pytesseract pillow opencv-python-headless numpy"}))
    sys.exit(1)


# ─── Image Preprocessing ────────────────────────────────────────────────────

def preprocess_image_for_ocr(img_array: np.ndarray) -> List[np.ndarray]:
    """
    Generate multiple preprocessed versions of the image for best OCR results.
    Trading charts are usually dark-background — we handle both light and dark UIs.
    """
    versions = []

    gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)

    # Version 1: Binary threshold — good for light text on dark BG (TradingView dark)
    _, thresh_dark = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY)
    versions.append(thresh_dark)

    # Version 2: Inverted — classic dark-text-on-light for standard OCR
    inverted = cv2.bitwise_not(gray)
    _, thresh_inv = cv2.threshold(inverted, 127, 255, cv2.THRESH_BINARY)
    versions.append(thresh_inv)

    # Version 3: Adaptive threshold — handles non-uniform lighting
    adaptive = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 11, 2
    )
    versions.append(adaptive)

    # Version 4: 2x upscale + sharpening — better for small chart labels
    h, w = gray.shape
    scaled = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(scaled, -1, kernel)
    versions.append(sharpened)

    # Version 5: OTSU auto-threshold
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    versions.append(otsu)

    return versions


def extract_text_from_image(img_array: np.ndarray) -> str:
    """
    Run OCR across multiple preprocessed versions and configs.
    Returns the longest (most complete) result found.
    """
    versions = preprocess_image_for_ocr(img_array)
    configs = [
        "--psm 6 --oem 3",   # Uniform block of text
        "--psm 11 --oem 3",  # Sparse text — find as much as possible
        "--psm 3 --oem 3",   # Fully automatic segmentation
    ]
    best_text = ""
    for img_version in versions:
        pil_img = Image.fromarray(img_version)
        for config in configs:
            try:
                text = pytesseract.image_to_string(pil_img, config=config)
                if len(text.strip()) > len(best_text.strip()):
                    best_text = text
            except Exception:
                continue
    return best_text


def extract_text_regions(img_array: np.ndarray) -> Dict[str, str]:
    """
    Extract text from specific named regions of the image.
    Trading platforms put key data in predictable locations.
    """
    h, w = img_array.shape[:2]
    regions = {}

    # Title bar / symbol area (top 8%)
    regions["top"] = extract_text_from_image(img_array[0:int(h * 0.08), :])

    # Top-right info panel — P&L, account balance (top 15%, right 40%)
    regions["top_right"] = extract_text_from_image(img_array[0:int(h * 0.15), int(w * 0.6):])

    # Bottom bar — timestamps, session info
    regions["bottom"] = extract_text_from_image(img_array[int(h * 0.92):, :])

    # Left sidebar — trade details in some platforms
    regions["left"] = extract_text_from_image(img_array[int(h * 0.1):int(h * 0.9), 0:int(w * 0.2)])

    # Right sidebar — MT4/MT5 trade info
    regions["right"] = extract_text_from_image(img_array[int(h * 0.1):int(h * 0.9), int(w * 0.8):])

    # Center lower area — often shows trade boxes / overlays
    regions["center_lower"] = extract_text_from_image(img_array[int(h * 0.5):int(h * 0.85), int(w * 0.2):int(w * 0.8)])

    # Full image fallback
    regions["full"] = extract_text_from_image(img_array)

    return regions


# ─── Pattern Definitions ─────────────────────────────────────────────────────

INSTRUMENT_PATTERNS = [
    # Major forex pairs
    r'\b(EUR[/\-_]?USD|GBP[/\-_]?USD|USD[/\-_]?JPY|USD[/\-_]?CHF|AUD[/\-_]?USD|NZD[/\-_]?USD|USD[/\-_]?CAD)\b',
    r'\b(EUR[/\-_]?GBP|EUR[/\-_]?JPY|GBP[/\-_]?JPY|EUR[/\-_]?CHF|GBP[/\-_]?CHF|AUD[/\-_]?JPY)\b',
    r'\b(EUR[/\-_]?AUD|EUR[/\-_]?CAD|EUR[/\-_]?NZD|GBP[/\-_]?AUD|GBP[/\-_]?CAD|GBP[/\-_]?NZD)\b',
    r'\b(AUD[/\-_]?CAD|AUD[/\-_]?CHF|AUD[/\-_]?NZD|NZD[/\-_]?CAD|NZD[/\-_]?CHF|CAD[/\-_]?CHF)\b',
    # Metals & commodities
    r'\b(XAU[/\-_]?USD|GOLD|XAUUSD|XAG[/\-_]?USD|SILVER|XAGUSD)\b',
    r'\b(WTI|BRENT|USOIL|UKOIL|NGAS|OIL)\b',
    # Crypto
    r'\b(BTC[/\-_]?USD|BTCUSD|BITCOIN|ETH[/\-_]?USD|ETHUSD|ETHEREUM)\b',
    r'\b(BNB[/\-_]?USD|SOL[/\-_]?USD|ADA[/\-_]?USD|XRP[/\-_]?USD)\b',
    # Indices
    r'\b(US100|NAS100|NASDAQ|USTEC|SPX500|US500|SP500|US30|DOW|DJI|DAX|FTSE)\b',
]

TIMEFRAME_PATTERNS = [
    r'\b(1[Mm]in|5[Mm]in|15[Mm]in|30[Mm]in|1[Hh]our|4[Hh]our|[Dd]aily|[Ww]eekly|[Mm]onthly)\b',
    r'\b([Mm]1|[Mm]5|[Mm]15|[Mm]30|[Hh]1|[Hh]4|[Dd]1|[Ww]1|[Mm][Nn]1)\b',
    r'\b(1[Mm]|5[Mm]|15[Mm]|30[Mm]|1[Hh]|4[Hh]|1[Dd]|1[Ww])\b',
    r'(?:timeframe|TF)[:\s]+([A-Za-z0-9]+)',
    r',\s*([1-9][0-9]?[MHDWmhdw])\s*,',  # TradingView symbol format: "EURUSD, 1H"
]

PRICE_FIELD_PATTERNS = {
    "entry": [
        r'(?:entry|open|opened|price|executed)[:\s@]+([0-9]+\.?[0-9]{2,6})',
        r'(?:^|[\s,])O[:\s]+([0-9]+\.?[0-9]{2,6})',
        r'entry\s+(?:at\s+)?([0-9]+\.?[0-9]{2,6})',
        r'filled\s+(?:at\s+)?([0-9]+\.?[0-9]{2,6})',
    ],
    "stopLoss": [
        r'(?:stop[- ]?loss|S\.?L\.?)[:\s]+([0-9]+\.?[0-9]{2,6})',
        r'\bSL[:\s=]+([0-9]+\.?[0-9]{2,6})',
        r'stop\s+([0-9]+\.?[0-9]{2,6})',
    ],
    "takeProfit": [
        r'(?:take[- ]?profit|T\.?P\.?|target)[:\s]+([0-9]+\.?[0-9]{2,6})',
        r'\bTP[:\s=]+([0-9]+\.?[0-9]{2,6})',
        r'target\s+([0-9]+\.?[0-9]{2,6})',
    ],
    "profitLoss": [
        r'(?:profit|P&L|P/L|PnL|net)[:\s]+([+-]?[0-9,]+\.?[0-9]*)',
        r'([+-][0-9,]+\.[0-9]{2})\s*(?:USD|\$)',
        r'(?:closed|result)[:\s]+([+-]?[0-9,]+\.?[0-9]*)',
        r'\$\s*([+-]?[0-9,]+\.[0-9]{2})',
    ],
    "riskReward": [
        r'R[:\s/]R[:\s]+([0-9]+\.?[0-9]*)',
        r'(?:risk[/:]reward)[:\s]+1[:\s]*([0-9]+\.?[0-9]*)',
        r'\bRR[:\s=]+([0-9]+\.?[0-9]*)',
        r'1\s*:\s*([0-9]+\.?[0-9]*)\s*(?:RR|R:R)',
    ],
    "lotSize": [
        r'(?:lot|size|volume|qty|quantity)[:\s]+([0-9]+\.?[0-9]*)',
        r'([0-9]+\.?[0-9]*)\s+(?:lots?|units?|contracts?)',
    ],
}

DIRECTION_INDICATORS = [
    (r'\bBUY\b|\bLONG\b|\bBuy\b|\bLong\b', 'Long'),
    (r'\bSELL\b|\bSHORT\b|\bSell\b|\bShort\b', 'Short'),
    (r'Buy\s+(?:Limit|Stop|Market)', 'Long'),
    (r'Sell\s+(?:Limit|Stop|Market)', 'Short'),
    (r'[▲↑]', 'Long'),
    (r'[▼↓]', 'Short'),
]

OUTCOME_INDICATORS = [
    (r'\b(?:profit|won|win|TP\s*hit|target\s*(?:hit|reached)|closed\s+in\s+profit)\b', 'Win'),
    (r'\b(?:loss|lost|SL\s*hit|stop\s*(?:hit|out)|stopped\s*out|closed\s+in\s+loss)\b', 'Loss'),
    (r'\b(?:breakeven|break.?even|BE)\b', 'Breakeven'),
]

EXIT_REASON_PATTERNS = [
    (r'\b(?:TP\s*hit|target\s*hit|take\s*profit\s*hit)\b', 'Target Hit'),
    (r'\b(?:SL\s*hit|stop\s*hit|stopped\s*out|stop\s*loss\s*hit)\b', 'Stop Hit'),
    (r'\b(?:manual|manually|closed\s*manually)\b', 'Manual'),
    (r'\b(?:breakeven|BE\s*hit)\b', 'Breakeven'),
]

ORDER_TYPE_INDICATORS = [
    (r'\bMarket\s*(?:Order|Execution|Buy|Sell)?\b', 'Market'),
    (r'\bBuy\s*Limit\b|\bSell\s*Limit\b|\bLimit\s*Order\b', 'Limit'),
    (r'\bBuy\s*Stop\b|\bSell\s*Stop\b|\bStop\s*Order\b', 'Stop'),
]

DATETIME_PATTERNS = [
    r'(\d{4}[-/]\d{2}[-/]\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?)',
    r'(\d{2}[-/]\d{2}[-/]\d{4}\s+\d{2}:\d{2}(?::\d{2})?)',
    r'(\d{1,2}\s+\w{3}\s+\d{4}[,\s]+\d{2}:\d{2})',
    r'(\w{3}\s+\d{1,2},?\s+\d{4}\s+\d{2}:\d{2})',
    r'(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2})',
]


# ─── Extraction Helpers ───────────────────────────────────────────────────────

def safe_float(s: str) -> Optional[float]:
    try:
        return float(str(s).replace(",", "").replace(" ", ""))
    except (ValueError, AttributeError):
        return None


def find_number(pattern: str, text: str, flags: int = re.IGNORECASE) -> Optional[float]:
    m = re.search(pattern, text, flags)
    if m:
        return safe_float(m.group(1))
    return None


def extract_instrument(regions: Dict[str, str]) -> Optional[str]:
    search_order = ["top", "top_right", "full", "left", "right"]
    for key in search_order:
        text = regions.get(key, "")
        for pattern in INSTRUMENT_PATTERNS:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                raw = m.group(1).upper()
                # Normalize separator
                raw = re.sub(r'[-_]', '/', raw)
                if '/' not in raw and len(raw) == 6:
                    raw = raw[:3] + '/' + raw[3:]
                return raw
    return None


def extract_timeframe(all_text: str) -> Optional[str]:
    TF_NORMALIZE = {
        "M1": "1M", "M5": "5M", "M15": "15M", "M30": "30M",
        "H1": "1H", "H4": "4H", "D1": "1D", "W1": "1W",
        "1MIN": "1M", "5MIN": "5M", "15MIN": "15M", "30MIN": "30M",
        "1HOUR": "1H", "4HOUR": "4H", "DAILY": "1D", "WEEKLY": "1W",
        "MN1": "1MO",
    }
    for pattern in TIMEFRAME_PATTERNS:
        m = re.search(pattern, all_text, re.IGNORECASE)
        if m:
            tf = m.group(1).upper()
            return TF_NORMALIZE.get(tf, tf)
    return None


def extract_direction(all_text: str) -> Optional[str]:
    for pattern, direction in DIRECTION_INDICATORS:
        if re.search(pattern, all_text):
            return direction
    return None


def extract_prices(all_text: str) -> Dict[str, Optional[float]]:
    prices = {}
    for field, patterns in PRICE_FIELD_PATTERNS.items():
        for pattern in patterns:
            val = find_number(pattern, all_text, re.IGNORECASE)
            if val is not None:
                prices[field] = val
                break
        if field not in prices:
            prices[field] = None
    return prices


def extract_datetime_str(all_text: str) -> Optional[str]:
    FORMATS = [
        "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
        "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M",
        "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M",
        "%Y.%m.%d %H:%M",
        "%b %d, %Y %H:%M", "%b %d %Y %H:%M",
        "%d %b %Y %H:%M",
    ]
    for pattern in DATETIME_PATTERNS:
        m = re.search(pattern, all_text)
        if m:
            raw = m.group(1).strip()
            for fmt in FORMATS:
                try:
                    dt = datetime.strptime(raw[:len(fmt)], fmt[:len(raw)])
                    return dt.isoformat()
                except ValueError:
                    continue
            return raw
    return None


def extract_outcome(all_text: str, profit_loss: Optional[float]) -> Optional[str]:
    for pattern, outcome in OUTCOME_INDICATORS:
        if re.search(pattern, all_text, re.IGNORECASE):
            return outcome
    if profit_loss is not None:
        if profit_loss > 0.001:
            return "Win"
        elif profit_loss < -0.001:
            return "Loss"
        else:
            return "Breakeven"
    return None


def extract_exit_reason(all_text: str) -> Optional[str]:
    for pattern, reason in EXIT_REASON_PATTERNS:
        if re.search(pattern, all_text, re.IGNORECASE):
            return reason
    return None


def extract_order_type(all_text: str) -> Optional[str]:
    for pattern, otype in ORDER_TYPE_INDICATORS:
        if re.search(pattern, all_text, re.IGNORECASE):
            return otype
    return None


def extract_spread(all_text: str) -> Optional[str]:
    m = re.search(r'(?:spread|sprd)[:\s]+([0-9]+\.?[0-9]*)', all_text, re.IGNORECASE)
    return m.group(1) if m else None


def extract_pip_values(all_text: str, entry: Optional[float], sl: Optional[float], tp: Optional[float]) -> Dict[str, Optional[float]]:
    sl_dist = find_number(r'(?:SL|stop)[:\s\-]+([0-9]+\.?[0-9]*)\s*(?:pips?|pts?|points?)', all_text, re.IGNORECASE)
    tp_dist = find_number(r'(?:TP|target)[:\s\-]+([0-9]+\.?[0-9]*)\s*(?:pips?|pts?|points?)', all_text, re.IGNORECASE)

    if sl_dist is None and entry is not None and sl is not None:
        sl_dist = round(abs(entry - sl) * 10000, 1)
    if tp_dist is None and entry is not None and tp is not None:
        tp_dist = round(abs(tp - entry) * 10000, 1)

    return {"stopLossDistance": sl_dist, "takeProfitDistance": tp_dist}


def calculate_rr(entry: Optional[float], sl: Optional[float], tp: Optional[float]) -> Optional[float]:
    if entry and sl and tp:
        risk = abs(entry - sl)
        reward = abs(tp - entry)
        if risk > 0:
            return round(reward / risk, 2)
    return None


def derive_session(entry_time: Optional[str]) -> Dict[str, Optional[str]]:
    if not entry_time:
        return {"sessionName": None, "sessionPhase": None}
    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"]:
        try:
            dt = datetime.strptime(entry_time[:19], fmt)
            h = dt.hour
            if 0 <= h < 7:
                return {"sessionName": "Tokyo", "sessionPhase": "Active"}
            elif 7 <= h < 8:
                return {"sessionName": "London", "sessionPhase": "Pre-Open"}
            elif 8 <= h < 12:
                return {"sessionName": "London", "sessionPhase": "Active"}
            elif 12 <= h < 13:
                return {"sessionName": "London-NY Overlap", "sessionPhase": "Open"}
            elif 13 <= h < 17:
                return {"sessionName": "New York", "sessionPhase": "Active"}
            elif 17 <= h < 21:
                return {"sessionName": "New York", "sessionPhase": "Close"}
            else:
                return {"sessionName": "Sydney", "sessionPhase": "Active"}
        except ValueError:
            continue
    return {"sessionName": None, "sessionPhase": None}


def get_day_of_week(entry_time: Optional[str]) -> Optional[str]:
    if not entry_time:
        return None
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"]:
        try:
            dt = datetime.strptime(entry_time[:10], fmt[:10])
            return days[dt.weekday()]
        except ValueError:
            continue
    return None


def confidence_score(instrument: Optional[str], prices: Dict, direction: Optional[str], timeframe: Optional[str]) -> str:
    score = 0
    if instrument:
        score += 30
    if direction:
        score += 20
    if prices.get("entry"):
        score += 20
    if prices.get("stopLoss"):
        score += 10
    if prices.get("takeProfit"):
        score += 10
    if timeframe:
        score += 10
    if score >= 70:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


# ─── Main Entry ───────────────────────────────────────────────────────────────

def analyze_trading_screenshot(image_data: str) -> Dict[str, Any]:
    """
    Analyze a base64-encoded trading screenshot using OCR.
    Returns fields compatible with the journal entry schema.
    """
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(image_data)
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        return {"success": False, "error": f"Failed to decode image: {e}"}

    img_array = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    regions = extract_text_regions(img_array)
    all_text = "\n".join(regions.values())

    prices = extract_prices(all_text)
    entry_time = extract_datetime_str(all_text)
    direction = extract_direction(all_text)
    instrument = extract_instrument(regions)
    timeframe = extract_timeframe(all_text)
    outcome = extract_outcome(all_text, prices.get("profitLoss"))
    session_info = derive_session(entry_time)
    pip_distances = extract_pip_values(all_text, prices.get("entry"), prices.get("stopLoss"), prices.get("takeProfit"))

    rr = prices.get("riskReward") or calculate_rr(prices.get("entry"), prices.get("stopLoss"), prices.get("takeProfit"))

    fields = {
        "instrument": instrument,
        "direction": direction,
        "orderType": extract_order_type(all_text),
        "entryPrice": prices.get("entry"),
        "stopLoss": prices.get("stopLoss"),
        "takeProfit": prices.get("takeProfit"),
        "stopLossDistancePips": pip_distances.get("stopLossDistance"),
        "takeProfitDistancePips": pip_distances.get("takeProfitDistance"),
        "lotSize": prices.get("lotSize"),
        "riskReward": rr,
        "entryTime": entry_time,
        "exitTime": None,
        "dayOfWeek": get_day_of_week(entry_time),
        "tradeDuration": None,
        "outcome": outcome,
        "profitLoss": prices.get("profitLoss"),
        "pipsGainedLost": None,
        "mae": None,
        "mfe": None,
        "primaryExitReason": extract_exit_reason(all_text),
        "sessionName": session_info.get("sessionName"),
        "sessionPhase": session_info.get("sessionPhase"),
        "entryTF": timeframe,
        "spreadAtEntry": extract_spread(all_text),
        "aiExtractedRaw": {
            "method": "ocr",
            "ocrConfidence": confidence_score(instrument, prices, direction, timeframe),
            "rawTextSample": all_text[:300],
            "note": "Extracted via Tesseract OCR. Review and correct any inaccurate fields.",
        },
    }

    return {"success": True, "fields": fields}


def main():
    image_data = sys.stdin.read().strip()
    if not image_data:
        print(json.dumps({"success": False, "error": "No image data provided via stdin"}))
        sys.exit(1)

    result = analyze_trading_screenshot(image_data)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
