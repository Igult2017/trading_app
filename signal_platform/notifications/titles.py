"""THE ONE PLACE A MESSAGE HEADER IS BUILT — channel, DM, and the chart cards.

His instruction, 2026-08-21: *"Give every message both in the channel and DM a proper header/title
that i can easily use to identify what it is about... include the strategy that produced the signal
in the title and what the signal or notification is about. I want everything organized and tidy. No
chaos."*

WHAT THE CHAOS WAS. Twenty-one distinct messages, each producer inventing its own header. The same
`👁 SETUP ALERT — EUR/USD BUY` covered a pre-close notification, a heads-up and a zone mitigation;
`⚠️ WATCH SIGNAL` covered both an invalidation and a watch; the channel's `🟢 BUY · EUR/USD` named no
strategy at all. Nothing said which of a strategy's five message types you were looking at.

AND THE ROOT OF IT: `Signal.headline` already existed and already carried "what this moment is" —
`card_panel` has honoured it since 2026-08-19 — but the Telegram formatters ignored it and built
their own. So the PNG card and the message text about the SAME event said different things.

THE SHAPE, two lines. The first says WHAT, the second says WHO and WHERE:

    🔔 MOMENTUM CANDLE CLOSURE NOTIFICATION
    VIX.1  ·  EUR/USD  ·  SELL  ·  1H

THREE CATEGORIES, so every message belongs to exactly one and none can be homeless:

    the strategy      anything a strategy produced      VIX.1 / BX-S/D
    TRADE MANAGEMENT  account-level: breakeven, locks, stop moves
    PLATFORM          scanner, sessions, status, restarts

IT MUST NEVER RAISE. This sits in the path of every outgoing message, including real entry signals.
An unknown kind degrades to the category and the symbol rather than throwing — a title is a
convenience, and it must never be the reason a signal fails to reach him.
"""

# ── CATEGORIES ────────────────────────────────────────────────────────────────
TRADE_MANAGEMENT = "TRADE MANAGEMENT"
PLATFORM = "PLATFORM"

# ── KINDS: what the message is about, in his words ────────────────────────────
# Each maps to the emoji that leads its title. Grouped by producer so a new message has an obvious
# home. The STRINGS are what he reads — change them here and every surface follows.
#
# HIS EXAMPLE SET THE STYLE: *"momentum candle closure notification"* — say the thing in full rather
# than abbreviating it into something only the code understands.

# VIX.1
MOMENTUM_CLOSING = "MOMENTUM CANDLE CLOSURE NOTIFICATION"
MOMENTUM_FAILED = "MOMENTUM CANDLE DID NOT QUALIFY"
MOMENTUM_CLOSED = "MOMENTUM CANDLE CLOSED — SETUP BUILDING"
ENTRY_SIGNAL = "ENTRY SIGNAL"
SETUP_INVALIDATED = "SETUP INVALIDATED"

# BX-S/D. HIS LABELS, 2026-08-19: *"Signal 1 should be labelled UNCONFIRMED ENTRY and signal 2 should
# be labelled CONFIRMED ENTRY."* Signal 1 is `bx_sd_mitigation` (the reaction at the extreme zone);
# signal 2 is `bx_sd_signal` (the return to the zone that reaction created). The tap alert is a THIRD,
# separate, public message that fires before either — it is not a stage of the same sequence.
ZONE_TAPPED = "ZONE TAPPED — ON THE RADAR"
# "UNCONFIRMED ENTRY", not "UNCONFIRMED ENTRY — AWAIT THE RETURN": the card's chip already says
# AWAIT THE RETURN, and the first draft printed it twice on the same card. Rendered and looked at.
UNCONFIRMED_ENTRY = "UNCONFIRMED ENTRY"
CONFIRMED_ENTRY = "CONFIRMED ENTRY"

# Outcomes — the other half of an entry the reader has already seen
TARGET_HIT = "TARGET HIT"
STOP_HIT = "STOP HIT"
SETUP_EXPIRED = "SETUP EXPIRED"

# Trade management — about the ACCOUNT, not about a strategy, which is why they carry no strategy name
MOVE_TO_BREAKEVEN = "MOVE STOP TO BREAKEVEN"
LOCK_EMOJI = "🟩"                    # the lock kind is built per rung by `lock()`, below
NO_STOP = "NO STOP LOSS SET"
STOP_MOVED = "STOP MOVED AUTOMATICALLY"
STOP_NOT_MOVED = "STOP NOT MOVED"
TAKE_PROFIT_MISSING = "TAKE PROFIT IS MISSING"
R_REACHED = "PROFIT MILESTONE REACHED"
STRUCTURE_EXIT = "1M STRUCTURE CHANGED — CLOSE IT"

# Platform
SCANNER_STARTED = "SCANNER STARTED"
SESSION_OPEN = "SESSION OPEN"
PLATFORM_ONLINE = "PLATFORM ONLINE"
PLATFORM_OFFLINE = "PLATFORM OFFLINE"
PLATFORM_RESTARTED = "PLATFORM RESTARTED"

_EMOJI = {
    MOMENTUM_CLOSING: "🔔", MOMENTUM_FAILED: "⚪", MOMENTUM_CLOSED: "🟡",
    ENTRY_SIGNAL: "🟢", SETUP_INVALIDATED: "🚫",
    ZONE_TAPPED: "👀",
    UNCONFIRMED_ENTRY: "🟡", CONFIRMED_ENTRY: "🟢",
    TARGET_HIT: "✅", STOP_HIT: "❌", SETUP_EXPIRED: "⏱",
    MOVE_TO_BREAKEVEN: "🟦", NO_STOP: "⚠️", "LOCK IN": LOCK_EMOJI,   # prefix key — see `lock()`
    STOP_MOVED: "🔧", STOP_NOT_MOVED: "🔧", TAKE_PROFIT_MISSING: "🔴",
    R_REACHED: "🔒", STRUCTURE_EXIT: "🚪",
    SCANNER_STARTED: "🟢", SESSION_OPEN: "🌍", PLATFORM_ONLINE: "🟢",
    PLATFORM_OFFLINE: "🔴", PLATFORM_RESTARTED: "🛰️",
}


def _esc(text) -> str:
    """Escape HTML. Duplicated nowhere else in this module — every caller passes through here."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _emoji_for(kind: str) -> str:
    """The emoji for a kind, matching a PREFIX when the kind carries a variant.

    Several kinds legitimately extend a base one — `ENTRY SIGNAL — PULLBACK ASSUMED` says both what
    the message is and which flavour of it, and `LOCK IN +2R` puts the rung in the headline where
    the instruction belongs. Exact-matching only would drop all of those to the bullet fallback, so
    the longest matching prefix wins. Longest, not first, so `ENTRY SIGNAL — X` cannot be caught by
    a shorter key that happens to overlap.
    """
    if kind in _EMOJI:
        return _EMOJI[kind]
    hits = [k for k in _EMOJI if kind.startswith(k)]
    return _EMOJI[max(hits, key=len)] if hits else "•"


def lock(r: float) -> str:
    """The kind for a profit-lock rung, with the R IN THE HEADLINE.

    "LOCK IN PROFIT" with a separate "+1R" chip on line 2 was the first attempt and it is worse: the
    number is the whole instruction, and splitting it off the action makes the message read as
    generic. `LOCK IN +1R` says the entire thing in three words.
    """
    return f"LOCK IN +{r:.0f}R"


def header(kind: str, category: str, symbol: str = "", side: str = "",
           timeframe: str = "", extra: str = "", emoji: str = "") -> str:
    """The two-line HTML header. Line 1 is WHAT, line 2 is WHO and WHERE.

    `category` is the strategy's display name ("VIX.1", "BX-S/D") for anything a strategy produced,
    or one of `TRADE_MANAGEMENT` / `PLATFORM`. `extra` appends one more chip to line 2 — a position
    id on a stop move, the session name on a session open.

    `emoji` overrides the registry, for a kind built at runtime (`lock()`) that cannot be a constant.

    NEVER RAISES: a kind with no emoji still gets a title, and a call with nothing but a category
    still produces a usable line. See the module docstring — this is in the path of every signal.
    """
    try:
        kind = str(kind or "").strip()
        emoji = emoji or _emoji_for(kind)
        line1 = f"{emoji} <b>{_esc(kind)}</b>" if kind else ""
        bits = [b for b in (_esc(category) if category else "",
                            _esc(symbol) if symbol else "",
                            _esc(side).upper() if side else "",
                            _esc(timeframe) if timeframe else "",
                            _esc(extra) if extra else "") if b]
        line2 = "  ·  ".join(bits)
        return "\n".join([ln for ln in (line1, line2) if ln])
    except Exception:
        # A title is a convenience. It must never be why a signal fails to reach him.
        return f"<b>{category or 'SIGNAL'}</b>"


def for_signal(signal, kind: str = "") -> str:
    """The header for a Signal, taking its kind from the signal's OWN `headline` when it has one.

    `Signal.headline` is the existing "a strategy may name its own moment" mechanism that
    `card_panel` already draws. Reading it here is what stops the PNG card and the message text
    disagreeing about the same event — which is exactly what they used to do.
    """
    try:
        k = kind or getattr(signal, "headline", "") or ""
        return header(
            k,
            getattr(signal, "strategy_name", "") or getattr(signal, "strategy_id", "") or "",
            getattr(signal, "symbol", "") or "",
            _side(signal),
            str(getattr(signal, "primary_timeframe", "") or ""),
        )
    except Exception:
        # `getattr(x, name, default)` only swallows AttributeError. A property or `__getattr__` that
        # raises anything else propagates straight through it — which is how a "never raises"
        # function still took a signal down. Caught by `test_message_titles`, not by reading it.
        return f"<b>{_esc(kind) or 'SIGNAL'}</b>"


def _side(signal) -> str:
    d = getattr(signal, "direction", None)
    v = getattr(d, "value", d)
    return str(v).upper() if v else ""


def kicker(signal, kind: str = "") -> str:
    """The PLAIN-TEXT one-liner for the chart card, which cannot render HTML.

    Same words as the Telegram title, so the picture and the message agree.
    """
    try:
        k = kind or getattr(signal, "headline", "") or ""
        name = getattr(signal, "strategy_name", "") or getattr(signal, "strategy_id", "") or ""
        return "  ·  ".join([b for b in (name, k) if b])
    except Exception:
        return str(kind or "")
