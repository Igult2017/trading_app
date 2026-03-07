#!/usr/bin/env python3
import sys
import json
from collections import defaultdict


def safe_float(val):
    try:
        return float(val) if val is not None else 0.0
    except (ValueError, TypeError):
        return 0.0


def compute_calendar_data(trades):
    daily = defaultdict(lambda: {"pnl": 0.0, "trades": 0, "wins": 0})

    for t in trades:
        date_str = (
            t.get("entryTime")
            or t.get("entryTimeUTC")
            or t.get("createdAt")
            or ""
        )
        if not date_str:
            continue

        day_key = str(date_str)[:10]
        pl = safe_float(t.get("profitLoss"))
        outcome = (t.get("outcome") or "").lower()

        daily[day_key]["pnl"] += pl
        daily[day_key]["trades"] += 1
        if outcome == "win":
            daily[day_key]["wins"] += 1

    result = {}
    for day_key, data in daily.items():
        try:
            parts = day_key.split("-")
            year = int(parts[0])
            month = int(parts[1])
            day = int(parts[2])
        except (ValueError, IndexError):
            continue

        month_key = f"{year}-{month}"
        if month_key not in result:
            result[month_key] = {}

        win_rate = round(data["wins"] / data["trades"] * 100) if data["trades"] > 0 else 0
        result[month_key][str(day)] = {
            "pnl": round(data["pnl"], 2),
            "trades": data["trades"],
            "winRate": win_rate,
        }

    months_list = sorted(result.keys())

    return {
        "calendarData": result,
        "availableMonths": months_list,
    }


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"success": False, "error": "No input"}))
        return

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON: {e}"}))
        return

    trades = payload if isinstance(payload, list) else payload.get("trades", [])

    data = compute_calendar_data(trades)
    print(json.dumps({"success": True, **data}))


if __name__ == "__main__":
    main()
