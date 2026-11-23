"""PIX OPTIONS, END TO END on a REAL Postgres (PGlite over its socket) — the engine's own code, the tables exactly as
`docker-migrate.sql` creates them (23 Nov 2026). In words:
  1. a stored run (today's real gold overnight table + one Barchart pick) is MAPPED once: 6 levels saved, the map posted
     (one message per market — gold mapped, the two pairs "could not be read"), the run marked mapped;
  2. the same minute again → nothing re-posted;
  3. 1M candles touch 3618.6 and close back below → ONE signal; the level is marked signalled;
  4. the next minute (or after a restart) → no second signal for it;
  5. a NEW run for gold → the old levels still watched are marked replaced (levels are locked until the next open).
Run by hand (needs node + @electric-sql/pglite-socket): python tests/pix/pg_options_e2e.py
"""
import asyncio
import json
import os
import re
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))


def free_port():
    with socket.socket() as so:
        so.bind(("127.0.0.1", 0))
        return so.getsockname()[1]


PORT = free_port()
pg = subprocess.Popen(["node", str(REPO / "node_modules" / "@electric-sql" / "pglite-socket" / "dist" / "scripts" /
                                   "server.js"), "-p", str(PORT), "-m", "5"],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try:
        socket.create_connection(("127.0.0.1", PORT), 1).close()
        break
    except OSError:
        time.sleep(0.2)
os.environ["DATABASE_URL"] = f"postgresql://postgres:postgres@127.0.0.1:{PORT}/postgres?sslmode=disable"
BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


try:
    from sqlalchemy import text
    from storage.db import engine
    sql = (REPO / "docker-migrate.sql").read_text(encoding="utf-8")
    block = sql[sql.index("CREATE TABLE IF NOT EXISTS options_snapshots"):sql.index("-- ── copy_engine_heartbeat")]
    with engine.begin() as c:
        for stmt in [s.strip() for s in block.split(";") if s.strip() and not s.strip().startswith("--")]:
            c.execute(text(re.sub(r"--[^\n]*", "", stmt)))
    from core.types import Candle
    from storage import options_repo as R
    from strategies.pix_options import job as J, signals as S
    from notifications import dispatcher as D
    sent = []

    async def fake_send(msg, *a, **k):
        sent.append(msg)
        return True
    D._send_text = fake_send

    gold = [[-0.10, 4.921, 3462.5, 127.11, 0.90, 51.82], [-0.25, 14.15, 3524.6, 74.21, 0.75, 49.13],
            [-0.35, 21.50, 3552.0, 54.27, 0.65, 47.57], [-0.50, 35.03, 3586.1, 33.60, 0.50, 45.91],
            [-0.66, 53.34, 3618.6, 19.45, 0.34, 44.75], [-0.76, 69.94, 3642.5, 12.24, 0.24, 44.00],
            [-0.91, 111.77, 3692.4, 4.101, 0.09, 42.77]]
    rows = [dict(zip(("put_delta", "put_price", "strike", "call_price", "call_delta", "iv"), r)) for r in gold]
    t0 = datetime(2026, 11, 23, 8, 10, tzinfo=timezone.utc)

    def store(run, when):
        with engine.begin() as c:
            c.execute(text("INSERT INTO options_snapshots (run_id, slot, source, market, taken_at, expiry, spot, rows) "
                           "VALUES (:r, 'ln', 'investing', 'XAU/USD', :t, '2026-11-24', 3584.4, CAST(:rows AS JSONB))"),
                      {"r": run, "t": when, "rows": json.dumps(rows)})
            c.execute(text("INSERT INTO options_snapshots (run_id, slot, source, market, taken_at, spot, futures, rows, "
                           "picks) VALUES (:r, 'ln', 'barchart', 'XAU/USD', :t, 3584.4, 3600.0, '[]'::jsonb, "
                           "CAST(:p AS JSONB))"),
                      {"r": run, "t": when, "p": json.dumps([{"side": "buy", "strike": 3566.0, "spot": 3550.0,
                                                              "fails": []}])})

    store("run-1", t0)
    loop = asyncio.new_event_loop()
    loop.run_until_complete(J.run_once())
    with engine.connect() as c:
        lv = {r.level: (r.label, r.grade, r.status) for r in c.execute(text("SELECT * FROM options_levels"))}
    check("1. six levels saved, ATM 3586.1 not among them", (len(lv), 3586.1 in lv), (6, False))
    check("   3552.0 Active Dealer Support graded A (Barchart full qualifier at 3550)", lv[3552.0],
          ("Active Dealer Support", "A", "watching"))
    check("   the map posted as one message per market (3)", len(sent), 3)
    check("   gold mapped; the pairs say their table could not be read",
          ("3618.60" in sent[0], "could not be read" in sent[1] and "could not be read" in sent[2]), (True, True))
    loop.run_until_complete(J.run_once())
    check("2. the next minute: nothing re-posted", len(sent), 3)

    base = int(t0.timestamp()) + 600
    m1 = [Candle(base + 60 * i, o, h, l, c, 1, "M1") for i, (o, h, l, c) in
          enumerate([(3605, 3610, 3600, 3605), (3612, 3620, 3605, 3615), (3615, 3619, 3608, 3612)])]
    sigs = loop.run_until_complete(S.check("XAU/USD", m1, 0.3, "pix", "PIX"))
    check("3. touch 3618.6 then a close back below → ONE SELL signal at 3612",
          [(s.direction.value, s.entry_price, s.label) for s in sigs], [("sell", 3612, "PIX-OPTIONS")])
    with engine.connect() as c:
        st = c.execute(text("SELECT status FROM options_levels WHERE level = 3618.6")).scalar()
    check("   the level is marked signalled", st, "signalled")
    again = loop.run_until_complete(S.check("XAU/USD", m1, 0.3, "pix", "PIX"))
    check("4. the next minute / after a restart: no second signal", again, [])

    store("run-2", datetime(2026, 11, 23, 13, 10, tzinfo=timezone.utc))
    loop.run_until_complete(J.run_once())
    with engine.connect() as c:
        old = sorted({r.status for r in c.execute(text("SELECT status FROM options_levels WHERE run_id = 'run-1'"))})
        new = c.execute(text("SELECT count(*) FROM options_levels WHERE run_id = 'run-2' AND status = 'watching'")).scalar()
    check("5. a new open: run-1's levels replaced (the signalled one kept as signalled); run-2 watched",
          (old, new), (["replaced", "signalled"], 6))
    print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} FAILED: {BAD}'} ({N[0]} checks)", flush=True)
finally:
    pg.kill()
os._exit(1 if BAD else 0)
