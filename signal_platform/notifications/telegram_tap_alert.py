"""
The TAP ALERT card ("cheeky one") — the public, pre-pullback heads-up.

User's brief, 2026-08-04: *"make the signal room look fun, engaging but accurate and
informational"*, with his own sample line: *"Price just mitigated 4HR zone and there seems to be a
confirmation in 5m or 1M. Do you mind checking it out? For me i would mind because i am waiting for
a confirmation that the zone has been respected. Anyway, what do i know, i am just an agent, i
should stick to what i know better."*

VOICE ONLY. Every number and every claim comes off the Signal, which the strategy built
(`strategies/bx_sd_tap_alert`). Nothing here computes, infers or rounds anything — so the joke can
be rewritten without any chance of changing what the message asserts.

Two things the humour is NOT allowed to cost:
  * The facts block is fixed and complete. What is there AND what is missing, every time.
  * "Not an entry" is stated plainly, outside the jokes, before the sign-off.
Only the sign-off rotates, and it is seeded from the dedup key — so a retried send is the identical
message rather than a fresh punchline for the same event.
"""
from core.types import Signal, Direction

# Rotating sign-offs, in the user's own register: the agent deferring to the reader, slightly
# sheepish about having spoken up at all. The FIRST is his line, near-verbatim.
_SIGNOFFS = (
    "Anyway — what do I know. I'm just an agent. I should stick to what I know better.",
    "But what do I know? I just stare at candles all day. You're the one with the account.",
    "Could be nothing. I've been wrong before — I'll be wrong again by Thursday.",
    "I'll go back to watching now. Someone has to, and it's not going to be my day off.",
    "Don't let me talk you into anything. I'm a script with opinions.",
)

_RULE = "━" * 21

# Telegram rejects a PHOTO caption over 1024 characters. This card always ships with a chart, so
# going over does not truncate — it fails the send and the reader gets the text fallback with no
# picture. The copy is kept comfortably inside it and `test_tap_alert` asserts the WORST case
# (longest sign-off + longest symbol + a full HTF backing tag), so lengthening a quip later trips
# a check instead of silently dropping the chart off the card.
CAPTION_CAP = 1024


def _h(text: str) -> str:
    """Escape HTML special chars."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _signoff(seed: str) -> str:
    """Deterministic per signal — NOT random. A failed send re-fires the same dedup key next scan,
    and `random` would put a different joke under an identical card, which reads like two events."""
    return _SIGNOFFS[sum(seed.encode()) % len(_SIGNOFFS)] if seed else _SIGNOFFS[0]


def format_tap_alert(signal: Signal) -> str:
    """The public pre-pullback card. Deliberately NOT `format_signal_confirmed`: that card leads
    with entry / stop / target, and this signal has none — rendering it there printed three 0.00000
    prices under a BUY header, which is the one thing this alert must never look like."""
    buy   = signal.direction == Direction.BUY
    dot   = "🟢" if buy else "🔴"
    zone  = "DEMAND" if buy else "SUPPLY"
    facts = list(signal.technical_reasons or [])
    miss  = list(signal.disqualifiers or [])

    lines = [
        # NOT the word "SIGNAL", and no BUY/SELL in the headline. The room has been trained that a
        # card with a side on it is something to place; this one is not.
        f"👀 <b>CHEEKY ONE</b>  ·  <b>{_h(signal.symbol)}</b>  {dot}",
        f"<i>{_h(signal.strategy_name or signal.strategy_id)} · watching, not trading</i>",
        _RULE,
        "",
        f"Price just tapped the 4H <b>{zone}</b> zone, and the entry timeframe is reacting.",
        "",
        "Worth a look? Maybe. Me, I'm holding out for the zone to be <b>RESPECTED</b> and the 4H "
        "pullback after it — that's when I shout properly.",
        "",
        "✅ <b>WHAT'S THERE</b>",
    ]
    lines += [f"   · {_h(f)}" for f in facts] or ["   · —"]
    if miss:
        lines += ["", "⏳ <b>WHAT'S MISSING</b>"]
        lines += [f"   · {_h(m)}" for m in miss]
    lines += [
        "",
        "<blockquote>Not an entry. No stop, no target, nothing to place yet.</blockquote>",
        "",
        f"<i>{_h(_signoff(signal.dedup_key))}</i>",
        "",
        "<i>⚠️ Trade&amp;Journal does not offer financial advice and is not liable for any "
        "losses you incur.</i>",
    ]
    return "\n".join(lines)
