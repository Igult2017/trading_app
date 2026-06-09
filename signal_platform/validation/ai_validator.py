"""
AI chart validation via Gemini — optional plugin.

Failure policy (explicit):
  - is_available() = False  → caller skips entirely, signal approved.
  - chart_path is None      → signal approved (no chart to review).
  - Gemini returns NO       → signal dropped.
  - Gemini API error        → signal approved (failure is non-blocking).

The scanner gates on is_available() before calling validate_chart(),
so Gemini is never in the critical path when unconfigured.
"""

import asyncio
import logging
from pathlib import Path
from config.settings import settings

log = logging.getLogger(__name__)


def is_available() -> bool:
    """True when Gemini is configured. Check this before calling validate_chart()."""
    return bool(settings.gemini_api_key)


async def validate_chart(chart_path: str | None) -> bool:
    """
    Returns True  → approved (or no chart to review).
    Returns False → Gemini explicitly rejected the chart.
    """
    if not chart_path or not Path(chart_path).exists():
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
        return True


async def _call_gemini(chart_path: str) -> bool:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _call_gemini_sync, chart_path)


def _call_gemini_sync(chart_path: str) -> bool:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

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
