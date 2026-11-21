# Plan — the copier: near-real-time, 2,000+ users on the ONE cTrader app we have (21 Nov 2026)

> **STATUS (21 Nov 2026): APPROVED by him. Step 1 DONE (lanes, deployed). Steps 2-5 BUILT and deployed with `COPY_USE_POOL=demo` (21 Nov): the pool, followers sending and masters listening through it, followers listened to. Measured on the stand-in broker: one trade to 2,000 followers in 1.53 s, zero over the limit. Steps 6-11 NOT started.** This supersedes
> `docs/copy-gateway-plan.md` (the 2-shared-connections plan).


## Context
His order: *"ensure slave copies every trade activity from the master account in almost real time … prioritize
scalability because at the end the copier will be commercialized."* Then: *"That plan should not involve asking for
another ctrader api … focus on using the open api we have. There is a way we can use the api we have for over 2000
users without the api even knowing it is serving 2000 … Act as a senior engineer."*

## The idea in one paragraph
cTrader limits **connections**, not users: 50 requests/second **per connection**, and one connection can carry many
logged-in accounts, because every message names its account (`ctidTraderAccountId`) and every push is tagged with it
(already relied on: `gateway.py` docstring, and the web app's shared sockets — `docs/ctrader-scaling.md`, THE GATE
opened 30 Sep: fills carry the account id). So we run a **pool of long-lived connections under our one app**, each
carrying a block of accounts (start 50, tuned by measurement). cTrader sees ~40 connections, not 2,000 users; we get
40 × 45/s = **1,800 orders/second** of headroom. Nothing connects per order any more, so each copy is ONE message.

| accounts | per connection | connections (demo+live) | send capacity | one master → all followers |
|---|---|---|---|---|
| 2,000 | 50 | 40 | 1,800 /s | ~1.1 s for the last of 2,000; the first in ~0.2 s |
| 2,000 | 100 | 20 | 900 /s | ~2.2 s for the last |
| today | 1 per order | 1 new per copy | — | 3-5 s EACH (20 Nov gold: open 5 s, close 3 s) |

## What the audit found (file:line)
1. **A new connection per copy** — connect, app login, account login, often a full read of the account, send, hang up
   (`executors/ctrader.py:231-241`). That IS the 3-5 s.
2. **Events race.** Each master event runs as its own task (`providers/ctrader.py:432` `ensure_future`). A move/cancel
   arriving while the follower's order is still being placed is SKIPPED (`dispatcher.py:337-345`) → a stale or orphan
   order on the follower; a fill arriving then is taken as a NEW entry (`mirror.py:91-94`) → **the follower can be in
   twice.** Not yet seen; the code allows it, and VIX.1 amends its resting orders often.
3. **A crash mid fan-out loses the rest** — nothing is written before sending (`docs/copy-platform.md` remaining #3).
4. **Nothing listens to follower accounts** — a refused order, or a copy he closes by hand, is never noticed.
5. **The built-but-unwired gateway has 5 faults** (`docs/copy-gateway-plan.md`: library sends 5 msgs/s not 45; leaks a
   connection on failed login and on every disconnect; never hears an account logout; reply matching unwritten).
6. **One connection per MASTER** too (`engine.py:219-240`) — fine at 5 masters, not at 500.

## Steps (in this order; each one measured before the next)
1. **Stop the race now (small, urgent).** One ordered lane per master ORDER/POSITION: events about the same trade run
   one after another; different trades and masters still run in parallel. A fill that arrives while the follower's
   placement is still in flight waits for it, then records the mirror's fill instead of entering again.
   *Measured by:* tests that fire PLACED→AMENDED→FILLED→CLOSE 10 ms apart against a slow fake broker — today's code
   double-enters (proves the test), the new code places once, moves once, records the fill, closes once.
2. **Rebuild `gateway.py` as a connection POOL** (`copy_platform/pool.py`, gateway.py deleted after cut-over):
   - N connections per environment, each carrying up to `COPY_ACCOUNTS_PER_CONN` accounts (start 50); new account →
     the least-loaded connection, sticky.
   - each connection: its own send queue (`OwnQueueProtocol`, D68), library pacing set to 45/s (fault 1), its own
     45/s token bucket, heartbeat every 8 s;
   - ONE Twisted client per connection, ever: the old one is stopped before a new one; on drop the SAME client
     reconnects and re-logs-in the app and its accounts, staggered under 45/s (faults 2-3);
   - account-level logout / token-invalidated / refused login → that account marked out, token refreshed through the
     existing `cred_manager.get_creds` (never a second refresher), re-logged in (fault 4);
   - replies matched: new order → `clientOrderId`; amend/cancel/close → `orderId`/`positionId`; reconcile/symbols →
     (account, message type); error replies matched the same way (fault 5).
3. **Followers send through the pool** — the executor keeps every order rule it has today and only swaps how it
   sends. Behind `COPY_USE_POOL` (instant switch back). Logged in once at start-up, not per order.
4. **Masters listen through the pool** — the master logic (`providers/ctrader.py`) is fed by account-routed pushes
   instead of owning a socket. 500 masters = a few connections, not 500.
5. **Follower accounts are listened to (free — they are on the pool already).** Their own pushes confirm each copy in
   milliseconds, keep a live picture of each follower's orders/positions (no reconcile per modify), and flag drift
   (refused, closed by hand) to the Activity log and his DM.
6. **Durable fan-out.** Each master event writes one job row per follower BEFORE anything is sent (`copy_jobs`:
   pending → sent → confirmed/failed); senders drain it; on restart unfinished jobs resume. `clientOrderId` already
   makes a resend safe. Schema via `shared/schema.ts` + `docker-migrate.sql` (prod rule).
7. **Self-healing sweep** every 60 s, staggered (one reconcile per account): a follower order whose master order is
   gone is cancelled; a copy whose master closed is closed; a missing protective stop is restored.
8. **More machines when needed** — the existing shard switch (`COPY_WORKER_INDEX/COUNT`) splits ACCOUNTS (not just
   masters) across workers, each with its own pool; a master's event reaches the worker that owns each follower
   through Postgres `LISTEN/NOTIFY` on `copy_jobs`. Proven with 2 workers locally.
9. **Latency is measured on every copy** — broker's timestamp of the master action vs the broker's timestamp of the
   follower's — stored on the job row; the admin copy page shows median and worst per day.
10. **Prove the capacity without a second app:** a local fake cTrader server (speaks the same protobuf framing,
    enforces 50 req/s per connection and pushes executions) carrying 2,000 fake accounts — measure fan-out time and
    that no connection ever exceeds its limit. Then on the real demo server: our real demo accounts on ONE pooled
    connection, ramping the accounts-per-connection while watching for any refusal; the setting is fixed from
    what is measured. Live switched on only after demo is clean.
11. **Docs + phase 4/5:** `docs/copy-platform.md` scale section rewritten (the "two connections for the whole
    platform" reading corrected — cTrader's page says per USER), `docs/copy-gateway-plan.md` marked superseded by this,
    `docs/OPEN.md` rows, memory note; full copy + engine suites; deploy; security pass (`docs/security/`) on the
    changed surface; read the live log on the first copied trade.

## Measured proof that it is done
- Race tests (step 1) red on today's code, green after.
- Fake-server run: 2,000 accounts, fan-out time and per-connection request rate printed; zero limit breaches.
- Demo: a real master trade copied through the pool; log shows place/move/fill/close each once, and the measured
  master→follower delay (target: under 1 s; today 3-5 s).

## Order of delivery
Step 1 ships on its own first (it removes a money risk on today's path). Steps 2-5 ship together behind `COPY_USE_POOL`
(off until the demo proof). Steps 6-9 follow, each deployed and checked in the log before the next.

## Unknowns, handled without asking anyone
- How many accounts cTrader tolerates on one connection, and how many connections one app may hold: not published.
  The pool starts at 50 per connection, ramps on demo, and keeps the connection count low (20-40 for 2,000), so a
  per-app connection cap — if one exists — is not approached.
- No backtest involved. Nothing touches a live account until the demo proof passes.
