"""THE COPY ENGINE'S MESSAGE DECODER MUST MATCH THE LIBRARY IT CALLS.

WHAT HAPPENED. Production logs on 2026-09-01 showed the copy provider dying and reconnecting every
~6 seconds, 63 times in 7.5 minutes, forever:

    File "/app/copy_platform/providers/ctrader.py", line 137, in _on_message
      res = Protobuf.extract(message, ProtoOASymbolsListRes)
    builtins.TypeError: Protobuf.extract() takes 2 positional arguments but 3 were given

`Protobuf.extract` is a CLASSMETHOD taking only `(message)` — it works the type out itself from
`message.payloadType`. Passing the expected type as a second argument was never valid: `cls` +
message + type is three. All EIGHT call sites did it (four in `providers/ctrader.py`, four in
`executors/ctrader.py`), so the master feed died at the very first symbols response, every time.

NOT A VERSION DRIFT. `ctrader-open-api` is pinned at 0.9.2 in both `copy_platform/requirements.txt`
and the signal platform, and 0.9.2 is what is installed. The call was wrong against the pinned
version all along — which is why no upgrade and no rebuild would ever have fixed it.

WHY IT WAS INVISIBLE. Every call sits inside `elif ptype == X().payloadType:`, so it only runs when
a real broker message of that type arrives. Nothing in the test suite decoded a real message, so the
whole decoder was unexercised — the failure needed a live socket to appear at all.

THIS TEST DECODES A REAL MESSAGE THROUGH THE REAL INSTALLED LIBRARY. It builds a genuine protobuf
payload, wraps it the way the wire does, and puts it through `Protobuf.extract` exactly as the
engine calls it. No mock of the library, because a mock of the library is what would have let this
through.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _harness import Suite

from ctrader_open_api import Protobuf
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOASymbolsListRes, ProtoOASymbolByIdRes,
    ProtoOAReconcileRes, ProtoOAExecutionEvent,
)

s = Suite("COPY ENGINE — the broker message decoder")


class Wire:
    """What the library hands `_on_message`: a payload type and the raw bytes."""
    def __init__(self, msg):
        self.payloadType = msg.payloadType
        self.payload = msg.SerializeToString()


# ── THE CALL FORM THE ENGINE USES MUST WORK ─────────────────────────────────
# One case per message type the engine decodes, because each is a separate call site.
src = ProtoOASymbolsListRes()
src.ctidTraderAccountId = 47535363
sym = src.symbol.add()
sym.symbolId, sym.symbolName = 1, "EURUSD"

out = Protobuf.extract(Wire(src))
s.check("a symbols list decodes", type(out).__name__, "ProtoOASymbolsListRes")
s.check("...and carries the symbols through", [(x.symbolId, x.symbolName) for x in out.symbol],
        [(1, "EURUSD")])
s.check("...and the account id survives the round trip", out.ctidTraderAccountId, 47535363)

by_id = ProtoOASymbolByIdRes()
by_id.ctidTraderAccountId = 47535363
s.check("a symbol-details response decodes",
        type(Protobuf.extract(Wire(by_id))).__name__, "ProtoOASymbolByIdRes")

rec = ProtoOAReconcileRes()
rec.ctidTraderAccountId = 47535363
s.check("a reconcile response decodes",
        type(Protobuf.extract(Wire(rec))).__name__, "ProtoOAReconcileRes")

ex = ProtoOAExecutionEvent()
ex.ctidTraderAccountId = 47535363
ex.executionType = 3          # ORDER_FILLED — a required field on this message
s.check("an execution event decodes",
        type(Protobuf.extract(Wire(ex))).__name__, "ProtoOAExecutionEvent")
s.check("...and keeps the execution type the copy logic branches on",
        Protobuf.extract(Wire(ex)).executionType, 3)

# The decoder identifies the type ITSELF — which is why passing it was never needed.
s.check("extract resolves the type from the message, not from an argument",
        type(Protobuf.extract(Wire(rec))).__name__ != type(Protobuf.extract(Wire(ex))).__name__,
        True)


# ── NO CALL SITE MAY PASS THE EXTRA ARGUMENT AGAIN ──────────────────────────
# Source check, because a call site only executes when a live broker message of that exact type
# arrives — which is precisely why this reached production and sat there.
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bad, total = [], 0
for folder, _dirs, files in os.walk(ROOT):
    # tests/ is excluded on purpose: this very file quotes the broken call in its docstring and
    # fires it in the teeth case, so scanning itself would report its own evidence as a defect.
    if "__pycache__" in folder or os.path.basename(folder) == "tests":
        continue
    for f in files:
        if not f.endswith(".py"):
            continue
        path = os.path.join(folder, f)
        text = open(path, encoding="utf-8").read()
        for m in re.finditer(r"Protobuf\.extract\(([^)]*)\)", text):
            total += 1
            if "," in m.group(1):
                bad.append(f"{os.path.relpath(path, ROOT)}: {m.group(0)}")

s.check("every Protobuf.extract call passes exactly one argument", bad, [])
s.check("...and all eight call sites are still present", total, 8)


# ── TEETH ───────────────────────────────────────────────────────────────────
# The exact call the engine shipped must still blow up, or this test proves nothing.
try:
    Protobuf.extract(Wire(src), ProtoOASymbolsListRes)
    reproduced = False
except TypeError:
    reproduced = True
s.teeth("the original two-argument call still raises TypeError", reproduced)

s.done()
