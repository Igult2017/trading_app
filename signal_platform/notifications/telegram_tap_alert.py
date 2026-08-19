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
    "But what do I know? I just stare at candles all day.",
    "Could be nothing. I've been wrong before — I'll be wrong again by Thursday.",
    "I'll go back to watching now. Someone has to.",
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


def _is_decisional(signal: Signal) -> bool:
    """Read off the standing-aside lines the strategy wrote, not from a second source of truth.

    `bx_sd_tap_alert._standing_aside` is the one place that decides this; asking the Signal for a
    separate flag would let the headline and the body disagree about the same zone."""
    return any("DECISIONAL" in str(d) for d in (signal.disqualifiers or []))


def format_tap_alert(signal: Signal) -> str:
    """The public pre-pullback card. Deliberately NOT `format_signal_confirmed`: that card leads
    with entry / stop / target, and this signal has none — rendering it there printed three 0.00000
    prices under a BUY header, which is the one thing this alert must never look like."""
    buy   = signal.direction == Direction.BUY
    dot   = "🟢" if buy else "🔴"
    zone  = "DEMAND" if buy else "SUPPLY"
    facts = list(signal.technical_reasons or [])
    why   = list(signal.smc_factors or [])          # why the METHOD would already take this
    miss  = list(signal.disqualifiers or [])        # why WE do not

    lines = [
        # NOT the word "SIGNAL", and no BUY/SELL in the headline. The room has been trained that a
        # card with a side on it is something to place; this one is not.
        # THE HEADLINE CARRIES THE WARNING. A reader who stops after two lines must already know
        # this is a zone we are refusing, not one we are about to take — the whole risk of this card
        # is that it gets skimmed and mistaken for a setup in waiting.
        # NOT the word "cheeky". User, 2026-08-15: *"By cheeky I meant the message was meant to be
        # fun and engaging, you dont need to write the word 'cheeky' there."* The TONE is the brief;
        # printing the label was taking the instruction literally. The engagement lives in the
        # voice — the sign-off, the plain phrasing — not in a badge announcing itself as fun.
        f"👀 <b>ON THE RADAR</b>  ·  <b>{_h(signal.symbol)}</b>  {dot}",
        f"<i>{_h(signal.strategy_name or signal.strategy_id)} · "
        f"{'DECISIONAL zone — we do NOT trade these' if _is_decisional(signal) else 'watching, not trading'}</i>",
        _RULE,
        "",
        f"Price just tapped the 4H <b>{zone}</b> zone and the entry timeframe is reacting.",
        "",
        "✅ <b>WHAT'S THERE</b>",
    ]
    lines += [f"   · {_h(f)}" for f in facts] or ["   · —"]
    # THE POINT OF THIS CARD, added 2026-08-05 on the user's instruction: say that what is present is
    # already a complete setup by the book, instead of only listing what is absent. The lines are
    # built in `bx_sd_tap_alert._viability` and are conditioned on real state — "most recent valid
    # zone" is computed, "first touch" only when the zone is genuinely unspent.
    if why:
        lines += ["", "📘 <b>BY THE METHOD, THIS ALREADY QUALIFIES</b>"]
        lines += [f"   · {_h(w)}" for w in why]
    if miss:
        lines += ["", "⏳ <b>WHY WE STILL WAIT</b>"]
        lines += [f"   · {_h(m)}" for m in miss]
    lines += [
        "",
        # "we take this zone one step later" was true of the pre-2026-08-15 model, where the card
        # fired before the zone was respected and BX entered the SAME zone on its pullback. For a
        # DECISIONAL zone that is now false and dangerous: we never take this zone at all, we take
        # the extreme beyond it. A closing line that contradicts the warning above it is worse than
        # no closing line.
        # LENGTH IS A HARD CONSTRAINT, not a preference: Telegram REJECTS a photo caption over 1024
        # chars, so a wordier line does not degrade the card, it deletes it. The first version of
        # this pushed the worst case to 1045 and the test caught it.
        ("<blockquote>Not an entry, now or later — we wait for the extreme beyond it. "
         "No stop, no target.</blockquote>" if _is_decisional(signal)
         else "<blockquote>Not an entry from us — watching only. No stop, no target here."
              "</blockquote>"),
        "",
        f"<i>{_h(_signoff(signal.dedup_key))}</i>",
        "",
        "<i>⚠️ Trade&amp;Journal does not offer financial advice and is not liable for any "
        "losses you incur.</i>",
    ]
    return "\n".join(lines)
