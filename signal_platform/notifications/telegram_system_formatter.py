"""
Telegram HTML formatters for system/platform notifications.
Separate from telegram_formatter.py (signal cards) to stay under 150 lines.
"""

from datetime import datetime, timezone


def format_scan_started(payload: dict) -> str:
    instruments = payload.get("instruments", [])
    sessions    = payload.get("sessions", [])
    now_utc     = datetime.now(timezone.utc).strftime("%H:%M UTC")
    instr_list  = ", ".join(instruments) if instruments else "—"
    sess_list   = ", ".join(sessions)    if sessions    else "—"
    return "\n".join([
        "🟢 <b>Scanner Active</b>",
        "──────────────────────────",
        f"🕐 <b>Time:</b>        <code>{now_utc}</code>",
        f"📊 <b>Instruments:</b> <code>{instr_list}</code>",
        f"📅 <b>Sessions:</b>    <code>{sess_list}</code>",
        "",
        "<i>Market is open — scanning for setups.</i>",
        "⚡️ <i>Trade&amp;Journal Signal Platform</i>",
    ])


_SESSION_META = {
    "sydney":   ("🦘", "Sydney"),
    "tokyo":    ("🗼", "Tokyo"),
    "london":   ("🎡", "London"),
    "new_york": ("🗽", "New York"),
}


def format_session_open(session_name: str) -> str:
    emoji, label = _SESSION_META.get(session_name.lower(), ("🌍", session_name.replace("_", " ").title()))
    now_utc = datetime.now(timezone.utc).strftime("%H:%M UTC")
    return "\n".join([
        f"{emoji} <b>{label} Session Open</b>",
        "──────────────────────────",
        f"🕐 <b>Time:</b> <code>{now_utc}</code>",
        "",
        f"<i>{label} session is now live. Watch for setups.</i>",
        "⚡️ <i>Trade&amp;Journal Signal Platform</i>",
    ])
