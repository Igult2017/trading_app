"""Keep bot tokens out of the logs.

WHAT HAPPENED. The container log carried this, on every single Telegram send:

    POST https://api.telegram.org/bot<the real token>/sendMessage "HTTP/1.1 200 OK"

Nothing was deliberately logging the token. Telegram puts it INSIDE the web address, `httpx` logs
every address it calls at INFO, and `main.py` sets INFO on the ROOT logger — so every third-party
library inherits it and the token came along for the ride. Anyone who could read the container log
could take the bot over: read everything it has sent, send as it, change its settings.

TWO LAYERS, because silencing one library is not a fix:

  1. `httpx` (and its transport, `httpcore`) drop to WARNING. That removes the known leak at source,
     and the per-request lines were noise anyway.
  2. A filter on the ROOT HANDLER redacts anything shaped like a bot token, whoever logged it. This
     is the layer that matters: the copy engine logs poll failures as `"[tg] poll error: %s" % e`,
     and a network error's own text routinely quotes the URL that failed — a path no amount of
     silencing httpx would have covered. It also covers libraries not yet imported.

ATTACHED TO THE HANDLER, NOT A LOGGER. A filter on a logger only sees records made directly on it;
records that arrive by propagation skip it. Handler filters see everything that reaches the handler,
which is the only place all records converge.

THE BOT ID IS KEPT, THE SECRET IS NOT. A token reads `<bot id>:<35-char secret>`. The id is public —
it is half of the bot's @name lookup — and keeping it means a log still says WHICH bot failed, which
is the whole diagnostic value of the line.
"""
import logging
import re

# `<6-12 digits>:<30+ url-safe chars>` — the shape of a Telegram bot token. The 30-character floor
# is what keeps ordinary "id: value" text out of it; nothing else in these logs looks like this.
#
# NO `\b` HERE, AND THAT IS THE WHOLE POINT. The first version opened with `\b`, which requires a
# word boundary before the digits — and in the address that actually leaks,
# `.../bot7755210387:AAG...`, the digits follow the letter "t", so there is no boundary at all. It
# matched a bare token and silently failed on the ONE shape it was written for. The test caught it.
# `(?<![0-9])` anchors to the start of the number instead, which is what was meant, and still
# refuses to match part-way through a longer number.
_TOKEN = re.compile(r"(?<![0-9])(\d{6,12}):[A-Za-z0-9_-]{30,}")
_MASK = r"\1:<redacted>"

# These log one line per HTTP request, at INFO, with the full address. That address is where the
# token lives. Nothing is lost by dropping them to WARNING — failures still surface.
_NOISY_HTTP = ("httpx", "httpcore")


class RedactTokens(logging.Filter):
    """Rewrite a record in place so no bot token can reach a handler. Never blocks a record."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            text = record.getMessage()
        except Exception:
            return True                      # a record we cannot render is one we cannot leak from
        if _TOKEN.search(text):
            # Collapse to the already-formatted, redacted text: the args are consumed by
            # getMessage() above, so they must be cleared or logging would try to apply them twice.
            record.msg = _TOKEN.sub(_MASK, text)
            record.args = ()
        if record.exc_info:
            # An exception's own text is a second route in — a failed request quotes its URL.
            record.exc_text = _TOKEN.sub(_MASK, logging.Formatter().formatException(record.exc_info))
            record.exc_info = None
        return True


def install() -> None:
    """Call once, immediately after logging is configured."""
    for name in _NOISY_HTTP:
        logging.getLogger(name).setLevel(logging.WARNING)
    f = RedactTokens()
    root = logging.getLogger()
    for h in root.handlers:
        h.addFilter(f)
    # No handler yet (logging not configured, or configured later) — the logger-level filter is a
    # weaker fallback, but better than nothing for records made directly on the root logger.
    if not root.handlers:
        root.addFilter(f)
