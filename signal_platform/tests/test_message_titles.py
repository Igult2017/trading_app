"""EVERY MESSAGE NAMES ITSELF — its strategy and what it is about, in one convention.

His instruction, 2026-08-21: *"Give every message both in the channel and DM a proper header/title
that i can easily use to identify what it is about... include the strategy that produced the signal
in the title and what the signal or notification is about. I want everything organized and tidy. No
chaos."*

WHAT THE CHAOS WAS: 21 distinct messages, each producer inventing its own header. `👁 SETUP ALERT`
covered a pre-close notification, a heads-up and a zone reaction alike; `⚠️ WATCH SIGNAL` covered an
invalidation and a live watch; the channel's `🟢 BUY · EUR/USD` named no strategy at all.

THIS FILE PRINTS EVERY TITLE so they can be read as a set — "tidy" is a judgement about what he
sees, and a passing assertion does not make a list of headers scannable. The assertions below then
hold the properties that cannot be eyeballed: no duplicates, nothing generic, and the card and the
Telegram message agreeing about the same event.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

# THE TITLES LEAD WITH EMOJI AND THIS FILE PRINTS THEM. A Windows console defaults to cp1252, which
# cannot encode them, so the whole suite died on a UnicodeEncodeError while every assertion in it
# passed — the test failed for its own printing, not for anything it measured.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from core.types import Direction, Signal, TF  # noqa: E402
from notifications import titles  # noqa: E402

failed, count = [], 0


def check(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def teeth(name, broke_it):
    global count
    count += 1
    print(f"   {'PASS' if broke_it else 'FAIL'}  TEETH — {name}: {broke_it}")
    if not broke_it:
        failed.append(f"TEETH:{name}")


def sig(headline, strategy="VIX.1", symbol="EUR/USD", buy=False, tf=TF.H1):
    return Signal(symbol=symbol, direction=Direction.BUY if buy else Direction.SELL,
                  strategy_id="vix1_watch", strategy_name=strategy,
                  primary_timeframe=tf, headline=headline)


# EVERY MESSAGE THE PLATFORM CAN SEND, as (what it is, the rendered title).
CASES = [
    ("VIX.1 pre-close",        titles.for_signal(sig(titles.MOMENTUM_CLOSING))),
    ("VIX.1 stand-down",       titles.for_signal(sig(titles.MOMENTUM_FAILED))),
    ("VIX.1 heads-up",         titles.for_signal(sig(titles.MOMENTUM_CLOSED))),
    ("VIX.1 entry",            titles.for_signal(sig(f"{titles.ENTRY_SIGNAL} — PULLBACK ASSUMED",
                                                     tf=TF.M1))),
    ("VIX.1 entry (assumed)",  titles.for_signal(sig(f"{titles.ENTRY_SIGNAL} — FRACTAL BREAK → ASSUMED",
                                                     tf=TF.M1))),
    ("VIX.1 invalidation",     titles.for_signal(sig(titles.SETUP_INVALIDATED))),
    ("BX tap alert",           titles.for_signal(sig(titles.ZONE_TAPPED, "BX-S/D", "USD/JPY",
                                                     tf=TF.H4))),
    ("BX signal 1",            titles.for_signal(sig(titles.UNCONFIRMED_ENTRY, "BX-S/D", "USD/JPY",
                                                     tf=TF.H4))),
    ("BX signal 2",            titles.for_signal(sig(titles.CONFIRMED_ENTRY, "BX-S/D", "USD/JPY",
                                                     tf=TF.H4))),
    ("outcome — target",       titles.header(titles.TARGET_HIT, "BX-S/D", "USD/JPY", "SELL",
                                             extra="+4.0R")),
    ("outcome — stop",         titles.header(titles.STOP_HIT, "VIX.1", "EUR/USD", "BUY",
                                             extra="-1R")),
    ("outcome — expired",      titles.header(titles.SETUP_EXPIRED, "VIX.1", "EUR/USD", "BUY")),
    ("breakeven due",          titles.header(titles.MOVE_TO_BREAKEVEN, titles.TRADE_MANAGEMENT,
                                             "EUR/USD", "SELL")),
    ("lock +1R",               titles.header(titles.lock(1), titles.TRADE_MANAGEMENT,
                                             "EUR/USD", "SELL")),
    ("lock +3R",               titles.header(titles.lock(3), titles.TRADE_MANAGEMENT,
                                             "EUR/USD", "SELL")),
    ("no stop",                titles.header(titles.NO_STOP, titles.TRADE_MANAGEMENT,
                                             "GBP/USD", "BUY")),
    ("stop moved",             titles.header(titles.STOP_MOVED, titles.TRADE_MANAGEMENT,
                                             "EUR/USD", "SELL", extra="#238055086")),
    ("stop NOT moved",         titles.header(titles.STOP_NOT_MOVED, titles.TRADE_MANAGEMENT,
                                             "EUR/USD", "SELL", extra="#238055086")),
    ("take profit gone",       titles.header(titles.TAKE_PROFIT_MISSING, titles.TRADE_MANAGEMENT,
                                             "EUR/USD", "SELL", extra="#238055086")),
    ("VIX.1 ratchet",          titles.for_signal(sig(titles.lock(2), tf=TF.M1))),
    ("VIX.1 structure exit",   titles.for_signal(sig(titles.STRUCTURE_EXIT, tf=TF.M1))),
    ("scanner started",        titles.header(titles.SCANNER_STARTED, titles.PLATFORM)),
    ("session open",           titles.header(titles.SESSION_OPEN, titles.PLATFORM, extra="London")),
    ("platform online",        titles.header(titles.PLATFORM_ONLINE, titles.PLATFORM)),
    ("platform restarted",     titles.header(titles.PLATFORM_RESTARTED, titles.PLATFORM)),
]

print()
print("EVERY MESSAGE, AND THE TITLE IT NOW CARRIES")
print()
for what, rendered in CASES:
    flat = rendered.replace("<b>", "").replace("</b>", "").replace("\n", "\n        ")
    print(f"   {what:24} {flat}")
    print()

# ── the properties that cannot be eyeballed ──────────────────────────────────
firsts = [r.split("\n")[0] for _, r in CASES]
seconds = [r.split("\n")[1] if "\n" in r else "" for _, r in CASES]

check("every message has a title line", all(firsts), True)
check("every title is bold, so it reads as a heading",
      all("<b>" in f for f in firsts), True)
check("every message names its category on line 2", all(seconds), True)

# NO TWO DIFFERENT MESSAGES MAY LOOK THE SAME. This is the actual "no chaos" property: if two
# distinct events render identically he cannot tell them apart, which is what he complained about.
dupes = [t for t in set(firsts) if firsts.count(t) > 1]
check("no two different messages share a title line", dupes, [])

# NOTHING GENERIC SURVIVES. These are the exact headers he used to get for unrelated events.
allt = " ".join(firsts).upper()
for dead in ("SETUP ALERT", "WATCH SIGNAL", "AUTO-STOP", "TP HIT", "SL HIT"):
    check(f"the old generic {dead!r} header is gone", dead in allt, False)

# EVERY KIND HAS ITS OWN EMOJI RATHER THAN THE BULLET FALLBACK — including the composed ones
# ("ENTRY SIGNAL — PULLBACK ASSUMED", "LOCK IN +2R"), which is what the prefix match is for.
bulleted = [what for what, r in CASES if r.startswith("•")]
check("no message falls back to the bullet", bulleted, [])

# THE CARD AND THE MESSAGE MUST AGREE. They disagreed for months: the PNG drew `headline` and the
# Telegram text ignored it and wrote its own header about the same event.
s = sig(titles.MOMENTUM_CLOSING)
check("the card kicker carries the same strategy and kind as the title",
      titles.kicker(s), "VIX.1  ·  MOMENTUM CANDLE CLOSURE NOTIFICATION")
check("...and the title's own words are inside it",
      titles.MOMENTUM_CLOSING in titles.kicker(s), True)

# ── it must never raise: this is in the path of every signal ─────────────────
check("an unknown kind still produces a usable title",
      titles.header("SOMETHING NEW", "VIX.1", "EUR/USD").startswith("•"), True)
check("no kind at all still names the category",
      titles.header("", titles.PLATFORM), titles.PLATFORM)
check("a signal with no headline still gets a category line",
      titles.for_signal(sig("")).strip(), "VIX.1  ·  EUR/USD  ·  SELL  ·  H1")
check("None everywhere does not raise", isinstance(titles.header(None, None), str), True)


class _Explodes:
    """Every attribute access raises — the worst a caller could hand this."""
    def __getattr__(self, k):
        raise RuntimeError("boom")


try:
    out = titles.for_signal(_Explodes())
    ok = isinstance(out, str)
except Exception:
    ok = False
check("a signal that raises on every field still yields a string", ok, True)

# HTML injection — a symbol or strategy name is data, and it lands in an HTML message.
check("angle brackets in the data are escaped, not rendered",
      "<script>" in titles.header(titles.ENTRY_SIGNAL, "VIX.1", "<script>"), False)

# ── TEETH ────────────────────────────────────────────────────────────────────
teeth("the duplicate check can actually fail",
      len([t for t in set(firsts + [firsts[0]]) if (firsts + [firsts[0]]).count(t) > 1]) == 1)
teeth("the bullet fallback is real, so the no-bullet check means something",
      titles.header("NOT A REGISTERED KIND", "VIX.1").startswith("•"))
teeth("the prefix match is what saves the composed kinds",
      not titles.header(f"{titles.ENTRY_SIGNAL} — PULLBACK", "VIX.1").startswith("•"))

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks, {len(CASES)} message types)")
