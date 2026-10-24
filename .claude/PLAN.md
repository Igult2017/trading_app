# Copy trading: the safety net catches missed closes but never missed OPENS

## Context

His report: *"Copy trading platform not working at all. I placed one trade and set copy and it was
never copied. Copy trading log is also not working."* And, when I first misread the data:
*"If you cant see the master account and slave account i had set then it means the logs are not
working. Because even right it is still there and i did not drop or disconnect the copy."*

**He was right on every point.** His setup is intact and active, his trade was real, and the log is
empty because the engine never saw the trade — not because the log is broken.

### The evidence chain, all from production

The engine is healthy: heartbeat 30s old, 8 masters, 4 providers, dry-run OFF, keys set. His pair is
active: follower `4fa29e0d` -> master `67470ef2` ("My signal service") -> slave "Master #1", risk 1%,
deployed 15 Oct.

His trade, from the journal's own sync log on that master's account (`e31e9caa`), 18 Oct 21:05:50:

    recorded      EURUSD  Short 1.5 lots, P/L 0
    live-latency  EURUSD  live feed -> database in 43ms
    journaled     EURUSD  BE 0 . no R (no original stop)
    missed-close          1 position(s) closed at the broker with no trade recorded
                          (249197536) — the live feed missed them; fetching now

The journal caught it in **43 milliseconds**. The copy engine's newest recorded master trade is
**12 Oct** — six days earlier. One system saw it instantly; the other recorded nothing. And the
journal's own words confirm the live feed **does** drop events.

## ARCHITECTURE (Phase 1)

Files, and the data flow through them:

| file | role in this fault |
|---|---|
| `copy_platform/providers/ctrader.py` | watches each master over a live socket; holds `_positions`; the 30s reconcile. **THE ONLY FILE CHANGED.** |
| `copy_platform/dispatcher.py` | `dispatch()` -> duplicate guard (`:127-135`) -> `_save_master_trade` (`:160`) -> per-follower execution + log rows |
| `copy_platform/db.py:124` | `CopyTradeMaster` — the master-trade table the log joins against |
| `copy_platform/config.py:116` | `RECONCILE_INTERVAL` (30s) |
| `copy_platform/tests/` | `run_all.py` + `test_provider_resilience.py` — where the new test goes |

Data flow today: broker -> live execution event -> `_handle_execution` -> `on_event` -> `dispatch`
-> master trade row -> followers -> execution log. **If the live event is missed, every stage after
it never runs, so there is no row and no log line.**

### The root cause, in the code's own comment

`copy_platform/providers/ctrader.py:315-318`, inside the 30-second safety reconcile:

    # Track newly-seen positions silently — do NOT emit OPEN (the live
    # execution event already handles opens; avoids double-copying).
    for pid, snap in fresh.items():
        self._positions.setdefault(pid, snap)

The reconcile emits a synthetic **CLOSE** for a position that vanished, but **never an OPEN** for one
that appeared, on the assumption that the live event already handled it. When the live event is
missed, that assumption fails and three things follow:

1. No OPEN is dispatched -> **no master trade row -> no follower evaluation -> no log line at all.**
   That is exactly why the log looks dead.
2. The reconcile then silently adopts the position, so the engine believes it always knew about it.
3. When it closes, the reconcile emits a synthetic CLOSE for a position the follower never opened ->
   **"No open follower position for master pos 242751204"**, which is already in his log twice.

Those two SKIP rows from September are the fingerprint of this bug, firing a month before he
reported it.

**Intended outcome:** a trade placed on a master is copied even when the live event is missed, and
every decision — including a refusal — leaves a log line.

## TASKS (Phase 2)

1. **Emit OPEN for a genuinely new position** — `providers/ctrader.py`, in the `else` branch (the
   periodic reconcile, NOT the initial load), beside the existing vanished -> CLOSE loop: a position
   in `fresh` that is not in `self._positions` is an entry the live event missed -> emit
   `{"type": "OPEN", "snap": snap}` through the same `self.on_event` path CLOSE already uses.

   **Why it is safe, and why the comment's fear does not apply.** `dispatch` already holds a
   database-backed duplicate guard (`dispatcher.py:127-135`): for an OPEN it counts OPEN rows against
   CLOSE rows for that master + position id and skips when one is already open. If the live event did
   arrive, the reconcile's OPEN is dropped there. Double-copying is prevented by the layer below; the
   provider does not need to prevent it by staying silent.

   **THE INITIAL LOAD MUST STAY SILENT.** The `if not self._reconciled` branch records existing open
   positions without diffing and must keep doing exactly that. Emitting OPENs there would copy every
   position already open on the master on every engine restart — far worse than the bug being fixed.
   The change belongs ONLY in the `else`.

2. **A log line when a missed entry is recovered.** The CLOSE path logs
   `reconcile: position {pid} closed externally`; the new OPEN path gets the matching line, naming it
   as a recovery, so this failure is visible next time instead of silent.

3. **Tests** (see Verification).

## NOT CHANGING WITHOUT HIS WORD

**His 18 Oct trade had no stop loss** (`journaled: BE 0 . no R (no original stop)`), and his follower
is on **risk 1% sizing**, which refuses to size without one — the log carries that refusal three
times: *"Risk-% mode: can't size — the trade has no stop-loss, or your account balance isn't synced
yet"*. So **even with this fix, that particular trade would still not have copied.** That is a
setting, not a bug: trade with a stop, or move the follower to fixed-lot or multiplier sizing.
Flagged, not changed.

Same for the **session filter** — five skips read *"outside the allowed sessions — chose London,
New York; open now: Sydney"*. Working as configured.

## SCOPE

Covers batch B item 2 (copy trading) and explains item 3 (copy log — the log is correct; it was
empty because nothing was ever dispatched).

**Still open in B, not covered here:** item 4, the sync performance log — its endpoint works and
returns live data, so I need to know what he actually sees on screen; and item 10, the assets page,
which is a rebuild rather than a bug fix and needs its own plan.

## VERIFICATION (Phase 4)

**NO REAL ORDERS.** Nothing here places a trade on any of his accounts.

1. **Unit test on the reconcile diff**, beside `test_provider_resilience.py`, driving the real handler:
   - a position present in the reconcile but absent from `_positions` -> **emits OPEN**
   - a position that vanished -> still emits CLOSE (unchanged)
   - a position already known -> emits nothing (no duplicate)
   - **the initial load emits nothing at all**, however many positions come back — the regression
     that would copy the world on restart
2. **The duplicate guard holds**: a live OPEN followed by a reconcile OPEN for the same position
   produces exactly one master trade row, proven through `dispatch` against the real guard.
3. `python copy_platform/tests/run_all.py` — the existing suite stays green.
4. **Deploy, then grep the live log** for the recovery line — a job wired but dead has shipped here
   before with every check green.
5. **The real proof is his next trade**: a trade on a master should produce a master trade row and a
   follower decision within ~30 seconds even if the live event is missed. I check the diagnostics
   endpoint after he places one, rather than placing one myself.
