"""
The FIX 4.4 wire format: building a message, and taking one apart.

Split from `fix_quotes.py` on 2026-08-30 when that file passed 200 lines. This owns the FORMAT;
`fix_quotes` owns the SESSION. They break for entirely different reasons — a format bug is a
checksum or a tag, a session bug is a logon or a dropped socket — so they are worth separating.

HAND-WRITTEN, AND PROVED AGAINST THE LIVE BROKER. No FIX library is installed and requirements.txt
declares none; the message set needed here is five. This exact format was accepted by cTrader's demo
QUOTE session on 2026-08-30 on the first attempt — logon accepted, and EUR/USD returned at 1.15827.

cTrader FIX identifies instruments by NUMERIC id, not by name, and those ids are the same ones the
Open API uses (verified against the live symbol list: EURUSD 1, GBPUSD 2, USDJPY 4, GBPJPY 7,
XAUUSD 41).
"""
import calendar
import time

SOH = "\x01"
TARGET = "cServer"
SUB = "QUOTE"

# Only the instruments this platform trades. An unknown symbol is simply not subscribed rather than
# guessed at — a wrong id would silently stream the wrong instrument's price into a stop move.
SYMBOL_IDS = {"EUR/USD": 1, "GBP/USD": 2, "USD/JPY": 4, "GBP/JPY": 7, "XAU/USD": 41}
ID_TO_SYMBOL = {v: k for k, v in SYMBOL_IDS.items()}


def build(msg_type: str, seq: int, sender: str, body: list[tuple[int, str]]) -> bytes:
    """One FIX message, ready to write.

    BodyLength (9) and CheckSum (10) are COMPUTED, never guessed. BodyLength counts everything after
    its own field up to and including the delimiter before the checksum; CheckSum is the sum of every
    byte mod 256, three digits. Getting either wrong is the classic way a FIX session dies without
    saying anything — the broker simply stops answering.
    """
    head = [(35, msg_type), (49, sender), (56, TARGET), (57, SUB), (50, SUB),
            (34, str(seq)), (52, time.strftime("%Y%m%d-%H:%M:%S", time.gmtime()))]
    inner = SOH.join(f"{t}={v}" for t, v in head + body) + SOH
    frame = f"8=FIX.4.4{SOH}9={len(inner)}{SOH}" + inner
    return (frame + f"10={sum(frame.encode()) % 256:03d}{SOH}").encode()


def parse(raw: str) -> list[dict]:
    """Split a buffer into messages, each a {tag: value} dict.

    A MARKET DATA MESSAGE REPEATS ITS PRICE TAGS, and a naive parser loses one of them. Tag 269 says
    which side follows (0 = bid, 1 = offer) and tag 270 carries that side's price, once per entry.
    Flattening the pairs would leave only the LAST 270 and the bid or the ask would vanish — so each
    price is keyed by the side that introduced it, as `px_0` and `px_1`.
    """
    out = []
    for chunk in raw.split("8=FIX.4.4"):
        if not chunk.strip():
            continue
        d: dict[str, str] = {}
        side = None
        for pair in ("8=FIX.4.4" + chunk).split(SOH):
            if "=" not in pair:
                continue
            t, _, v = pair.partition("=")
            if t == "269":
                side = v
            elif t == "270" and side is not None:
                d[f"px_{side}"] = v
            else:
                d[t] = v
        if d:
            out.append(d)
    return out


def sending_time(raw: str | None) -> float | None:
    """FIX tag 52 (`YYYYMMDD-HH:MM:SS`, always UTC) as a unix timestamp, or None if unusable.

    THE BROKER'S CLOCK, NOT OURS. Deciding a 1-minute bar has closed from local time would fire on a
    machine whose clock has drifted, for a minute in which no price actually traded. Anything
    malformed returns None rather than a guess, and the caller falls back deliberately.
    """
    if not raw:
        return None
    try:
        return calendar.timegm(time.strptime(raw.split(".")[0], "%Y%m%d-%H:%M:%S"))
    except (ValueError, TypeError):
        return None


def logon_body(account_id: str, password: str, heartbeat_s: int) -> list[tuple[int, str]]:
    return [(98, "0"), (108, str(heartbeat_s)), (141, "Y"),
            (553, str(account_id)), (554, password)]


def subscribe_body(symbols: list[str]) -> list[tuple[int, str]]:
    """Subscribe to top-of-book bid and offer for each known symbol, snapshot plus updates."""
    known = [s for s in symbols if s in SYMBOL_IDS]
    body = [(262, "sp-1"), (263, "1"), (264, "1"), (265, "1"),
            (267, "2"), (269, "0"), (269, "1"), (146, str(len(known)))]
    return body + [(55, str(SYMBOL_IDS[s])) for s in known], known
