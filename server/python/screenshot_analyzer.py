import os
import json
import base64
import re
from datetime import datetime
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
  "entryTime": "ISO datetime string or readable date or null",
  "exitTime": "ISO datetime string or readable date or null",
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
- Extract entry and exit timestamps from x-axis labels, replay bar, or trade history
- Be precise with numbers - copy exactly what you see on screen
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


def derive_session(entry_time_str):
    """
    Derive forex session name and phase from a UTC timestamp.
    All session boundaries use UTC (London/GMT as reference).

    Session hours (UTC):
      Sydney     : 21:00 - 00:00  (Open)
      Tokyo      : 00:00 - 03:00  (Open)  /  03:00 - 06:00  (Mid)  /  06:00 - 07:00  (Close)
      London     : 07:00 - 10:00  (Open)  /  10:00 - 13:00  (Mid)
      L-NY Overlap: 13:00 - 16:00 (Open)
      New York   : 16:00 - 19:00  (Mid)   /  19:00 - 21:00  (Close)
    """
    if not entry_time_str:
        return {"sessionName": None, "sessionPhase": None}
    try:
        for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"]:
            try:
                dt = datetime.strptime(entry_time_str[:19], fmt)
                break
            except ValueError:
                continue
        else:
            return {"sessionName": None, "sessionPhase": None}

        # Treat timestamp as UTC — London is the reference timezone for forex sessions
        hour = dt.hour

        if 21 <= hour <= 23:
            return {"sessionName": "Sydney", "sessionPhase": "Open"}
        elif 0 <= hour < 3:
            return {"sessionName": "Tokyo", "sessionPhase": "Open"}
        elif 3 <= hour < 6:
            return {"sessionName": "Tokyo", "sessionPhase": "Mid"}
        elif 6 <= hour < 7:
            return {"sessionName": "Tokyo", "sessionPhase": "Close"}
        elif 7 <= hour < 10:
            return {"sessionName": "London", "sessionPhase": "Open"}
        elif 10 <= hour < 13:
            return {"sessionName": "London", "sessionPhase": "Mid"}
        elif 13 <= hour < 16:
            return {"sessionName": "London-NY Overlap", "sessionPhase": "Open"}
        elif 16 <= hour < 19:
            return {"sessionName": "New York", "sessionPhase": "Mid"}
        else:  # 19 <= hour < 21
            return {"sessionName": "New York", "sessionPhase": "Close"}
    except Exception:
        return {"sessionName": None, "sessionPhase": None}


def compute_duration(entry_str, exit_str):
    if not entry_str or not exit_str:
        return None
    try:
        for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"]:
            try:
                entry_dt = datetime.strptime(entry_str[:19], fmt)
                exit_dt = datetime.strptime(exit_str[:19], fmt)
                break
            except ValueError:
                continue
        else:
            return None
        delta = exit_dt - entry_dt
        total_hours = delta.total_seconds() / 3600
        if total_hours < 1:
            return f"{int(delta.total_seconds() / 60)}m"
        elif total_hours < 24:
            return f"{total_hours:.1f}h"
        else:
            days = delta.days
            hours = (delta.seconds // 3600)
            return f"{days}d {hours}h"
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
    session_info = derive_session(extracted.get("entryTime"))
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


def analyze_image(image_data):
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY not set")

    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    image_bytes = base64.b64decode(image_data)

    client = genai.Client(api_key=GOOGLE_API_KEY)
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            EXTRACTION_PROMPT,
            genai.types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
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
