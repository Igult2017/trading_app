"""A DEPLOY NEVER RE-SENDS — the watch's memory through the REAL `strategy_state` table on a REAL Postgres (PGlite over its
socket), with the engine's own `strategy_state_repo.save/load` (23 Nov 2026).
Run by hand (needs node + @electric-sql/pglite-socket in the repo): python tests/cvd_divergence/pg_restart.py
"""
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..", "..")))
sys.path.insert(0, HERE)


def free_port():
    with socket.socket() as so:
        so.bind(("127.0.0.1", 0))
        return so.getsockname()[1]


PORT = free_port()
pg = subprocess.Popen(["node", os.path.join(REPO, "node_modules", "@electric-sql", "pglite-socket", "dist", "scripts",
                                            "server.js"), "-p", str(PORT), "-m", "5"],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try:
        socket.create_connection(("127.0.0.1", PORT), 1).close()
        break
    except OSError:
        time.sleep(0.2)
os.environ["DATABASE_URL"] = f"postgresql://postgres:postgres@127.0.0.1:{PORT}/postgres?sslmode=disable"
BAD = []
try:
    from storage.db import engine
    from storage.models import StrategyStateModel
    from storage import strategy_state_repo as repo
    from alerts.cvd_divergence import watch as W, job as J
    from _cases import worked, bar
    StrategyStateModel.__table__.create(engine, checkfirst=True)

    closed, forming = worked()[:60], bar(60, 3.0, 0.9, 0.9)
    st, ev = W.step(repo.load(J.STATE_ID) or {}, "EUR/USD", closed, forming, [])
    repo.save(J.STATE_ID, st)
    again = W.step(repo.load(J.STATE_ID) or {}, "EUR/USD", closed, forming, [])[1]   # "after the deploy"
    for name, got, want in (("before: STARTED sent once", [e["kind"] for e in ev], ["started"]),
                            ("after a restart, read back from Postgres: nothing re-sent", again, []),
                            ("the open watch survived the restart", list((repo.load(J.STATE_ID) or {}).get("watches", {})),
                             ["EUR/USD|bearish"])):
        ok = got == want
        print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}")
        if not ok:
            BAD.append(name)
    print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} FAILED'} (3 checks)", flush=True)
finally:
    pg.kill()
os._exit(1 if BAD else 0)
