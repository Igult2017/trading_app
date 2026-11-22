"""THE SIGNAL ENGINE'S ORDER CONNECTION — one, kept open — against the stand-in cTrader (22 Nov 2026, sync plan step 3).

Until now every order command opened a NEW connection, logged in and hung up. The website, this engine and the copier
share ONE cTrader app. The stand-in (`copy_platform/tests/fake_ctrader.py`, its own process) speaks cTrader's framing;
the REAL `StopOrderClient` and the REAL `order_line` run against it. In words, what must hold:
  * six orders → ONE connection, ONE app login, the symbol list downloaded once;
  * another order's news arriving just BEFORE ours is not taken as our answer;
  * a dropped connection is reopened by the next command, which still works;
  * this engine reports 1 order connection open (its price connection is not opened by this test).
"""
import asyncio
import json
import os
import socket
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x.invalid/x")   # as run_all gives every test
os.environ.setdefault("CTRADER_CLIENT_ID", "test-client")
os.environ.setdefault("CTRADER_CLIENT_SECRET", "test-secret")
FAKE = os.path.abspath(os.path.join(HERE, "..", "..", "copy_platform", "tests", "fake_ctrader.py"))

failed = []


def check(name, got, want):
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def free_port():
    with socket.socket() as so:
        so.bind(("127.0.0.1", 0))
        return so.getsockname()[1]


PORT, CTL = free_port(), free_port()
proc = subprocess.Popen([sys.executable, "-u", FAKE, str(PORT), str(CTL)], stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL)
assert proc.stdout.readline().strip() == b"ready"


def fake(cmd="stats"):
    with socket.create_connection(("127.0.0.1", CTL)) as so:
        so.sendall(cmd.encode() + b"\n")
        return json.loads(so.makefile().readline())


async def main():
    from data import ctrader_session as sess
    sess.HOSTS["demo"], sess.PORT = "127.0.0.1", PORT
    real_open = asyncio.open_connection

    async def plain(host, port, ssl=None, **kw):              # the stand-in speaks plain TCP, not TLS
        return await real_open(host, port, **kw)
    asyncio.open_connection = plain

    from execution.broker import StopOrderClient
    from data import ctrader_usage
    creds = {"ctraderId": "777", "accessToken": "good"}

    async def place(i):
        return await StopOrderClient(creds, "demo").place_stop("EUR/USD", "BUY", 100_000, 1.1050 + i * 1e-4, 1.1000,
                                                              1.1100, lots=0.01, label=f"auto-test-{i}")
    res = [await place(i) for i in range(6)]
    st = fake()
    check("six orders placed", sum(r.ok for r in res), 6)
    check("...on ONE connection, logged in ONCE", (st["conns"], st["app_logins"], st["account_logins"].get("777")),
          (1, 1, 1))
    check("...the symbol list downloaded once, not per order", st["symbol_lists"], 1)
    check("this engine reports its order connection open", ctrader_usage.held(), 1)

    fake("noise first")
    mine = await place(10)
    fake("noise off")
    check("another order's news arriving FIRST is not taken as ours (its id is 1)",
          (mine.ok, mine.order_id not in (None, "1")), (True, True))

    fake("drop")
    await asyncio.sleep(0.5)
    after = await place(11)
    st = fake()
    check("after the connection drops, the next order reopens it and is placed", (after.ok, st["app_logins"]), (True, 2))
    check("...still one connection", st["conns"], 1)

    # THE PRICE CONNECTION'S KEEP-ALIVE (it sent none): sent when idle, never while a request is talking.
    class W:
        def __init__(self): self.frames = []
        def write(self, b): self.frames.append(b)
        async def drain(self): pass
        def is_closing(self): return False
    from data.ctrader_client import _req_lock
    w, sess.KEEPALIVE_S, sess._writer = W(), 0.05, None
    sess._writer = w
    t = asyncio.ensure_future(sess.keepalive_forever())
    await asyncio.sleep(0.3)
    idle = len(w.frames)
    async with _req_lock:
        before = len(w.frames)
        await asyncio.sleep(0.3)
        during = len(w.frames) - before
    t.cancel()
    sess._writer = None
    check("the price connection sends keep-alives while idle", idle >= 3, True)
    check("...and none while a request holds the line", during, 0)


try:
    asyncio.new_event_loop().run_until_complete(main())
finally:
    proc.kill()
print("ALL PASS" if not failed else f"{len(failed)} FAILED: {failed}")
sys.exit(1 if failed else 0)
