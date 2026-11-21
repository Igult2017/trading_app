"""THE CONNECTION POOL — many accounts on a few long-lived connections, proven against a stand-in cTrader.

`docs/copy-realtime-plan.md` steps 2, 3 and 10. Runs the REAL library client, the REAL `OwnQueueProtocol` pacing, the
REAL pool and the REAL follower executor against `fake_ctrader.FakeCTrader`, which speaks cTrader's framing and
refuses anything over 50 requests a second on one connection. Nothing reaches a real broker.

What it proves, each with the number it is decided on:
  * three accounts share ONE connection: one app login, three account logins;
  * an order is placed and its own reply is read — even when another order's news for the same account arrives
    right behind it (the reply-ownership check);
  * a refused login comes back as a refusal with the broker's words, at once;
  * a dropped connection is reconnected by the SAME client and everyone logged back in — no second connection;
  * 2,000 accounts → 40 connections; 2,000 orders sent; ZERO requests over cTrader's limit; how long it took.
"""
import os
os.environ["COPY_USE_POOL"] = "demo"
os.environ["COPY_ACCOUNTS_PER_CONN"] = "50"

from _harness import Suite                                            # noqa: E402
import asyncio                                                         # noqa: E402
import sys                                                             # noqa: E402
if sys.platform == "win32":                                            # Twisted needs the selector loop (Linux has it)
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
from twisted.internet import asyncioreactor                            # noqa: E402
_loop = asyncio.new_event_loop()
asyncio.set_event_loop(_loop)
asyncioreactor.install(_loop)
from twisted.internet import reactor                                   # noqa: E402
import asyncio                                                         # noqa: E402
import time                                                            # noqa: E402
import types                                                           # noqa: E402

import fake_ctrader                                                    # noqa: E402
fake_ctrader.plain_tcp_for_tests()
import config                                                          # noqa: E402
import pool                                                            # noqa: E402
import symbol_details                                                  # noqa: E402
from executors.ctrader import CTraderExecutor                          # noqa: E402

s = Suite("COPY — the connection pool: many accounts, few connections, never over cTrader's limit")

SPEC = types.SimpleNamespace(lotSize=10_000_000, stepVolume=100_000, minVolume=100_000, maxVolume=10 ** 12,
                             digits=5, pipPosition=4)


def creds(acct, token="good"):
    return {"ctraderId": str(acct), "accessToken": token}


def warm(acct):
    symbol_details.put_symbol_map(acct, {"EURUSD": 1})
    symbol_details._cache[(acct, 1)] = SPEC


async def place(acct, label, token="good"):
    return await CTraderExecutor(creds(acct, token), "demo").place_pending(
        "EURUSD", "BUY", 0.1, "STOP", 1.1050, 1.1000, 1.1100, label)


import json                                                            # noqa: E402
import socket                                                          # noqa: E402
import subprocess                                                      # noqa: E402


def _free_port():
    with socket.socket() as so:
        so.bind(("127.0.0.1", 0))
        return so.getsockname()[1]


class Fake:
    """The stand-in broker, in ITS OWN PROCESS (as the real one is), driven over its control port."""

    def __init__(self):
        self.port, self.ctl = _free_port(), _free_port()
        self.proc = subprocess.Popen([sys.executable, "-u", os.path.join(os.path.dirname(__file__), "fake_ctrader.py"),
                                      str(self.port), str(self.ctl)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        assert self.proc.stdout.readline().strip() == b"ready"

    def __call__(self, cmd="stats") -> dict:
        with socket.create_connection(("127.0.0.1", self.ctl)) as so:
            so.sendall(cmd.encode() + b"\n")
            return json.loads(so.makefile().readline())

    def close(self):
        self.proc.kill()


async def main():
    fake = Fake()
    config.CT_DEMO_HOST, config.CT_PORT = "127.0.0.1", fake.port
    pool.POOL = pool.Pool()
    try:
        # 1. three accounts, one connection
        for a in (101, 102, 103):
            warm(a)
        r = await asyncio.gather(*(place(a, f"cp-1-{a}") for a in (101, 102, 103)))
        st = fake()
        s.check("three orders placed", [x.ok for x in r], [True, True, True])
        s.check("...on ONE connection", st["conns"], 1)
        s.check("...one app login, one login per account", (st["app_logins"], sorted(st["account_logins"].values())),
                (1, [1, 1, 1]))
        again = await place(101, "cp-2-101")
        s.check("a second order needs no new login (it is ONE message)", (again.ok, fake()["account_logins"]["101"]),
                (True, 1))

        # 2. another order's news straight behind ours must not be read as our reply
        fake("noise on")
        mine = await place(102, "cp-3-102")
        fake("noise off")
        s.check("our own reply is read, not the other order's (id 1)", (mine.ok, mine.external_id not in (None, "1")),
                (True, True))

        # 3. a refused login
        warm(104)
        bad = await place(104, "cp-1-104", token="bad")
        s.check("a refused login says so, with the broker's reason",
                (bad.ok, "CH_ACCESS_TOKEN_INVALID" in (bad.error or "")), (False, True))

        # 4. the connection drops
        client_before = pool.POOL._home[101].client
        fake("drop")
        await asyncio.sleep(4.0)                     # the library's own reconnect back-off
        after = await place(103, "cp-4-103")
        st = fake()
        s.check("after a drop the SAME client reconnects", pool.POOL._home[101].client is client_before, True)
        s.check("...one connection again, not two", st["conns"], 1)
        s.check("...the app logged in again and orders work", (st["app_logins"], after.ok), (2, True))

        # 5. capacity: 2,000 accounts — logged in at start-up (gently), then one master trade copied to all
        import ctrader_protocol
        fake("reset")
        accts = list(range(10_000, 12_000))
        for a in accts:
            warm(a)
        t0 = time.monotonic()
        out = await pool.POOL.warm([(creds(a), "demo") for a in accts])
        took = time.monotonic() - t0
        st = fake()
        print(f"   ... start-up: 2,000 accounts logged in on {st['conns']} connections in {took:.1f}s")
        s.check("2,000 accounts logged in at start-up", sum(1 for v in out.values() if v is None), 2000)
        s.check("...on 40 connections (50 accounts each) plus the first one", st["conns"], 41)
        s.check("...with NOT ONE login over cTrader's limit", st["breaches"], 0)
        fake("reset")
        ctrader_protocol.PEAK = 0
        t0 = time.monotonic()
        res = await asyncio.gather(*(place(a, f"cp-10-{a}") for a in accts))
        took2 = time.monotonic() - t0
        st = fake()
        print(f"   ... one master trade copied to all 2,000: {took2:.2f}s, {st['requests']} requests, "
              f"busiest connection wrote {ctrader_protocol.PEAK} in one second")
        s.check("all 2,000 copies placed, none over cTrader's limit", (sum(x.ok for x in res), st["breaches"]), (2000, 0))
        s.check("...no connection ever wrote more than 35 in one second (our side, what the broker sees)",
                ctrader_protocol.PEAK <= 35, True)
        s.check("...in under 3 seconds", took2 < 3.0, True)

        # 6. cTrader says "too many requests": the message is resent, the copy still lands
        fake("limit 3")
        burst = await asyncio.gather(*(place(a, f"cp-11-{a}") for a in accts[:5]))
        fake("limit 50")
        st = fake()
        print(f"   ... with the broker allowing 3 a second: {st['breaches']} 'too many' answers, all resent")
        s.check("'too many requests' answers are waited out and resent — every copy lands", (sum(x.ok for x in burst),
                st["breaches"] > 0), (5, True))
        # 7. a MASTER listens through the pool (step 4): its new order is heard; after a drop it is heard again
        from providers.ctrader import CTraderProvider
        heard = []

        async def on_event(ev, mid):
            heard.append(ev["type"])
        warm(500)
        m = CTraderProvider("master-1", creds(500), "demo", on_event)
        m.start()
        await asyncio.sleep(1.5)
        s.check("the master is logged in on the pool, no connection of its own", (m._authed, m.client is
                                                                                  pool.POOL._home[500].client), (True, True))
        fake("push 500")
        await asyncio.sleep(0.5)
        s.check("its new order is heard and copied (PLACED)", heard, ["PLACED"])
        fake("drop")
        await asyncio.sleep(5.0)
        fake("push 500")
        await asyncio.sleep(0.5)
        s.check("after the connection drops and comes back, it is heard again", heard.count("PLACED"), 2)
        m.stop()
    finally:
        fake.close()
        reactor.stop()


reactor.callWhenRunning(lambda: asyncio.ensure_future(main()))
reactor.run()
s.done()
