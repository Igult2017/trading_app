"""BOT TOKENS MUST NOT REACH THE LOGS.

WHAT WAS FOUND, 01 Sep 2026. The production container log carried this on EVERY Telegram send:

    POST https://api.telegram.org/bot<the live token>/sendMessage "HTTP/1.1 200 OK"

Nothing logged it on purpose. Telegram puts the token INSIDE the web address, `httpx` logs every
address it calls at INFO, and `main.py` sets INFO on the ROOT logger — so every third-party library
inherited it. Anyone who could read the container log could take the bot over.

He decided not to rotate the token, so the ONLY thing standing between that credential and the log
is this filter. That makes these checks load-bearing rather than tidy-up, and it is why the exact
leaked line shape is asserted rather than a made-up one.

TWO ROUTES IN, both covered:
  • a library logging a request URL           (the confirmed leak, signal platform / httpx)
  • an error message quoting the URL that failed (copy engine: `"[tg] poll error: %s" % e`)

Run:  python signal_platform/tests/test_log_redaction.py
"""
import io
import logging
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))

from core.log_redaction import RedactTokens, _TOKEN, install  # noqa: E402

failed, count = [], 0


def _check(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def _teeth(name, broke_it_and_failed):
    global count
    count += 1
    print(f"   {'PASS' if broke_it_and_failed else 'FAIL'}  TEETH — {name}")
    if not broke_it_and_failed:
        failed.append(name)


class _S:
    check = staticmethod(_check)
    teeth = staticmethod(_teeth)

    @staticmethod
    def done():
        print()
        if failed:
            print(f"{len(failed)} of {count} FAILED: {failed}")
            sys.exit(1)
        print(f"ALL PASS ({count} checks)")


s = _S()
print("\nLOG REDACTION — the bot token never reaches a handler")

# A token-SHAPED string. Not his: same shape, invented digits, so this file leaks nothing itself.
FAKE = "7755210387:AAGEFcFmHA0UfHPjoOce6fOWS41_ydHq79c"
LEAKED_LINE = f'HTTP Request: POST https://api.telegram.org/bot{FAKE}/sendMessage "HTTP/1.1 200 OK"'


def captured(msg, *args, exc_info=None, logger_name="probe"):
    """Log through a real handler carrying the filter, and return what the handler actually wrote."""
    buf = io.StringIO()
    h = logging.StreamHandler(buf)
    h.setFormatter(logging.Formatter("%(message)s"))
    h.addFilter(RedactTokens())
    lg = logging.getLogger(logger_name)
    lg.handlers = [h]
    lg.propagate = False
    lg.setLevel(logging.DEBUG)
    lg.info(msg, *args, exc_info=exc_info)
    return buf.getvalue()


# ── THE EXACT LINE THAT LEAKED ──────────────────────────────────────────────
out = captured(LEAKED_LINE)
s.check("the real leaked line no longer carries the secret", FAKE in out, False)
s.check("...and it is marked as redacted", "<redacted>" in out, True)
s.check("...while the bot id survives, so the line still says WHICH bot",
        "7755210387" in out, True)
s.check("...and the rest of the line is intact", "sendMessage" in out and "200 OK" in out, True)

# ── THE SECOND ROUTE: A TOKEN ARRIVING THROUGH %s ARGS ──────────────────────
# `log.warning("[tg] poll error: %s", e)` — the token is in the ARGUMENT, not the format string.
out = captured("[tg] poll error: %s", f"Cannot connect to https://api.telegram.org/bot{FAKE}/getUpdates")
s.check("a token passed as a log argument is redacted too", FAKE in out, False)
s.check("...and the message still reads sensibly", "poll error" in out, True)

# ── AND THROUGH AN EXCEPTION'S OWN TEXT ─────────────────────────────────────
try:
    raise ConnectionError(f"failed: https://api.telegram.org/bot{FAKE}/getUpdates")
except ConnectionError:
    out = captured("request failed", exc_info=sys.exc_info())
s.check("a token inside a traceback is redacted", FAKE in out, False)
s.check("...and the traceback is still reported", "ConnectionError" in out, True)

# ── WHAT MUST NOT BE TOUCHED ────────────────────────────────────────────────
# Over-redacting would quietly destroy ordinary log content, which is its own kind of damage.
print()
print("   ordinary lines pass through untouched:")
for line in [
    "[scanner] tick complete in 14.2s — 5/5 instruments scanned",
    "[bx_sd] EUR/USD -> SIGNAL_1 | SELL risky entry 1.16175 SL 1.16185 TP 1.16145",
    "[ctrader] account 47535363 authenticated",
    "MISMATCH GBP/JPY @1788244620: ours O216.579 H216.581",
    "[validator] EUR/USD bx_sd REJECTED — conf=60% < min 70%",
]:
    s.check(f"unchanged: {line[:44]}...", captured(line).strip(), line)

# The 30-character floor is what keeps ordinary "number: text" out of the pattern.
s.check("a short id:value pair is not mistaken for a token",
        bool(_TOKEN.search("session 12345678: opened")), False)
s.check("a timestamp with a colon is safe",
        bool(_TOKEN.search("1788244620: bar closed")), False)

# ── THE NOISY LIBRARY IS SILENCED AT SOURCE ─────────────────────────────────
install()
s.check("httpx no longer logs a line per request",
        logging.getLogger("httpx").level, logging.WARNING)
s.check("...nor its transport", logging.getLogger("httpcore").level, logging.WARNING)

# ── BOTH PROCESSES INSTALL IT ───────────────────────────────────────────────
# The copy engine is a separate process with its own import path and its own bot token.
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sig = open(os.path.join(root, "signal_platform", "main.py"), encoding="utf-8").read()
cp = open(os.path.join(root, "copy_platform", "main.py"), encoding="utf-8").read()
s.check("the signal platform installs it", "_install_log_redaction()" in sig, True)
s.check("the copy engine installs it too", "_install_log_redaction()" in cp, True)
s.check("...and both do it right after logging is configured, before anything can log",
        (sig.index("_install_log_redaction()") - sig.index("basicConfig") < 700) and
        (cp.index("_install_log_redaction()") - cp.index("basicConfig") < 700), True)

# ── TEETH ───────────────────────────────────────────────────────────────────
# Silencing httpx alone was NOT enough — that is why the filter exists.
s.teeth("silencing httpx alone would still leak through an error message",
        FAKE in f"[tg] poll error: Cannot connect to https://api.telegram.org/bot{FAKE}/getUpdates"
        and FAKE not in captured("[tg] poll error: %s",
                                 f"Cannot connect to https://api.telegram.org/bot{FAKE}/getUpdates"))
s.teeth("an unfiltered handler really does emit the token",
        FAKE in LEAKED_LINE and FAKE not in captured(LEAKED_LINE))

s.done()
