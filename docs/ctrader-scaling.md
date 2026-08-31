# cTrader at scale — one app, 2000 users

**Why this exists.** Spotware **refused to approve the second app**, so account syncing, copy
trading and the signal platform must all share one approved application (`30153_…`) forever. His
requirement, 31 Aug 2026: *"find an engineering approach to use what we have… without affecting
signal platform"* and *"when you plan, plan with scaling in mind."*

**Nothing here is broken today.** Two accounts, roughly three connections. This is a ceiling you
reach as users arrive, and the point of writing it down is that each stage has a **measurement that
proves it before the next one starts**.

---

## The facts, read from the code

| fact | where |
|---|---|
| One **permanent** WebSocket per cTrader account, for every user, forever | [`ctraderRealtime.ts:127`](../server/services/ctraderRealtime.ts#L127) |
| All of them pinned to **one Node process** (`IS_PRIMARY`) | [`ctraderRealtime.ts:39`](../server/services/ctraderRealtime.ts#L39) |
| **cTrader is EXCLUDED from the 15-minute sync timer** — *"only sync on connect or manual trigger, never on timer"* | [`autoSyncService.ts:168`](../server/services/autoSyncService.ts#L168) |
| Non-cTrader accounts sync every 15 min, launched in a loop with **no concurrency limit** | [`autoSyncService.ts:165-171`](../server/services/autoSyncService.ts#L165) |
| First sync backfills **730 days** in 7-day chunks, 250 ms apart, on **one** connection (~105 requests, ~26 s) | [`autoSyncService.ts:17`](../server/services/autoSyncService.ts#L17), [`ctrader.ts:334`](../server/services/brokerAdapters/ctrader.ts#L334) |
| Heartbeat every 10 s per connection or the broker drops it | [`ctraderRealtime.ts:33`](../server/services/ctraderRealtime.ts#L33) |
| **No connection cap anywhere in Node** | verified by search, 31 Aug |
| Signal platform runs in its **own process** on its **own** connection (port 5035) | [`ctrader_session.py:237`](../signal_platform/data/ctrader_session.py#L237) |
| Rate limits are **per connection**: 50 req/s normal, **5 req/s historical** | [ctrader-open-api-apps.md](./ctrader-open-api-apps.md), staff-confirmed |
| A token refresh ends the session for **that account only** — others on the same connection survive | same |

### The correction that shapes everything below

**The live feed is not a luxury.** Because cTrader is excluded from the timer, that permanent
connection is the **only** ongoing trade sync a cTrader user has. An earlier draft of this plan
proposed keeping feeds only for copy providers — that would have **silently stopped trade syncing
for every other user**. Any change that removes a feed must put something in its place.

---

## What breaks, and when

Assume ~1.5 accounts per user.

| users | accounts | permanent connections today | what breaks |
|---|---|---|---|
| 2 (now) | 3 | ~3 | nothing |
| ~15 | ~25 | ~25 | the reported per-app connection ceiling. **The signal platform may be refused a reconnect** — it is on the same app |
| 200 | 300 | ~300 | far past any plausible ceiling; one Node process holding 300 sockets + 30 heartbeats/second |
| 2000 | 3000 | ~3000 | 300 heartbeats/second from one process; 3000 sockets on one instance; ~22 hours of backfill budget if they arrive together |

**The failure that matters is not slowness — it is the signal platform being unable to reconnect
because user accounts consumed the app's connections.**

---

## The rule the design has to satisfy

> **Connection count must not be a function of user count.**

Anything that grows per-user only moves the date you hit the ceiling. Three supporting rules:

1. **The signal platform is never in the queue.** Separate process, own connection, its own budget.
   Every cap below applies to the Node side only. This is the requirement he stated, and it is the
   one thing no stage may weaken.
2. **Liveness is preserved for everyone.** Removing a feed without replacing it breaks sync.
3. **No stage depends on a number we have not measured.** The per-app ceiling (~25) is forum-only.
   At ~10 connections it stops mattering, which is the real reason to aim there.

---

## Stage 0 — a connection registry: cap what Node holds, and make it visible. **DONE 31 Aug**

**Built before the multiplexing, because multiplexing without it is untestable** — nothing knew how
many connections Node held.

`server/services/ctraderConnPool.ts` is now the single owner of *"how many cTrader connections Node
may hold"*. `CTRADER_MAX_CONNECTIONS`, default **8**, deliberately far under the unverified ~25 so
the unknown stops mattering. Every socket Node opens takes a lease: the live feed
(`ctraderRealtime.openFeed`), the trade sync, the balance read and the account list.

**Feeds outrank transient work**, and that ordering is the safety property: cTrader is excluded from
the 15-minute timer, so a feed that cannot open means that user silently records nothing, while a
backfill can wait a few seconds and lose nothing.

**Not applied to the signal platform or the copy engine** — separate processes, own connections. The
cap is Node's, which is exactly what keeps the scanner out of the queue.

**26 checks**, and the ones that matter are the leaks: a release is idempotent, `withConnection`
releases even when the work throws, and a failed feed releases before the token-refresh retry opens
another. A leaked slot strangles the pool one account at a time and surfaces weeks later as "new
feeds stopped connecting", pointing nowhere near the release that never ran.

The boot line now reports **accounts and connections separately** — they are the same number today,
and Stage 1 is the change that makes them differ.

## Stage 1 — put many accounts on one connection. **BUILT 31 Aug, shipped at 1/socket**

`server/services/ctraderHub.ts` holds the sockets; `ctraderRealtime.ts` keeps the lifecycle and owns
none. A socket authenticates the app once, each account authorises separately with its own token, and
a token refresh ends only that account's session.

**Sockets are separated by HOST *and* APP, and both are correctness.** Live and demo are different
endpoints; and a socket is authenticated as ONE cTrader application, so an account whose token was
issued under a different app cannot share it.

### ⚠ It ships at ONE account per socket — identical to the old behaviour

`CTRADER_ACCOUNTS_PER_CONN` defaults to **1**. Routing an event to the right account depends on
`ProtoOAExecutionEvent` carrying `ctidTraderAccountId`. That is **confirmed in the protobuf schema**
but **has never been observed on this JSON gateway**, because the old code never had to read it — one
socket, one account, nothing to disambiguate.

**The failure it guards against is silent and expensive:** route a closed trade to the wrong member
and a real trade is written into the wrong person's journal, with nothing erroring.

So the router does one of three things and never guesses: route by the event's own id; or, when
exactly one account is on the socket, deliver to it (the old behaviour); or **drop it and say so
loudly**. `logRoutingEvidence` reports once whether real events carried the id.

**To turn it on:** watch for `[cTraderHub] execution events DO carry ctidTraderAccountId` after a
live trade closes, then set `CTRADER_ACCOUNTS_PER_CONN=50`. Config change, no code change. If the
warning appears instead, leave it at 1 — the finding is that the gateway omits the field, and the
whole approach needs rethinking rather than forcing.

**Measure once raised:** the boot line reports accounts and sockets separately —
`live feeds active for N cTrader account(s) on M socket(s)`. N should exceed M.

**Risk accepted:** one dropped socket takes all its accounts offline together. `onHubLost`
reconnects every one of them, and the 60-second reconcile is the backstop.

## Stage 2 — a capped worker pool for everything transient

**Change:** one place owns *"how many connections Node may hold"*. Sync, balance reads and
add-account queue against it instead of opening connections freely. Backfill gets a **global**
request budget rather than the current per-call 250 ms pacing, so ten simultaneous signups cannot
each spend 4 requests/second.

**Also fixes a live defect for other platforms:** [`autoSyncService.ts:165`](../server/services/autoSyncService.ts#L165)
launches every non-cTrader account's sync in a loop with no limit — at 200 accounts that is 200
concurrent syncs.

**Measure before Stage 3:** 100 simulated signups produce no more than the cap in concurrent
connections, and the signal platform's reconnect succeeds while the queue is saturated.

## Stage 3 — new users get history without blocking anyone

**Change:** on connect, backfill **30 days** immediately so the journal is useful at once, and queue
the remaining ~700 days as background work at low priority.

**Why:** 730 days is ~105 requests ≈ 26 s of the scarce 5 req/s historical budget. 500 signups in a
day is ~3.6 hours of continuous fetching with nothing scheduling it.

**Measure before Stage 4:** a new account shows trades in under 10 seconds; the full history
completes without the queue exceeding its budget.

## Stage 4 — spread the feeds across Node instances

**Change:** shard accounts across Node workers the way the copy engine already shards masters
([`config.py:122`](../copy_platform/config.py#L122)), instead of pinning every feed to `IS_PRIMARY`.

**Why:** at 2000 users one process holds every socket and sends a heartbeat every 10 s for each —
about 300 heartbeats a second. That is a process limit, not an API limit, and no amount of
multiplexing fixes it.

**Measure:** feeds distribute evenly across instances; killing one instance moves only its share.

---

## Where that lands at 2000 users

| holder | connections |
|---|---|
| Signal platform | **1** — own process, never queues |
| Live feeds, multiplexed and sharded | 2–4 |
| Copy engine (already sharded) | 1–2 |
| Node worker pool (capped) | 4–6 |
| **total** | **~10, flat at any user count** |

---

## What we do NOT know

* **The real per-app connection ceiling.** Forum-only (~25), not in the docs. **Deliberately not
  measured**: finding it means opening connections until one is refused, and if the scanner needs to
  reconnect at that moment it is refused instead. That is the one thing he said not to risk.
* **How many accounts one connection tolerates.** No documented limit. Stage 1 should start
  conservative (~50) and raise it only on evidence.
* Whether Spotware applies anything else at scale that is not published.

The design is built so none of these need answering: at ~10 connections every plausible limit is far
away.

## What must never change

The signal platform keeps its **own process, own connection, own budget**, and is never behind a
Node queue. Every cap here is on the Node side. If a stage cannot hold that property, the stage is
wrong — *"the signal platform is much more important than this."*
