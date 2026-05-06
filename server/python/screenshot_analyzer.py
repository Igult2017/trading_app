import os
import json
import base64
import re
from datetime import datetime, timedelta
from google import genai

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")

EXTRACTION_PROMPT = """You are a trading chart screenshot analyzer. Extract ALL visible trading data from this chart screenshot.

Return ONLY valid JSON with these fields (use null for anything not visible):

{
  "instrument": "e.g. EUR/USD, XAU/USD, NAS100, BTCUSD",
  "pairCategory": "Forex or Crypto or Commodity or Index or Stock",
  "timeframe": "e.g. 4H, 1H, 15M, 1D",
  "direction": "Long or Short",
  "orderType": "Market or Limit or Stop",
  "entryPrice": number or null,
  "openingPrice": number or null (price at which position was opened, may equal entryPrice),
  "closingPrice": number or null (price at which position was closed),
  "stopLoss": number or null (stop loss price level),
  "takeProfit": number or null (take profit price level),
  "plannedSlPips": number or null (planned SL distance in pips before trade),
  "plannedTpPips": number or null (planned TP distance in pips before trade),
  "actualSlPips": number or null (actual pips lost if stopped out),
  "actualTpPips": number or null (actual pips gained if TP hit),
  "stopLossDistance": number or null (SL distance in pips/points as shown on chart),
  "takeProfitDistance": number or null (TP distance in pips/points as shown on chart),
  "lotSize": number or null (standard lot size e.g. 0.01, 1.0),
  "units": number or null (position size in units e.g. 1000, 100000),
  "contractSize": number or null (contract size if visible),
  "plannedRR": number or null (planned risk-reward ratio before entry),
  "riskReward": number or null (risk-reward ratio as shown on chart),
  "achievedRR": number or null (actual achieved R:R based on outcome),
  "priceExcursionR": number or null (how many R price travelled, i.e. MFE/risk),
  "entryTime": "YYYY-MM-DDTHH:MM:SS — combine the full date label from x-axis near entry candle with the time shown. MUST be this exact format.",
  "exitTime": "YYYY-MM-DDTHH:MM:SS — combine the full date label from x-axis near exit candle or replay bar with the time shown. MUST be this exact format.",
  "brokerTimezone": number or null (UTC offset the broker uses — e.g. 0 for UTC/GMT/London, 2 for UTC+2 EET, 3 for UTC+3 EEST. Look for timezone labels, GMT/UTC markers, or clues in the chart header. If none are visible, return 0 — London UTC is a common broker default and all forex sessions are referenced to it.),
  "dayOfWeek": "Monday/Tuesday/Wednesday/Thursday/Friday/Saturday/Sunday or null",
  "outcome": "Win or Loss or BE or Open",
  "openPLPips": number or null (open/floating P&L in pips if trade still open),
  "closedPLPips": number or null (closed P&L in pips after trade closes),
  "profitLossPoints": number or null (P&L in points/pips),
  "profitLossUSD": number or null (P&L in account currency),
  "drawdownPoints": number or null (Maximum Adverse Excursion MAE in pips),
  "drawdownUSD": number or null,
  "runUpPoints": number or null (Maximum Favorable Excursion MFE in pips),
  "runUpUSD": number or null,
  "primaryExitReason": "Target Hit or Stop Hit or Break-Even or Manual or null",
  "chartType": "Candles or Bars or Line",
  "spreadInfo": "any spread data visible or null",
  "additionalNotes": "any other relevant data visible on chart or null"
}

RULES:
- Read ALL text overlays, labels, indicators, position info panels on the chart
- Look for SL/TP markers, P/L labels, position info bars, trade history panels
- Check the instrument selector (top-left usually) for the symbol name
- Infer pairCategory from the instrument: EUR/USD/GBP/JPY etc = Forex, BTC/ETH/crypto = Crypto, XAU/XAG/OIL = Commodity, NAS/SPX/DOW/indices = Index
- Check timeframe selector for the timeframe
- Determine direction from arrow indicators, Buy/Sell labels, or position type shown
- If trade is closed, determine outcome: Win (profit), Loss (loss), BE (break-even at ~0 pips)
- Distinguish planned values (set before trade) from actual values (result of trade)
- If only one SL/TP distance is visible use it for both planned and actual
- TIMESTAMPS: Read x-axis date labels carefully. Labels like "Thu 24 Nov'22 00:22" mean the date is 2022-11-24 and time is 00:22 — combine them into "2022-11-24T00:22:00". The replay bar at the bottom often shows the last processed tick date/time — use that for exitTime if the trade is closed there.
- The times on the chart are in BROKER LOCAL TIME, NOT UTC. Most MT4/MT5 brokers run at UTC+2 (winter) or UTC+3 (summer). Try to detect the broker timezone from any visible label.
- Be precise with numbers — copy exactly what you see on screen
- Return ONLY the JSON object, no markdown formatting"""


def parse_gemini_response(text):
    text = text.strip()
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if json_match:
        text = json_match.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            return json.loads(json_match.group(0))
        raise ValueError(f"Could not parse JSON from response: {text[:200]}")


_ISO_FMTS = [
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M",
]

_BROKER_FMTS = [
    "%d %b %Y %H:%M:%S",
    "%d %b %Y %H:%M",
    "%d %b %Y",
    "%d-%b-%Y %H:%M:%S",
    "%d-%b-%Y %H:%M",
    "%d %B %Y %H:%M:%S",
    "%d %B %Y %H:%M",
]


def _parse_dt(s):
    """
    Parse a datetime string from many formats including broker chart labels.
    Returns a datetime object or None.
    Handles strings like:
      "2022-11-24T00:22:00"
      "Thu 24 Nov'22 00:22"   (MT4/MT5 x-axis style)
      "24 Nov'22 00:22"
      "08 Dec 2022 07:00"
    """
    if not s:
        return None
    s = str(s).strip()

    # Strip leading timezone suffix (+02:00 etc) before trying ISO
    clean_iso = re.sub(r'[+-]\d{2}:\d{2}$', '', s).strip()

    for fmt in _ISO_FMTS:
        try:
            return datetime.strptime(clean_iso[:len(fmt) + 2], fmt)
        except ValueError:
            pass

    # Strip leading day-name abbreviation: "Thu 24 Nov'22 00:22" → "24 Nov'22 00:22"
    broker = re.sub(r'^[A-Za-z]{2,}\s+', '', s).strip()

    # Replace two-digit year shorthand: Nov'22 → Nov 2022  / Nov'98 → Nov 1998
    broker = re.sub(
        r"'(\d{2})\b",
        lambda m: (" 20" if int(m.group(1)) <= 69 else " 19") + m.group(1),
        broker
    )

    for fmt in _BROKER_FMTS:
        try:
            return datetime.strptime(broker, fmt)
        except ValueError:
            pass

    return None


def derive_session(entry_time_str, broker_tz_offset=None):
    """
    Derive forex session name and phase.
    broker_tz_offset: numeric UTC offset (e.g. 2 for UTC+2) so we can convert
    broker local time → UTC before classifying.  If None/unknown we use the
    raw hour — still better than nothing.

    Session hours (UTC):
      Sydney      : 21:00–00:00  Open
      Tokyo       : 00:00–03:00  Open  /  03:00–06:00  Mid  /  06:00–07:00  Close
      London      : 07:00–10:00  Open  /  10:00–13:00  Mid
      NY Overlap  : 13:00–16:00  Open
      New York    : 16:00–19:00  Mid   /  19:00–21:00  Close
    """
    if not entry_time_str:
        return {"sessionName": None, "sessionPhase": None}
    try:
        dt = _parse_dt(entry_time_str)
        if dt is None:
            return {"sessionName": None, "sessionPhase": None}

        # Convert broker local time → UTC
        if broker_tz_offset is not None:
            try:
                offset = float(broker_tz_offset)
                dt = dt - timedelta(hours=offset)
            except (TypeError, ValueError):
                pass

        hour = dt.hour

        if 21 <= hour <= 23:
            return {"sessionName": "Sydney",    "sessionPhase": "Open"}
        elif hour < 3:
            return {"sessionName": "Tokyo",     "sessionPhase": "Open"}
        elif hour < 6:
            return {"sessionName": "Tokyo",     "sessionPhase": "Mid"}
        elif hour < 7:
            return {"sessionName": "Tokyo",     "sessionPhase": "Close"}
        elif hour < 10:
            return {"sessionName": "London",    "sessionPhase": "Open"}
        elif hour < 13:
            return {"sessionName": "London",    "sessionPhase": "Mid"}
        elif hour < 16:
            return {"sessionName": "Overlap",   "sessionPhase": "Open"}
        elif hour < 19:
            return {"sessionName": "New York",  "sessionPhase": "Mid"}
        else:
            return {"sessionName": "New York",  "sessionPhase": "Close"}
    except Exception:
        return {"sessionName": None, "sessionPhase": None}


def compute_duration(entry_str, exit_str):
    """Compute human-readable trade duration from two timestamp strings."""
    if not entry_str or not exit_str:
        return None
    try:
        entry_dt = _parse_dt(entry_str)
        exit_dt  = _parse_dt(exit_str)
        if entry_dt is None or exit_dt is None:
            return None
        delta = exit_dt - entry_dt
        total_secs = delta.total_seconds()
        if total_secs <= 0:
            return None
        total_mins = int(total_secs / 60)
        if total_mins < 60:
            return f"{total_mins}m"
        elif total_secs < 86400:
            h = total_mins // 60
            m = total_mins % 60
            return f"{h}h {m}m" if m else f"{h}h"
        else:
            days  = delta.days
            hours = delta.seconds // 3600
            return f"{days}d {hours}h" if hours else f"{days}d"
    except Exception:
        return None


def normalize_lot_size(raw):
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return raw
    raw_str = str(raw).replace(",", "").replace("'", "")
    numbers = re.findall(r'[\d.]+', raw_str)
    return float(numbers[0]) if numbers else None


def map_to_journal_fields(extracted):
    broker_tz = extracted.get("brokerTimezone")
    session_info = derive_session(extracted.get("entryTime"), broker_tz_offset=broker_tz)
    duration = compute_duration(
        extracted.get("entryTime"), extracted.get("exitTime")
    )
    lot_size = normalize_lot_size(extracted.get("lotSize"))

    return {
        # Instrument
        "instrument": extracted.get("instrument"),
        "pairCategory": extracted.get("pairCategory"),
        # Direction & order
        "direction": extracted.get("direction"),
        "orderType": extracted.get("orderType"),
        # Prices
        "entryPrice": extracted.get("entryPrice"),
        "openingPrice": extracted.get("openingPrice"),
        "closingPrice": extracted.get("closingPrice"),
        "stopLoss": extracted.get("stopLoss"),
        "takeProfit": extracted.get("takeProfit"),
        # SL/TP distances (pips)
        "plannedSlPips": extracted.get("plannedSlPips"),
        "plannedTpPips": extracted.get("plannedTpPips"),
        "actualSlPips": extracted.get("actualSlPips"),
        "actualTpPips": extracted.get("actualTpPips"),
        "stopLossDistancePips": extracted.get("stopLossDistance"),
        "takeProfitDistancePips": extracted.get("takeProfitDistance"),
        # Position size
        "lotSize": lot_size,
        "units": extracted.get("units"),
        "contractSize": extracted.get("contractSize"),
        # Risk & Reward
        "plannedRR": extracted.get("plannedRR"),
        "riskReward": extracted.get("riskReward"),
        "achievedRR": extracted.get("achievedRR"),
        "priceExcursionR": extracted.get("priceExcursionR"),
        # Time & Session
        "entryTime": extracted.get("entryTime"),
        "exitTime": extracted.get("exitTime"),
        "dayOfWeek": extracted.get("dayOfWeek"),
        "tradeDuration": duration,
        "sessionName": session_info["sessionName"],
        "sessionPhase": session_info["sessionPhase"],
        # Outcome
        "outcome": extracted.get("outcome"),
        "primaryExitReason": extracted.get("primaryExitReason"),
        # P&L
        "openPLPips": extracted.get("openPLPips"),
        "closedPLPips": extracted.get("closedPLPips"),
        "profitLoss": extracted.get("profitLossUSD"),
        "pipsGainedLost": extracted.get("profitLossPoints"),
        # Drawdown / Run-up
        "mae": extracted.get("drawdownPoints"),
        "mfe": extracted.get("runUpPoints"),
        # Chart context
        "entryTF": extracted.get("timeframe"),
        "spreadAtEntry": extracted.get("spreadInfo"),
        "additionalNotes": extracted.get("additionalNotes"),
        # Raw response for debugging
        "aiExtractedRaw": extracted,
    }


def _detect_mime(raw_data_uri):
    """Return the MIME type from a data URI prefix, or default to image/jpeg."""
    if raw_data_uri.startswith("data:"):
        header = raw_data_uri[:40]
        if "image/jpeg" in header or "image/jpg" in header:
            return "image/jpeg"
        if "image/webp" in header:
            return "image/webp"
        if "image/gif" in header:
            return "image/gif"
        if "image/png" in header:
            return "image/png"
    return "image/jpeg"


def analyze_image(image_data):
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY not set")

    mime_type = _detect_mime(image_data)

    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    image_bytes = base64.b64decode(image_data)

    model = os.environ.get("GEMINI_MODEL_OVERRIDE") or "gemini-1.5-flash"
    client = genai.Client(api_key=GOOGLE_API_KEY)
    response = client.models.generate_content(
        model=model,
        contents=[
            EXTRACTION_PROMPT,
            genai.types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
    )

    extracted = parse_gemini_response(response.text)
    return map_to_journal_fields(extracted)


def run_cli():
    import sys
    image_data = sys.stdin.read().strip()
    if not image_data:
        print(json.dumps({"success": False, "error": "No image data"}))
        sys.exit(1)
    if not GOOGLE_API_KEY:
        print(json.dumps({"success": False, "error": "GOOGLE_API_KEY not set"}))
        sys.exit(1)
    try:
        fields = analyze_image(image_data)
        print(json.dumps({"success": True, "fields": fields}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


if __name__ == "__main__":
    import sys
    if "--analyze" in sys.argv:
        run_cli()
