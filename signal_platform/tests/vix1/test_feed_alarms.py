"""The FIX "feed went off" alarms must not cry wolf on a working feed (15 Nov 2026).

His report: whenever a trade was in progress the platform kept saying FIX data had gone off, and it
turned out to be false. The main cause was fixed 25 Oct (the connection, not the price, decides). Two
90-second PRICE tests were left: the ladder's "this pair stopped while another ticks", and the entry
watcher's "no pair ticked". A healthy pair pauses 90s about 0.5 times a weekday; across 786 days no
minute had zero ticks, so 300s (`fix_quotes._MAX_AGE_S`) is the measured "really broken" line.

Drives the REAL `TradeWatcher._prices_for` and `EntryWatcher._check_stale` with a fake stream.
"""
from _harness import Suite

import asyncio
from types import SimpleNamespace as NS

from monitor import trade_watcher as TW, entry_watcher as EW
from notifications import safe_notify

S = Suite("FIX alarms — quiet is not dead; only a dead connection or 5 minutes of silence is reported")
said = []
safe_notify.tell_soon = lambda send, msg: said.append(msg)


async def _told(send, msg):
    said.append(msg)
    return True
safe_notify.tell = _told


class FakeStream:
    def __init__(self, my_age, others_ticking, session_silent=False):
        self.my_age, self.others, self.dead = my_age, others_ticking, session_silent
        self.connected = True
    def session_silent(self, s): return self.dead
    def session_age(self): return 80.0 if self.dead else 1.0
    def age(self, symbol=None): return self.my_age
    def ticking_symbols(self, s): return self.others
    def quote(self, symbol): return (1.1000, 1.1001)
    def is_stale(self, limit_s, symbol=None): return self.my_age > limit_s


async def polled(symbol, bullish):
    return (1.2, 1.2)
import monitor.position_tracker as PT
PT._prices_now = polled

POS = NS(symbol="GBP/USD", bullish=True)


def ladder(my_age, others, dead=False):
    said.clear()
    w = TW.TradeWatcher(send=None)
    w._stream = FakeStream(my_age, others, dead)
    got = asyncio.run(w._prices_for(POS, streamed=True))
    return got, list(said)


got, msgs = ladder(my_age=120, others=1)
S.check("ladder: a pair quiet 120s while another ticks -> polled price used (stop protected)", got, (1.2, 1.2))
S.check("...and NOTHING is sent to him (was a 'stopped arriving' DM)", msgs, [])
got, msgs = ladder(my_age=310, others=1)
S.check("ladder: the same pair silent 310s -> he IS told", len(msgs), 1)
got, msgs = ladder(my_age=2, others=1, dead=True)
S.check("ladder: the connection itself silent -> he IS told (unchanged)", len(msgs), 1)
got, msgs = ladder(my_age=2, others=1)
S.check("ladder: a ticking pair -> the streamed price, nothing said", (got, msgs), ((1.1, 1.1), []))


def entry(my_age, dead=False):
    said.clear()
    w = EW.EntryWatcher.__new__(EW.EntryWatcher)
    w._stream, w._degraded, w.send = FakeStream(my_age, 0, dead), False, (lambda *a: None)
    asyncio.run(w._check_stale())
    return list(said)


S.check("entry watcher: no pair ticked for 120s -> nothing said (was 'went quiet')", entry(120), [])
S.check("entry watcher: no pair ticked for 310s -> he IS told", len(entry(310)), 1)
S.check("entry watcher: the connection silent -> he IS told (unchanged)", len(entry(5, dead=True)), 1)

# TEETH — put the old 90s line back and the false alarm returns.
saved = EW._STALE_AFTER_S
EW._STALE_AFTER_S = 90.0
S.teeth("with the old 90s line, a 120s pause DMs him again", len(entry(120)) == 1)
EW._STALE_AFTER_S = saved
saved_max = TW._MAX_AGE_S
TW._MAX_AGE_S = 90.0
S.teeth("with the ladder told at 90s, a 120s pause DMs him again", len(ladder(120, 1)[1]) == 1)
TW._MAX_AGE_S = saved_max

S.done()
