"""
AI chart validation via Gemini.

Failure policy (explicit):
  - GEMINI_API_KEY absent   → signal PASSES (approved). Logged at INFO.
  - chart_path is None      → signal PASSES (no chart to review).
  - Gemini returns NO       → signal DROPPED. Logged at INFO.
  - Gemini API error/timeout → signal PASSES with WARNING logged.
    Rationale: Gemini going down must not equal zero signals. The strategy
    validation (R:R, confidence, duplicate guard) already ran — Gemini is
    an additional filter, not the last gate. A failed review is treated as
    "no opinion" not "rejected".
"""

import asyncio
import logging
from pathlib import Path
from config.settings import settings

log = logging.getLogger(__name__)


async def validate_chart(chart_path: str | None) -> bool:
    """
    Returns True  → signal may proceed (approved or no review possible).
    Returns False → signal dropped (Gemini explicitly rejected it).
    """
    if not chart_path or not Path(chart_path).exists():
        return True   # no chart → no review → pass

    if not settings.gemini_api_key:
        log.info("[ai_validator] no GEMINI_API_KEY — skipping AI review, signal approved")
        return True

    try:
        approved = await _call_gemini(chart_path)
        if not approved:
            log.info("[ai_validator] Gemini rejected the chart")
        return approved
    except Exception as exc:
        log.warning(
            f"[ai_validator] Gemini call failed ({exc}) — "
            "signal approved (failure policy: non-blocking)"
        )
        return True   # explicit: Gemini failure → approve, not drop


async def _call_gemini(chart_path: str) -> bool:
    """Send chart image to Gemini for visual signal review."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _call_gemini_sync, chart_path)


def _call_gemini_sync(chart_path: str) -> bool:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    image_data = Path(chart_path).read_bytes()
    response = model.generate_content([
        {"mime_type": "image/png", "data": image_data},
        (
            "You are reviewing a trading signal chart. "
            "Does this chart show a clear, valid setup with proper market structure, "
            "defined entry, stop loss, and take profit levels? "
            "Reply with YES or NO only."
        ),
    ])
    text = response.text.strip().upper()
    approved = text.startswith("YES")
    log.info(f"[ai_validator] Gemini: {text} → {'approved' if approved else 'rejected'}")
    return approved
