#!/usr/bin/env python3
"""
calendar_calculator.py
───────────────────────
Computes per-day P&L, trade count, and win rate for the trading calendar.

DATE PRIORITY — uses the actual trade date from the screenshot, never the
record creation timestamp:

  1. entryTime   — the trade entry datetime (set manually or from OCR entryTime)
  2. exitTime    — the replay bar timestamp extracted by OCR (e.g. "2024-08-05 15:59")
                   This is the most reliably populated field when using JForex screenshots
  3. entryTimeUTC — alternative entry time field
  4. tradeDate   — explicit trade date field
  5. createdAt   — LAST RESORT only; only used when ALL of the above are absent,
                   meaning no screenshot was analysed and no manual date was entered

This ordering ensures that a trade taken in 2024 and logged via OCR in 2026
is always shown in the 2024 calendar, not the 2026 calendar.
"""

import sys
import json
from collections import defaultdict


def safe_float(val):
    try:
        return float(val) if val is not None else 0.0
    except (ValueError, TypeError):
        return 0.0


def _pick_trade_date(t: dict) -> str:
    """
    Return the best date string for this trade entry.

    Priority:
      1. entryTime   (manually entered or OCR entry datetime)
      2. exitTime    (OCR replay bar timestamp — always present after screenshot scan)
      3. entryTimeUTC
      4. tradeDate
      5. createdAt   (fallback — real-time save timestamp, used only as last resort)

    Returns the ISO date portion "YYYY-MM-DD" or "" if nothing is usable.
    """
    # Fields tried in priority order
    candidates = [
        t.get("entryTime"),
        t.get("exitTime"),
        t.get("entryTimeUTC"),
        t.get("tradeDate"),
        t.get("openedAt"),
        t.get("closedAt"),
        # createdAt is last — it reflects when the user saved the form, not
        # when the trade actually happened
        t.get("createdAt"),
    ]

    for raw in candidates:
        if not raw:
            continue
        s = str(raw).strip()
        if not s:
            continue
        # Extract the YYYY-MM-DD portion regardless of the rest of the string
        # Handles: "2024-08-05 15:59", "2024-08-05T15:59:00Z", "2024-08-05"
        date_part = s[:10]
        if len(date_part) == 10 and date_part[4] == "-" and date_part[7] == "-":
            # Sanity check: year should be plausible (2000–2099)
            try:
                year = int(date_part[:4])
                if 2000 <= year <= 2099:
                    return date_part
            except ValueError:
                continue

    return ""


def compute_calendar_data(trades):
    """
    Build a nested dict:  { "YYYY-M": { "D": { pnl, trades, winRate } } }

    Each day key is the string representation of the day integer (no zero-padding)
    to match what TradingCalendar.tsx expects.
    """
    daily = defaultdict(lambda: {"pnl": 0.0, "trades": 0, "wins": 0})

    for t in trades:
        day_key = _pick_trade_date(t)
        if not day_key:
            continue  # skip entries with no usable date

        pl      = safe_float(t.get("profitLoss"))
        outcome = (t.get("outcome") or "").lower()

        daily[day_key]["pnl"]    += pl
        daily[day_key]["trades"] += 1
        if outcome == "win":
            daily[day_key]["wins"] += 1

    result = {}
    for day_key, data in daily.items():
        try:
            parts = day_key.split("-")
            year  = int(parts[0])
            month = int(parts[1])
            day   = int(parts[2])
        except (ValueError, IndexError):
            continue

        month_key = f"{year}-{month}"
        if month_key not in result:
            result[month_key] = {}

        win_rate = (
            round(data["wins"] / data["trades"] * 100)
            if data["trades"] > 0 else 0
        )
        result[month_key][str(day)] = {
            "pnl":     round(data["pnl"], 2),
            "trades":  data["trades"],
            "winRate": win_rate,
        }

    months_list = sorted(result.keys())

    return {
        "calendarData":    result,
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
