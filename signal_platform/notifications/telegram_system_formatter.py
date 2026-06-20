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
    # Render the established session(s) with their proper labels (e.g. "new_york" → "New York").
    sess_list   = ", ".join(
        _SESSION_META.get(s.lower(), ("", s.replace("_", " ").title()))[1] for s in sessions
    ) if sessions else "—"
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


def format_platform_status(is_open: bool, sessions: list[str], next_open: str | None) -> str:
    """Boot heartbeat — fired once on startup so a redeploy confirms the platform
    is alive and shows whether the forex market is currently open or closed."""
    from datetime import datetime, timezone
    now_utc = datetime.now(timezone.utc).strftime("%a %H:%M UTC")
    if is_open:
        sess = ", ".join(
            _SESSION_META.get(s.lower(), ("", s.replace("_", " ").title()))[1] for s in sessions
        ) if sessions else "no major session yet"
        lines = [
            "🟢 <b>Signal Platform Online</b>",
            "──────────────────────────",
            f"🕐 <b>Time:</b>   <code>{now_utc}</code>",
            "📈 <b>Market:</b> <b>OPEN</b>",
            f"📅 <b>Active:</b> {sess}",
            "",
            "<i>Scanning live for setups.</i>",
        ]
    else:
        lines = [
            "🔴 <b>Signal Platform Online</b>",
            "──────────────────────────",
            f"🕐 <b>Time:</b>   <code>{now_utc}</code>",
            "📉 <b>Market:</b> <b>CLOSED</b>",
        ]
        if next_open:
            lines.append(f"🔔 <b>Reopens:</b> <code>{next_open}</code>")
        lines += ["", "<i>Idle until the market reopens — nothing fires while closed.</i>"]
    lines.append("⚡️ <i>Trade&amp;Journal Signal Platform</i>")
    return "\n".join(lines)
