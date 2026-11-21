"""CAPACITY THROUGH THE WHOLE COPIER — one master order copied to 2,000 followers, database included (plan step 10).

Run by hand (not in run_all — it needs Node):
    python copy_platform/tests/capacity_dispatch.py <dir with @electric-sql/pglite-socket installed> [followers]

What runs for real: the dispatcher (claim + jobs in one commit, every per-follower gate — symbol, session, account,
risk guard, sizing, the 3% cap — and the follower trade record), the connection pool, the executor, the protocol's
pacing. What stands in: Postgres is PGlite (a real Postgres, in-process in Node, over its socket server — never
Docker); cTrader is `fake_ctrader.py` in its own process (enforces 50/s per connection); credentials are not decrypted
(the tokens are fakes the stand-in accepts). Followers use fixed 0.1-lot sizing so no live balance read is needed.

Prints: the time from the master's event to the last follower's copy, orders the broker received, requests over its
limit, jobs done, and the busiest connection's messages in one second.
"""
import os
import socket
import subprocess
import sys
import time


def free_port():
    with socket.socket() as so:
        so.bind(("127.0.0.1", 0))
        return so.getsockname()[1]


N = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
PG_DIR = sys.argv[1]
PG_PORT = free_port()
pg = subprocess.Popen(["node", os.path.join(PG_DIR, "node_modules", "@electric-sql", "pglite-socket", "dist",
                                            "scripts", "server.js"), "-p", str(PG_PORT), "-m", "60"],
                      stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
for _ in range(100):
    try:
        socket.create_connection(("127.0.0.1", PG_PORT), 1).close()
        break
    except OSError:
        time.sleep(0.2)
os.environ["DATABASE_URL"] = f"postgresql://postgres:postgres@127.0.0.1:{PG_PORT}/postgres?sslmode=disable"
os.environ["COPY_USE_POOL"] = "demo"
os.environ["COPY_ACCOUNTS_PER_CONN"] = "50"
os.environ["COPY_DB_POOL"], os.environ["COPY_DB_OVERFLOW"] = "40", "10"

from _harness import Suite                                                # noqa: E402
import asyncio                                                            # noqa: E402
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
from twisted.internet import asyncioreactor                               # noqa: E402
_loop = asyncio.new_event_loop()
asyncio.set_event_loop(_loop)
asyncioreactor.install(_loop)
from twisted.internet import reactor                                      # noqa: E402
import types                                                              # noqa: E402

import fake_ctrader                                                       # noqa: E402
fake_ctrader.plain_tcp_for_tests()
import config                                                             # noqa: E402
import db as DB                                                           # noqa: E402
import dispatcher                                                         # noqa: E402
import pool                                                               # noqa: E402
import symbol_details                                                     # noqa: E402
import ctrader_protocol                                                   # noqa: E402
from providers.ctrader import OrderSnapshot                               # noqa: E402
import json                                                               # noqa: E402


class Fake:
    """The stand-in broker in its own process, driven over its control port (same driver as test_pool.py)."""

    def __init__(self):
        self.port, self.ctl = free_port(), free_port()
        self.proc = subprocess.Popen([sys.executable, "-u", os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                      "fake_ctrader.py"), str(self.port), str(self.ctl)],
                                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        assert self.proc.stdout.readline().strip() == b"ready"

    def __call__(self, cmd="stats") -> dict:
        with socket.create_connection(("127.0.0.1", self.ctl)) as so:
            so.sendall(cmd.encode() + bytes([10]))
            return json.loads(so.makefile().readline())

    def close(self):
        self.proc.kill()

s = Suite(f"COPY — one master order to {N} followers, through the whole copier")
SPEC = types.SimpleNamespace(lotSize=10_000_000, stepVolume=100_000, minVolume=100_000, maxVolume=10 ** 12,
                             digits=5, pipPosition=4)
DB.Base.metadata.create_all(DB.engine, tables=[t.__table__ for t in (DB.BrokerAccount, DB.CopyMaster,
                            DB.CopyFollower, DB.CopyTradeMaster, DB.CopyTradeFollower, DB.CopyExecutionLog,
                            DB.CopyJob)])
with DB.Session() as db:
    db.add(DB.BrokerAccount(id="ba-m", user_id="u", platform="ctrader", account_type="demo", is_active=True,
                            balance=10000))
    db.add(DB.CopyMaster(id="m1", user_id="u", broker_account_id="ba-m", source_type="ctrader", is_active=True))
    for i in range(N):
        db.add(DB.BrokerAccount(id=f"ba-{i}", user_id=f"u{i}", name="acct", login_id=str(20000 + i),
                                platform="ctrader", account_type="demo", is_active=True, balance=10000))
        db.add(DB.CopyFollower(id=f"f-{i}", user_id=f"u{i}", broker_account_id=f"ba-{i}", master_id="m1",
                               lot_mode="fixed", fixed_lot=0.1, direction="same", is_active=True, risk_accepted=True,
                               session_filter=False, trade_delay_sec=0))
    db.commit()
CREDS = {f"ba-{i}": {"ctraderId": str(20000 + i), "accessToken": "good"} for i in range(N)}


async def _creds(b):
    return CREDS.get(b.id)
dispatcher.get_creds = _creds
for i in range(N):
    symbol_details.put_symbol_map(20000 + i, {"EURUSD": 1})
    symbol_details._cache[(20000 + i, 1)] = SPEC


async def main():
    fake = Fake()
    config.CT_DEMO_HOST, config.CT_PORT = "127.0.0.1", fake.port
    pool.POOL = pool.Pool()
    try:
        t0 = time.monotonic()
        out = await pool.POOL.warm([(c, "demo") for c in CREDS.values()])
        print(f"   ... {N} followers logged in at start-up in {time.monotonic() - t0:.1f}s "
              f"({sum(1 for v in out.values() if v is None)} ok)")
        fake("reset")
        ctrader_protocol.PEAK = 0
        order = OrderSnapshot(order_id=777, symbol="EURUSD", action="BUY", volume_lots=1.0, order_type="STOP",
                              price=1.1050, stop_loss=1.1040, take_profit=1.1070)
        from collections import Counter
        from sqlalchemy import event as sa_event
        kinds = Counter()

        def _count(conn, cursor, statement, *a):
            kinds[statement.split()[0].upper() + " " + (statement.split(" FROM ")[1].split()[0] if " FROM " in statement
                                                        else statement.split()[1] if len(statement.split()) > 1 else "")] += 1
        sa_event.listen(DB.engine, "before_cursor_execute", _count)
        t0 = time.monotonic()
        await dispatcher.dispatch({"type": "PLACED", "order": order}, "m1")
        sa_event.remove(DB.engine, "before_cursor_execute", _count)
        print(f"   ... database statements per follower: {sum(kinds.values()) / N:.1f}")
        for k, v in kinds.most_common(12):
            print(f"         {v / N:5.2f}  {k}")
        took = time.monotonic() - t0
        st = fake()
        with DB.Session() as db:
            done = db.query(DB.CopyJob).filter(DB.CopyJob.status == "done").count()
            placed = db.query(DB.CopyTradeFollower).filter_by(event_type="PLACED", status="executed").count()
        print(f"   ... master order -> last of {N} followers: {took:.2f}s | broker got {st['orders']} orders, "
              f"{st['breaches']} over its limit | {done} jobs done, {placed} copies recorded | busiest connection "
              f"{ctrader_protocol.PEAK} in one second")
        s.check(f"all {N} copies reached the broker", st["orders"], N)
        s.check("none over cTrader's limit", st["breaches"], 0)
        s.check("every job done, every copy recorded", (done, placed), (N, N))
    finally:
        fake.close()
        reactor.stop()


reactor.callWhenRunning(lambda: asyncio.ensure_future(main()))
reactor.run()
pg.kill()
s.done()
