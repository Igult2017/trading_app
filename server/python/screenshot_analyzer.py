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
  "instrument": "e.g. EUR/USD, BTCUSD, NVDA",
  "timeframe": "e.g. 4H, 1H, 15M, 1D",
  "direction": "Long or Short",
  "orderType": "Market or Limit or Stop",
  "entryPrice": number or null,
  "stopLoss": number or null,
  "takeProfit": number or null,
  "stopLossDistance": number in points/pips or null,
  "takeProfitDistance": number in points/pips or null,
  "lotSize": number or string like "1000 units",
  "riskReward": number or null,
  "entryTime": "ISO datetime string or readable date",
  "exitTime": "ISO datetime string or readable date or null",
  "dayOfWeek": "Monday/Tuesday/etc",
  "outcome": "Win or Loss or Open",
  "profitLossPoints": number or null,
  "profitLossUSD": number or null,
  "drawdownPoints": number or null (MAE),
  "drawdownUSD": number or null,
  "runUpPoints": number or null (MFE),
  "runUpUSD": number or null,
  "primaryExitReason": "Target Hit or Stop Hit or Manual or null",
  "chartType": "Candles or Bars or Line",
  "spreadInfo": "any spread data visible",
  "additionalNotes": "any other relevant data visible on chart"
}

RULES:
- Read ALL text overlays, labels, indicators on the chart
- Look for SL/TP markers, P/L labels, position info bars
- Check the instrument selector (top-left usually)
- Check timeframe selector
- Determine direction from arrow indicators or position type
- If trade is closed, determine outcome from P/L
- Extract dates from x-axis or replay bar
- Be precise with numbers - copy exactly what you see
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

        hour = dt.hour
        if 0 <= hour < 7:
            return {"sessionName": "Tokyo", "sessionPhase": "Active"}
        elif 7 <= hour < 8:
            return {"sessionName": "London", "sessionPhase": "Pre-Open"}
        elif 8 <= hour < 12:
            return {"sessionName": "London", "sessionPhase": "Active"}
        elif 12 <= hour < 13:
            return {"sessionName": "London-NY Overlap", "sessionPhase": "Open"}
        elif 13 <= hour < 17:
            return {"sessionName": "New York", "sessionPhase": "Active"}
        elif 17 <= hour < 21:
            return {"sessionName": "New York", "sessionPhase": "Close"}
        else:
            return {"sessionName": "Sydney", "sessionPhase": "Active"}
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
        "instrument": extracted.get("instrument"),
        "direction": extracted.get("direction"),
        "orderType": extracted.get("orderType"),
        "entryPrice": extracted.get("entryPrice"),
        "stopLoss": extracted.get("stopLoss"),
        "takeProfit": extracted.get("takeProfit"),
        "stopLossDistancePips": extracted.get("stopLossDistance"),
        "takeProfitDistancePips": extracted.get("takeProfitDistance"),
        "lotSize": lot_size,
        "riskReward": extracted.get("riskReward"),
        "entryTime": extracted.get("entryTime"),
        "exitTime": extracted.get("exitTime"),
        "dayOfWeek": extracted.get("dayOfWeek"),
        "tradeDuration": duration,
        "outcome": extracted.get("outcome"),
        "profitLoss": extracted.get("profitLossUSD"),
        "pipsGainedLost": extracted.get("profitLossPoints"),
        "mae": extracted.get("drawdownPoints"),
        "mfe": extracted.get("runUpPoints"),
        "primaryExitReason": extracted.get("primaryExitReason"),
        "sessionName": session_info["sessionName"],
        "sessionPhase": session_info["sessionPhase"],
        "entryTF": extracted.get("timeframe"),
        "spreadAtEntry": extracted.get("spreadInfo"),
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
