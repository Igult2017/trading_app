"""The DM text for each stage — exact prices and times, so he can find the spot on his own chart (23 Nov 2026).
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
    s, bear = e["symbol"], e["side"] == "bearish"
    name = s.replace("/", "")
    if e["kind"] == "started":
        word, rel = ("above", "higher high") if bear else ("below", "lower low")
        return (f"{'📉' if bear else '📈'} CVD divergence started — {name} 1H ({e['side']})\n"
                f"Price {_px(s, e['price'])} (hour from {_t(e['since'], '%H:%M')}) is {word} the last swing "
                f"{'high' if bear else 'low'} {_px(s, e['ref_price'])} ({_t(e['ref_time'])}) — a {rel}\n"
                f"CVD is {'lower' if bear else 'higher'}: {_cvd(e['cvd'])} now vs {_cvd(e['ref_cvd'])} at that swing\n"
                f"Watching the 1M for the turn — not an entry yet.")
    if e["kind"] == "cancelled":
        return (f"✖ CVD divergence cancelled — {name} 1H ({e['side']}, swing {_px(s, e['ref_price'])} "
                f"{_t(e['ref_time'])})\n"
                f"CVD has caught up: {_cvd(e['now_cvd'])} vs {_cvd(e['ref_cvd'])} at the swing — price and CVD agree "
                f"again.")
    t = e["turn"]
    edge = "low" if bear else "high"
    return (f"🔄 1M reversal started — {name} ({e['side']} divergence from the hour {_t(e['since'], '%H:%M')})\n"
            f"A 1M candle ({_t(t['time'], '%H:%M')}) closed at {_px(s, t['close'])}, {'below' if bear else 'above'} "
            f"{_px(s, e['guard'])} — the {edge} of the candle that made the {'high' if bear else 'low'} "
            f"{_px(s, e['ext'])} ({_t(e['ext_time'], '%H:%M')}).\n"
            f"Check it on your chart before trading.")
