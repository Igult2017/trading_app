"""
AI signal validation via Gemini — optional last-step plugin.

Failure policy (explicit):
  - is_available() = False  → caller skips entirely, signal approved.
  - Gemini returns NO       → signal dropped.
  - Gemini API error        → signal approved (failure is non-blocking).

Validation uses raw OHLC candle data as JSON — no chart image needed.
Gates on is_available() so Gemini is never in the critical path when unconfigured.
"""

import asyncio
import logging
from config.settings import settings

log = logging.getLogger(__name__)


def is_available() -> bool:
    if not settings.gemini_api_key:
        return False
    try:
        import google.generativeai  # noqa: F401
        return True
    except ImportError:
        return False


async def validate_signal(signal, candles: list) -> bool:
    """
    Sends the last 50 candles + signal levels to Gemini as text.
    Returns True  → approved.
    Returns False → Gemini explicitly rejected the setup.
    """
    try:
        approved = await _call_gemini(signal, candles)
        if not approved:
            log.info("[ai_validator] Gemini rejected the signal")
        return approved
    except Exception as exc:
        log.warning(
            f"[ai_validator] Gemini call failed ({exc}) — "
            "signal approved (failure policy: non-blocking)"
        )
        return True


async def _call_gemini(signal, candles: list) -> bool:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _call_gemini_sync, signal, candles)


def _call_gemini_sync(signal, candles: list) -> bool:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    recent = candles[-50:] if len(candles) > 50 else candles
    candle_data = [
        {"t": int(c.time), "o": c.open, "h": c.high, "l": c.low, "c": c.close}
        for c in recent
    ]

    prompt = (
        f"Signal: {signal.direction.value.upper()} on {signal.symbol}\n"
        f"Entry: {signal.entry_price}, SL: {signal.stop_loss}, TP: {signal.take_profit}\n"
        f"Confidence: {signal.confidence:.0%}\n"
        f"Last {len(candle_data)} candles (oldest first, OHLC): {candle_data}\n\n"
        "Does this entry make technical sense given the recent price action? "
        "Reply YES or NO and one sentence why."
    )

    response = model.generate_content(prompt)
    text = response.text.strip().upper()
    approved = text.startswith("YES")
    log.info(f"[ai_validator] Gemini: {text[:80]} → {'approved' if approved else 'rejected'}")
    return approved
