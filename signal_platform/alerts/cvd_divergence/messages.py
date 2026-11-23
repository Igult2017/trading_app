"""The DM text for each stage — exact prices and times, so he can find the spot on his own chart (23 Nov 2026).

His rule (23 Nov 2026): *"When sending a CVD signal explain whether it is a sell or a buy and why."* So every message
LEADS with the action — a bearish divergence is a SELL idea, a bullish one a BUY idea (the move is losing strength, a
turn the other way is expected) — and carries a "Why:" line in plain words with both prices and both CVDs.
Times are UTC and say so: his cTrader chart may show another time zone."""
from __future__ import annotations

from datetime import datetime, timezone

DIGITS = {"EUR/USD": 5, "GBP/USD": 5, "GBP/JPY": 3, "XAU/USD": 2}


def _px(symbol: str, v: float) -> str:
    return f"{v:.{DIGITS.get(symbol, 5)}f}"


def _t(ts: int, fmt: str = "%d %b %H:%M") -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime(fmt) + " UTC"


def _cvd(v: float) -> str:
    return f"{v:+,.0f}"


def render(e: dict) -> str:
    s, sell = e["symbol"], e["side"] == "bearish"
    name = s.replace("/", "")
    act = "SELL" if sell else "BUY"
    if e["kind"] == "started":
        if sell:
            why = (f"price made a HIGHER high, {_px(s, e['price'])} (hour from {_t(e['since'], '%H:%M')}), above the "
                   f"last swing high {_px(s, e['ref_price'])} ({_t(e['ref_time'])}), but CVD is LOWER there: "
                   f"{_cvd(e['cvd'])} vs {_cvd(e['ref_cvd'])}. Less buying is pushing this high than the last one — the "
                   f"rise is losing strength, so a fall is expected.")
        else:
            why = (f"price made a LOWER low, {_px(s, e['price'])} (hour from {_t(e['since'], '%H:%M')}), below the "
                   f"last swing low {_px(s, e['ref_price'])} ({_t(e['ref_time'])}), but CVD is HIGHER there: "
                   f"{_cvd(e['cvd'])} vs {_cvd(e['ref_cvd'])}. Less selling is pushing this low than the last one — the "
                   f"fall is losing strength, so a rise is expected.")
        return (f"{'📉' if sell else '📈'} {act} idea — {name} 1H (CVD divergence started)\n"
                f"Why: {why}\n"
                f"Wait for the 1M to turn {'down' if sell else 'up'} — not an entry yet.")
    if e["kind"] == "cancelled":
        side_word = "buying is back behind the high" if sell else "selling is back behind the low"
        return (f"✖ {act} idea cancelled — {name} 1H (swing {_px(s, e['ref_price'])}, {_t(e['ref_time'])})\n"
                f"Why: CVD has caught up ({_cvd(e['now_cvd'])} vs {_cvd(e['ref_cvd'])} at the swing): {side_word}, so "
                f"price and CVD agree again and the {'fall' if sell else 'rise'} is no longer expected.")
    t = e["turn"]
    return (f"🔄 {act} — the 1M has turned {'down' if sell else 'up'} — {name} (divergence from the hour "
            f"{_t(e['since'], '%H:%M')})\n"
            f"Why: a 1M candle ({_t(t['time'], '%H:%M')}) closed at {_px(s, t['close'])}, "
            f"{'below' if sell else 'above'} {_px(s, e['guard'])} — the {'low' if sell else 'high'} of the candle that "
            f"made the {'high' if sell else 'low'} {_px(s, e['ext'])} ({_t(e['ext_time'], '%H:%M')}). Price stopped "
            f"making new {'highs and turned down' if sell else 'lows and turned up'}, as the divergence predicted.\n"
            f"Check it on your chart before trading.")
