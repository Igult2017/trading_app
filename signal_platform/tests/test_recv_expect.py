"""THE SHARED SOCKET CARRIES PUSHES, NOT JUST REPLIES — the regression for a real outage.

WHAT HAPPENED, 2026-08-21, in production. A demo position was opened. cTrader pushed a
ProtoOAExecutionEvent (2126) onto the same socket the candle fetch reads. The reconcile request read
that push AS ITS REPLY, so its real reply (ProtoOAReconcileRes, 2125) stayed in the buffer for the
next reader — the candle fetch — which reported `unexpected payloadType=2125` and then
`MISALIGNED response` on every fetch afterwards. **One stray push desynchronises the stream
permanently**, because from then on every read is one message behind.

`_req_lock` does not protect against this. It serialises REQUESTS; the push arrives between a
request and its reply no matter who holds the lock.

`recv` already skipped heartbeats for precisely this reason — the fix was to stop treating
heartbeats as the only thing that can arrive uninvited.
"""
import asyncio
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from data import ctrader_session as S                      # noqa: E402

failed, count = [], 0

WANT = 2138          # ProtoOAGetTrendbarsRes — what a candle fetch is waiting for
EXEC = 2126          # ProtoOAExecutionEvent — pushed when a position opens
SPOT = 2131          # ProtoOASpotEvent
RECON = 2125         # ProtoOAReconcileRes — the message that actually did the damage


def check(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def teeth(name, broke: bool):
    global count
    count += 1
    print(f"   {'PASS' if broke else 'FAIL'}  TEETH — {name}: {broke}")
    if not broke:
        failed.append(f"TEETH:{name}")


class Msg:
    def __init__(self, pt):
        self.payloadType = pt
        self.payload = b""


def feed(*types):
    """Replace `recv` with a scripted stream, so this exercises the REAL recv_expect."""
    seq = list(types)

    async def _recv(reader):
        if not seq:
            raise AssertionError("recv_expect asked for more messages than the stream had")
        return Msg(seq.pop(0))

    S.recv = _recv


print()
print("SHARED SOCKET — a reply must be found past any number of pushes")

feed(WANT)
check("a clean reply comes straight back",
      asyncio.run(S.recv_expect(None, WANT)).payloadType, WANT)

# THE EXACT OUTAGE: an execution event arriving before the reply.
feed(EXEC, WANT)
check("an execution event before the reply is STEPPED OVER",
      asyncio.run(S.recv_expect(None, WANT)).payloadType, WANT)

feed(EXEC, SPOT, RECON, EXEC, WANT)
check("several pushes, including another request's reply, are stepped over",
      asyncio.run(S.recv_expect(None, WANT)).payloadType, WANT)

# A REAL ERROR MUST COME BACK, not be skipped — otherwise the caller waits out the timeout and
# reports "no reply" instead of the reason the broker gave.
feed(S.PT_OA_ERROR, WANT)
check("a broker error is RETURNED, not skipped",
      asyncio.run(S.recv_expect(None, WANT)).payloadType, S.PT_OA_ERROR)
feed(S.PT_ERROR, WANT)
check("a protocol error likewise", asyncio.run(S.recv_expect(None, WANT)).payloadType, S.PT_ERROR)

# It must not spin for ever on a stream that never answers.
feed(*([EXEC] * 70))
try:
    asyncio.run(S.recv_expect(None, WANT, max_skip=8))
    check("endless pushes raise rather than hang", False, True)
except RuntimeError as exc:
    check("endless pushes raise rather than hang", "without a reply" in str(exc), True)

# ── TEETH ────────────────────────────────────────────────────────────────────
feed(EXEC, WANT)
teeth("the push really is a different type from the reply", EXEC != WANT)
feed(EXEC, WANT)
teeth("a bare recv WOULD have returned the wrong message",
      asyncio.run(S.recv(None)).payloadType == EXEC)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
