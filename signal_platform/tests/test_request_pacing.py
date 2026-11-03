"""
test_request_pacing.py — run with:
    cd signal_platform && python tests/test_request_pacing.py

WHAT THIS PROTECTS, AND WHY IT READS THE SOURCE RATHER THAN CALLING ANYTHING.

On 2026-11-03 production was refused with `BLOCKED_PAYLOAD_TYPE — "You are being rate limited"` while
the candle fetch was pacing PERFECTLY: the four failing requests went out at 48.377 / 48.677 /
48.979 / 49.279, exactly `_MIN_REQ_GAP` apart. The budget was being spent by modules that took
`_req_lock` — so the socket stayed ordered — but never waited for their turn:

    ctrader_spread._newest        ProtoOAGetTickDataReq, a HISTORICAL request, TWICE per quote
                                  (bid then ask), ~312 of them in an 18-minute window
    ctrader_positions (deal list) a HISTORICAL request
    ctrader_positions (reconcile) the roomier budget, but see below

AND THE SECOND-ORDER DAMAGE IS THE PART A COUNTER WOULD MISS. A send that does not STAMP the shared
clock leaves the NEXT properly-paced caller measuring its gap from a stale timestamp, concluding the
gap has already passed, and firing immediately. So one unpaced request buys a second, paced one for
free and they land in the same slot. That is why even the reconcile call — which is not on the
scarce budget — still has to go through the gate.

THE RULE: every `_sess.send(` on the shared socket is immediately preceded by `await_turn()`.

A behavioural test cannot check this. It would need a broker, and worse, it would only exercise the
paths it happened to call — the whole failure here was a path nobody thought to look at. Reading the
source checks ALL of them, including one added next year. Same idiom as `server/lib/entryParity.test.ts`,
which reads the two server entry files to prove they stayed in step.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def teeth(what, broke_it_and_failed):
    global _pass, _fail
    print(f"  {'PASS' if broke_it_and_failed else 'FAIL'}  TEETH — {what}")
    if broke_it_and_failed:
        _pass += 1
    else:
        _fail += 1


# The modules that send on the ONE shared Open API socket. `ctrader_session` is excluded on purpose:
# its two sends are the application and account handshakes, which happen once per connection, not
# per request — and pacing them would delay a reconnect for no benefit.
SENDERS = [
    "data/ctrader_client.py",
    "data/ctrader_orders.py",
    "data/ctrader_spread.py",
    "data/ctrader_positions.py",
]

# `_load_symbols` sends the symbol list exactly once per process (it returns early when the cache is
# warm), so it is not part of the repeating traffic this gate exists to space out.
EXEMPT_CONTEXT = "_load_symbols"


def unpaced_sends(path: Path) -> list[int]:
    """Line numbers of `_sess.send(` calls with no `await_turn()` in the few lines above them."""
    lines = path.read_text(encoding="utf-8").splitlines()
    bad = []
    for i, line in enumerate(lines):
        if "_sess.send(" not in line:
            continue
        # Look back far enough to clear the request-building lines and their comments.
        window = "\n".join(lines[max(0, i - 14):i])
        if EXEMPT_CONTEXT in "\n".join(lines[max(0, i - 6):i + 1]):
            continue
        if "await_turn()" not in window:
            bad.append(i + 1)
    return bad


print("\nEVERY REQUEST ON THE SHARED SOCKET WAITS ITS TURN\n")

print("1. the gate exists, in one place:")
client = (ROOT / "data/ctrader_client.py").read_text(encoding="utf-8")
check("await_turn is defined once", len(re.findall(r"^async def await_turn", client, re.M)), 1)
check("it stamps the shared clock", "_last_req = time.monotonic()" in client, True)
teeth("and it is the ONLY place that stamps it",
      len(re.findall(r"_last_req\s*=\s*time\.monotonic\(\)", client)) == 1)

print("\n2. no send on this socket skips it:")
total = 0
for rel in SENDERS:
    p = ROOT / rel
    bad = unpaced_sends(p)
    total += bad and len(bad) or 0
    check(f"{rel}", bad, [])

print("\n3. the inline copies are gone — one definition, not four:")
# ⚠ `ctrader_client` is expected to hold EXACTLY ONE copy of this arithmetic, because that copy IS
# `await_turn`. Anywhere else, and any second copy here, is a module pacing itself again — which is
# how the four sites drifted apart in the first place.
for rel in SENDERS:
    body = (ROOT / rel).read_text(encoding="utf-8")
    copies = len(re.findall(r"_MIN_REQ_GAP\s*-\s*\(time\.monotonic\(\)", body))
    check(f"{rel} private pacing blocks", copies, 1 if rel.endswith("ctrader_client.py") else 0)

print("\n4. the checker can actually see a fault (or it proves nothing):")
# A send with no gate above it must be reported — otherwise every PASS above is meaningless.
probe = ROOT / "tests" / "_pacing_probe.tmp"
probe.write_text("async def f(writer, req):\n    await _sess.send(writer, 1, b'')\n", encoding="utf-8")
try:
    teeth("an unpaced send is detected", unpaced_sends(probe) == [2])
finally:
    probe.unlink(missing_ok=True)

print(f"\n{'ALL PASS' if _fail == 0 else f'{_fail} FAILED'} — {_pass + _fail} checks\n")
sys.exit(0 if _fail == 0 else 1)
