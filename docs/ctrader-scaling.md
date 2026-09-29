# cTrader at scale — one app, 2000 users

**Why this exists.** Spotware **refused to approve the second app**, so account syncing, copy
trading and the signal platform must all share one approved application (`30153_…`) forever. His
requirement, 31 Aug 2026: *"find an engineering approach to use what we have… without affecting
signal platform"* and *"when you plan, plan with scaling in mind."*

**Reviewed by an outside reviewer 29 Sep 2026**, and that review is folded in below — what was
already built, what he got wrong about this codebase, and the four gaps he found that are real. His
instruction that day: *"Write that plan based on facts then keep it. When I remind you next time you
will start writing the code."* **So this doc IS the plan. Read it before writing any of that code.**

**Nothing here is broken today.** Four accounts. This is a ceiling you reach as users arrive, and the
point of writing it down is that each step has a **measurement that proves it before the next one
starts**.

---

## The facts, read from the code — re-verified 29 Sep 2026

⚠ **Three rows of this table were stale** and are corrected here. They pointed at line numbers whose
meaning had moved, and one said the **opposite** of what the code now does. What rested on them is
corrected too.

| fact | where |
|---|---|
| Sockets are **no longer one-per-account**. They live in the hub; the feed keeps only the lifecycle | [`ctraderRealtime.ts:19`](../server/services/ctraderRealtime.ts#L19), [`ctraderHub.ts`](../server/services/ctraderHub.ts) |
| **How many accounts may share one socket is a setting** — `CTRADER_ACCOUNTS_PER_CONN`, default **1**, max 200 | [`ctraderHub.ts:46`](../server/services/ctraderHub.ts#L46) |
| How many sockets Node may hold at once — `CTRADER_MAX_CONNECTIONS`, default **8** | [`ctraderConnPool.ts:45`](../server/services/ctraderConnPool.ts#L45) |
| That cap is **really applied**, not just declared: the trade-sync adapter and the hub both take a slot from it | [`brokerAdapters/ctrader.ts:23`](../server/services/brokerAdapters/ctrader.ts#L23), [`ctraderHub.ts:31`](../server/services/ctraderHub.ts#L31) |
| Live and demo are separate endpoints, and a socket is authenticated as ONE app — so sockets are grouped by **host + app** | [`ctraderHub.ts:91`](../server/services/ctraderHub.ts#L91), [`:167`](../server/services/ctraderHub.ts#L167) |
| Each fill is delivered to the account it names (`ctidTraderAccountId`) | [`ctraderHub.ts:60`](../server/services/ctraderHub.ts#L60), [`:141`](../server/services/ctraderHub.ts#L141) |
| ⚠ **CORRECTED — cTrader is INCLUDED in the 15-minute sweep again** (31 Aug), explicitly as *"the SAFETY NET under trade recording"*. The old row said it was excluded, citing a line that now holds an unrelated skip | [`autoSyncService.ts:246`](../server/services/autoSyncService.ts#L246) |
| The sweep launches **every account at once and waits for none of them** | [`autoSyncService.ts:262`](../server/services/autoSyncService.ts#L262) |
| Keep-alive sent every 10 s per socket | [`ctraderHub.ts:38`](../server/services/ctraderHub.ts#L38), [`:114`](../server/services/ctraderHub.ts#L114) |
| A dropped socket brings **every account it carried** back together | [`ctraderRealtime.ts:59`](../server/services/ctraderRealtime.ts#L59) |
| An expired token is refreshed **once**, when our own request fails with error 2142 | [`ctraderRealtime.ts:96`](../server/services/ctraderRealtime.ts#L96) |
| Signal platform runs in its **own process** on its **own** connection | [`ctrader_session.py`](../signal_platform/data/ctrader_session.py), [`execution/connection.py`](../signal_platform/execution/connection.py) |
| Rate limits are **per connection**: 50 req/s normal, **5 req/s historical**. **Nothing in this codebase reads, counts or reacts to a rate limit** — verified by search 29 Sep | [ctrader-open-api-apps.md:85](./ctrader-open-api-apps.md), staff-confirmed |
| The ~25 connections-per-app ceiling is **forum-only, not in the docs** | [ctrader-open-api-apps.md:86](./ctrader-open-api-apps.md) — already labelled unverified there |
| **No stated limit on accounts per app** in the docs | [ctrader-open-api-apps.md:82](./ctrader-open-api-apps.md) |
| **Production runs ONE plain Node process** — not a cluster. A PM2 cluster config exists (`instances: "max"`) but **nothing in the container uses it**; only `replit.md` mentions it | [`start.sh:69`](../start.sh#L69), [`ecosystem.config.cjs`](../ecosystem.config.cjs) |
| **Three processes share the 2 CPUs in one container**: the Python signal platform, the Python copy engine, and Node | [`start.sh:27`](../start.sh#L27), [`:52`](../start.sh#L52), [`:69`](../start.sh#L69) |
| The database allows **20 connections at once and gives up after 3 seconds**. ⚠ The comment beside it claims *"20 per process × PM2 workers = ~160 total"* — **wrong for production**, which has one process, so it is 20 in total, shared with all web traffic | [`db.ts:65-67`](../server/db.ts#L65) |
| The sweep asks each account for **the last 2 hours**; **every 4th sweep (once an hour) asks for the last 7 days**; a brand-new account asks for **730 days** | [`autoSyncService.ts:17-32`](../server/services/autoSyncService.ts#L17), [`:187`](../server/services/autoSyncService.ts#L187) |
| `CTRADER_ACCOUNTS_PER_CONN` is read **once when the process starts**, not per use — so changing it needs a **restart**, which drops every socket | [`ctraderHub.ts:46`](../server/services/ctraderHub.ts#L46) |
| A record of every step a trade took already exists — stages `fetched, recorded, duplicate, journaled, healed, backfilled, skipped, failed`, indexed by account and time | [`schema.ts:981`](../shared/schema.ts#L981) |

### The correction that shapes everything below — itself now corrected

The old version of this doc said *"the live feed is the ONLY ongoing trade sync a cTrader user has,
because cTrader is excluded from the timer."* **That is no longer true.** cTrader was put back into
the 15-minute sweep on 31 Aug, deliberately, because the live feed alone was *"silently lossy"* — a
dropped socket, a deploy or a restart, and any trade closing in the gap was never recorded at all.

**What that changes:** there are now TWO paths that record the same trade, and they can run at the
same moment. That is the safety net the reviewer asked for — and it is exactly why the missing
duplicate-protection in the database (Step 2) matters more than it used to.

---

## The outside review, 29 Sep 2026 — checked line by line

His picture of the target is the same as this doc's: **connections must stop growing with users.** Of
his 13 points, 4 were already built, 1 named the wrong file, 4 are real gaps, and 1 — the one he put
first — is not a constraint to delete but a safety catch waiting on a fact nobody has observed.

| # | his point | verdict |
|---|---|---|
| 1 | Stop 1 account = 1 socket; remove it from `ctraderConnPool.ts` | **Right idea, wrong file.** Sharing is built; the per-socket setting is [`ctraderHub.ts:46`](../server/services/ctraderHub.ts#L46). `ctraderConnPool.ts:45` is a different limit. **Do not flip it yet — see THE GATE** |
| 2 | Live/demo = 2 connections | **already built** — [`:91`](../server/services/ctraderHub.ts#L91), [`:167`](../server/services/ctraderHub.ts#L167) |
| 3 | Route every event by `ctidTraderAccountId` | **already built exactly as he drew it** — [`:60`](../server/services/ctraderHub.ts#L60), [`:141`](../server/services/ctraderHub.ts#L141) |
| 4 | Prove routing on demo accounts, don't wait for a live fill | **the missing piece, and the gate on item 1.** Becomes Step 1 |
| 5 | The 2-CPU box is probably not the bottleneck | Plausible, but production disagreed in one place on 29 Sep: the signal platform's 2-second position tracker was being **skipped** — `"maximum number of running instances reached (1)"`, a 2-second job not finishing inside 2 seconds, **with 4 accounts, not 250** |
| 6 | One cTrader layer feeding journal + signals + copier | **Cannot be done without a rewrite, and it deletes the one property he told us to protect.** Needs HIS ruling — Step 7 |
| 7 | An internal event queue; Redis only if needed | Node has none; the Python side already has one. Agreed: add nothing yet |
| 8 | Make journal writes duplicate-proof in the database | **REAL GAP, confirmed.** Step 2 |
| 9 | Push to the browser instead of polling | **REAL GAP** — no browser-facing socket exists. But his "GET /trades GET /trades" picture is too harsh; see Step 6 |
| 10 | Keep the 15-minute sync, make its job reconciliation | **already its stated job** since 31 Aug — [`autoSyncService.ts:246`](../server/services/autoSyncService.ts#L246) |
| 11 | Don't fire all accounts at once; use a bounded queue | He warns against something the code does a version of. **REAL GAP on the database side.** Step 4 |
| 12 | A solid keep-alive / reconnect layer | **Mostly built** (10 s keep-alive, whole-socket recovery, one token refresh). **One real hole** — Step 3 |
| 13 | Target architecture + Redis | Fine as a destination. Nothing here needs Redis at 250 users |

---

## The REVISED architecture document, 29 Sep — this supersedes the 13 points

He sent a fuller version the same day. **It settles the one thing I flagged for his ruling**: its items
14 and 15 say the journal must **not** share a cTrader layer with the signal platform, in his own
terms — *"the signal platform's independence is more important than eliminating a connection."* **That
closes old Step 7. It is decided, and decided the safe way.**

It also improves three things this plan had, and adds four it did not have:

| his item | verdict against the code |
|---|---|
| **0 / 18** Baseline the production numbers BEFORE any change | **Right, and this plan was missing it.** Becomes Step 0 |
| **4** The **database**, not a preceding "does it exist?" check, must be the final duplicate guard | **Exactly the defect.** That check is [`brokerSyncService.ts:134`](../server/services/brokerSyncService.ts#L134). Sharpens Step 2 |
| **5** Prove routing with **four** demo accounts in mixed order, zero cross-deliveries | **Better than my two-account version.** Replaces Step 1's scope |
| **7** Test per-account recovery and token refresh **separately**, and use an account the signal platform does not need | **He reached the same hazard independently.** Confirms Step 3 |
| **11** Ramp 1 → 2 → 5 → 10 → 20 → 50, verifying at each stage | **Better than my "start at 20".** Replaces Step 5 |
| **6** Track each account's health **separately from its socket's** | **NEW, and it is the right shape.** A healthy socket does not mean a healthy account — that is exactly the silent failure in D53. Folded into Step 3 |
| **8** Record timing per event and alert on unrouted / duplicate / session-expired / reauth-failed / rate-limited | **NEW. Most of the foundation already exists** — [`sync_events`](../shared/schema.ts#L981) already has `duplicate`, `failed` and `skipped` stages, indexed by account and time. **What is missing:** per-event timings, the socket, and the unrouted case, which today is only a console line ([`ctraderHub.ts:152`](../server/services/ctraderHub.ts#L152)) and not a queryable row. Becomes Step 4a |
| **9** Separate limits for reconciliation workers, cTrader requests and database queries | **NEW and necessary — and there is already a hard ceiling he does not know about:** the database allows **20 connections and gives up after 3 seconds** ([`db.ts:65`](../server/db.ts#L65)), shared with all web traffic. Worker count must sit well under 20, not be chosen freely. Sharpens Step 4 |
| **12** Keep the setting reversible, no code deploy to change it | **Already true — it is an environment variable.** ⚠ But it is read **once at process start**, so the emergency fall back to 1 needs a **restart**, which drops every socket and feed. It is reversible, not instant. Say that plainly in the rollout |
| **17** Do not add Redis, Kafka, more Node instances or sharding until measurements demand it | **Agreed, and it DEFERS old Stage 9.** Worth knowing: a PM2 cluster config already exists but **production runs one plain Node process** ([`start.sh:69`](../start.sh#L69)) |

### One tension in his document, and how it resolves

His item 3 keeps the 15-minute sweep. His item 10 says *"250 accounts do not create 250 continuous
polling workloads"* and *"account idle → no journal request required."* **Those contradict each other,
and item 10 is false as written for this codebase.** The sweep asks **every** account every 15
minutes whether it traded or not.

**The arithmetic, from the constants** ([`autoSyncService.ts:17-32`](../server/services/autoSyncService.ts#L17)):
at 250 accounts that is **1,000 requests an hour** for a 2-hour window each, **plus 250 requests an
hour asking for a full 7 days** (every 4th sweep goes deep). Idle accounts cost exactly as much as
busy ones.

**How it resolves:** his direction is still right — events carry the speed, the sweep carries the
correctness — but the sweep's cost must be **measured, not assumed away**. Step 0 measures it, and
Step 6 bounds it. *I have not verified which rate-limit bucket deal-history requests fall into* (the
5-per-second historical one or the 50-per-second one), and that single fact decides whether 1,250
requests an hour is comfortable or tight. It goes in Step 0.

### What I got wrong, and he was right to correct it

I told him roughly *"8 sockets × accounts ≈ 100 users"*. The ~25-connection ceiling that number
rested on is **forum-only**, and [ctrader-open-api-apps.md:86](./ctrader-open-api-apps.md) had
**already labelled it unverified**. I quoted the code's own comment instead of our own research doc,
and passed an unverified figure on as if it were a limit. The honest statement:

> **Today's real ceiling is 1 account per socket and 8 sockets — about 8 accounts with live feeds.**
> Whether that becomes 200 accounts on one socket depends on THE GATE below, not on hosting.

---

## ✅ THE GATE — OPENED 2026-09-30. Fills DO carry the account id

**MEASURED IN PRODUCTION, not inferred.** A 0.01 lot EUR/USD market order was placed and closed on the
Pepperstone demo account (ctid 48833868 — one of the four with a live feed), and production logged:

```
[cTraderHub] execution events DO carry ctidTraderAccountId (4 seen) — CTRADER_ACCOUNTS_PER_CONN can safely be raised above 1
[Sync:routing-ok] — execution events DO carry ctidTraderAccountId (4 seen) — accounts may share a socket
```

**4 execution events, every one carrying the id, none without it.** So the JSON gateway does NOT differ
from the protobuf spec on this field, and **many accounts may share one socket**. Step 5 is unblocked and
the capacity ceiling is no longer one account per socket.

**The whole pipeline worked in the same test**, which was not the question but is worth having:

```
[cTraderRT] recorded live trade 321984806 EURUSD (acct 36bfd2b3-6778-402d-abbe-13b81a63886f)
[Sync:recorded]  EURUSD 321984806 — Long 0.01 lots, P/L -0.25
[Sync:journaled] EURUSD 321984806 — LOSS -0.28 — no R (no original stop)
```

The **live feed** recorded it, not the sweep — so the fast path works end to end. ("no R" is correct: the
probe was a market order with no stop, and R is read from the entry order's stop.)

**Step 4a earned itself here.** The verdict line appears ONCE and the log holds about 50 seconds; without
the `routing-ok` row it would have been gone before it could be read.

**What is still NOT proven:** that a fill for account A, on a socket shared with B, reaches A and not B.
The id is present, and the router keys on it — but end-to-end routing across several accounts on ONE
socket is the four-account test, and it must pass before the ramp goes past 1.

<details>
<summary>The original gate, kept so the reasoning is not lost</summary>

### ⛔ THE GATE — one unobserved fact blocked the first stage

Sharing a socket between accounts only works if each incoming fill says **which account it belongs
to**. cTrader's official message spec says it does. **This app does not talk that wire format** — it
uses the JSON gateway, already known to differ (it spells codes out as words, `"FILLED"` instead of
`2`). Nobody has yet seen a real fill on that gateway and confirmed the account id is in it. That is
why the setting ships at 1, and the hub's own header says so
([`ctraderHub.ts:19-24`](../server/services/ctraderHub.ts#L19)).

**The failure it guards is silent and expensive:** deliver a closed trade to the wrong account and a
real trade is written into the wrong person's journal, with nothing erroring. So the router never
guesses — it routes by the id, or delivers to the only account on the socket, or
[drops the fill and says so loudly](../server/services/ctraderHub.ts#L152).

**The meter already exists.** [`logRoutingEvidence`](../server/services/ctraderHub.ts#L79) prints
either *"execution events DO carry ctidTraderAccountId — can safely be raised"* or a refusal. It only
prints once a fill actually arrives, and **there have been no fills since 09 Sep**, so it has almost
certainly never printed. One deliberate demo trade answers it. That is Step 1.

</details>

---

## Two things that limit sharing, and one hazard in testing it — verified 29 Sep

**1. There are TWO cTrader apps, and accounts cannot share a socket across them.** A socket is
authenticated as one app, so accounts connected under the second app ("Journal Trade Sync") land in
their own socket group no matter what the setting says. New connects are now forced to the **approved**
app unless `CTRADER_SYNC_APP_APPROVED=true`
([`brokerAdapters/ctrader.ts:59`](../server/services/brokerAdapters/ctrader.ts#L59)) — that defect is
fixed — **but the read path still honours `app: "sync"` on accounts already connected under it**, on
purpose. **So the first measurement of Step 5 is a count: how many production accounts sit on each
app.** If any are on `sync`, sharing is capped per group, not overall. I have not counted them yet.

**2. A token refresh rotates the token for everyone.** cTrader issues a new refresh token on every
use, and four consumers share it — the Node sync, the credentials endpoint, the signal scanner and
the copy engine ([`autoSyncService.ts:40`](../server/services/autoSyncService.ts#L40)). Two
overlapping refreshes mean the loser sends an already-rotated token and fails.

**⚠ The hazard this creates in Step 3.** That step's measurement is *"force a token refresh on account
A"* — which is exactly the action that can invalidate the scanner's token. **Step 3 must be measured
on a demo account the signal platform does not use**, and the scanner's own token must be confirmed
still working afterwards. Getting this wrong stops live trading to test a reconnect.

---

## Already done

**Stage 0 — a connection registry. DONE 31 Aug.**
[`ctraderConnPool.ts`](../server/services/ctraderConnPool.ts) is the single owner of *how many
cTrader connections Node may hold* — default **8**, deliberately far under the unverified ~25 so the
unknown stops mattering. Live feeds outrank transient work, because a feed that cannot open means a
user's trades arrive late, while a backfill can wait a few seconds and lose nothing. **26 checks**,
and the ones that matter are the leaks: a slot released twice must not hand back two.

**Stage 1 — many accounts on one socket. BUILT 31 Aug, shipped at 1 per socket.**
A socket authenticates the app once, then each account authorises separately with its own token.
Sockets are separated by host and app, and both are correctness, not tidiness. **Shipped switched
off** — see THE GATE.

---

## The plan — in the order it gets written

**Step numbers are stable.** `docs/OPEN.md` D52, D53, D54 and C9 point at Steps 2, 3, 4 and 6 by
number, so new work is added as Step 0 and Step 4a rather than by renumbering.

**THE AGREED ORDER** (his item 18, mapped onto these steps):

| order | step | gate it clears |
|---|---|---|
| 1 | **Step 0** — baseline production numbers | nothing later can claim an improvement without it |
| 2 | **Step 2** — database refuses duplicates | required before two paths can race |
| 3 | **Step 1** — four-account routing proof on the real gateway | THE GATE |
| 4 | **Step 3** — per-account session recovery + per-account health | the silent failure on a shared socket |
| 5 | **Step 4a** — event timings and alerts | gives the ramp something to read |
| 6 | **Step 4** — bounded reconciliation, three separate limits | stops the sweep swamping 20 db connections |
| 7 | **Step 5** — ramp 1 → 2 → 5 → 10 → 20 → 50 | one notch at a time, verified each time |
| 8 | **Step 6** — browser push | after the server side is reliable, not before |
| 9 | 250-user load test, then rollout, then tune | his items 16 and 18 |
| 10 | only then design 2,000 users | his item 17 — **Stage 9 is DEFERRED until here** |

⚠ **Note the swap against his order.** He puts database uniqueness (his 1) before the routing proof
(his 2); this plan agrees, and that is a change from the earlier version, which led with the proof.
Step 2 is cheap, it is safe on its own, and it protects the very race the event path creates — so it
goes first even though Step 1 is the more interesting question.

### Step 0 — measure what production does now, before changing anything

**What.** Write down today's numbers so every later claim has a before: how long a sweep takes end to
end, how many database connections it uses out of the 20, how long the signal platform's 2-second
position tracker actually takes and how often it is skipped, CPU and memory for each of the three
processes, and how many accounts sit on each of the two cTrader apps.

**Why it comes first.** His item 16 says the 2-CPU box should be **benchmarked, not assumed** to be
the limit — and one production log line on 29 Sep already showed the position tracker being skipped
(*"maximum number of running instances reached (1)"*) with only four accounts. Without a baseline,
every later "this made it worse" is an opinion.

**One unknown to settle here:** whether cTrader counts deal-history requests against the
**5-per-second** historical limit or the 50-per-second one. **I have not verified which.** At 250
accounts the sweep is ~1,250 history requests an hour, so that one fact decides whether Step 6 needs
5 workers or 50.

**MEASURED.** A written baseline in this doc. No code changed.

### Step 1 — prove the routing on demo accounts. **Unblocks Step 5 and the capacity number**

**What.** A script that puts **four** demo accounts on ONE socket, prints every incoming frame's type
and whether it carries `ctidTraderAccountId`, then generates fills **in mixed order** (A, C, B, D, C,
A, D, B — his item 5) and shows which account each fill was delivered to.

**Four, not two, and mixed order** — his refinement, and it is right: two accounts in sequence can
pass by luck, because a wrong answer and a right answer can look the same when there is only one
other place the fill could have gone.

**Why a script and not a unit test.** [`ctraderHub.test.ts`](../server/services/ctraderHub.test.ts)
already proves the routing logic is correct against **invented** frames — 16 checks, including that
an unlabelled fill on a shared socket is dropped rather than guessed. What no test can prove is what
the **real gateway actually sends**. This is the trap that rule exists for: a harness must reproduce
what can actually break the code, not what is easy to model.

**Two more things the same script must answer** (added 29 Sep, both gateway facts nobody has checked):
1. **Does this gateway implement `ProtoOAReconcileReq`, and what does it name its fields?** The whole
   open-position detector rests on it — see the event-first section.
2. **Does a fill carry `positionStatus` reliably?** Both paths now depend on the position's own status
   to know a trade is finished, so the detector and the duplicate rule both inherit that assumption.

**⚠ A MUCH SIMPLER ROUTE, FOUND 30 Sep — no script and no local tokens are needed for the MAIN
question.** The counters that answer it (`sawRouted` / `sawUnrouted`,
[`ctraderHub.ts:185`](../server/services/ctraderHub.ts#L185)) increment on **every fill, whatever
`CTRADER_ACCOUNTS_PER_CONN` is set to** — they only test whether the id is PRESENT on the frame, not
whether anything is being shared. Production already runs 4 cTrader feeds. **So one ordinary fill on
production settles THE GATE**, with no sharing switched on and nothing to set up.

The four-account script is still what proves *routing* end to end (that A’s fill reaches A and not B)
before the ramp — but the yes/no that unblocks everything does not need it.

**And that answer is now durable** — see Step 4a. It used to be a console line printed once, in a log
that holds about 50 seconds.

**Files.** One new script, for the end-to-end routing proof only. **No production code changes.**

**MEASURED.** For each of the four: a fill arrives, it names its own `ctidTraderAccountId`, and it is
delivered to that account and no other. **Zero cross-account deliveries** — Account A's trade must
never appear under Account B. Run it more than once.

**Two outcomes, both useful.** The id is there → Step 5 becomes a one-setting change. The id is
missing → **the socket-sharing approach is dead as built**, and that is the finding; it gets written
here, not forced.

### Step 2 — make the database refuse duplicates. **BUILT AND VERIFIED 29 Sep**

**Done:** the uniqueness rule is in `shared/schema.ts` and in `docker-migrate.sql` (which collapses any
existing duplicates first, **keeping the journaled row**); `createSyncedTrade` reports whether it
inserted; a lost race counts as a duplicate and does not reach the journal; `startAutoSync` logs at boot
whether the rule is present.

**Verified, not just reviewed:** the migration block was **extracted from the real file** and run
against real PostgreSQL via **PGlite** (Postgres compiled to WebAssembly — no server, no virtual
machine, which this laptop cannot provide). 8 checks passed, including the two that matter most: the
**journaled** row survives a collapse, and the **same trade id on a different account is left alone**.
Plus 38 source-level wiring checks, proven to have teeth. Full account in `docs/OPEN.md` D52.

**⚠ PGlite is installed with `--no-save`, so this test is not repeatable from a clean checkout.** Making
it permanent means adding one dev dependency — his call, and worth asking, because it is the only thing
that can verify a migration that DELETES rows.

**What.** A uniqueness rule in PostgreSQL on `synced_trades (broker_account_id, external_id)`, and
correct the comment that claims one already exists.

**Why.** Two paths now record the same trade — the live feed and the 15-minute safety net — and they
can run at the same time. Today the only thing stopping a double entry is a **look-then-write in
application code** ([`brokerSyncService.ts:134`](../server/services/brokerSyncService.ts#L134)): ask
whether the trade exists, then insert if it did not. Between those two moments the other path can
insert the same trade. [`schema.ts:756`](../shared/schema.ts#L756) **says** *"externalId +
brokerAccountId is a unique pair"* — **the database does not enforce that.** Verified 29 Sep: no
uniqueness rule on that table in either [`shared/schema.ts`](../shared/schema.ts) or
[`docker-migrate.sql`](../docker-migrate.sql).

**Why it has not bitten yet.** The two paths have rarely overlapped, and there have been no fills
since 09 Sep. It gets worse, not better, as trades speed up.

**Files.** `shared/schema.ts`; `docker-migrate.sql` (production's only schema path — **not**
`db:push`); and the insert in `brokerSyncService.ts` changed to "insert, ignore if already there" so
the race cannot raise an error either.

**✅ VERIFIED 29 Sep — the two paths DO agree on what identifies a trade, so a uniqueness rule will
actually collapse them.** This had to be checked before relying on it: a uniqueness rule only works if
both writers name the same trade the same way, and if they disagreed the rule would let both rows in
under different names and look like it was working.

| path | names a trade by | where |
|---|---|---|
| the 15-minute sweep | the **last closing deal's** id | [`ctrader.ts:426`](../server/services/brokerAdapters/ctrader.ts#L426) |
| the live event feed | the **same** closing deal's id | [`ctrader.ts:515`](../server/services/brokerAdapters/ctrader.ts#L515), [`:555`](../server/services/brokerAdapters/ctrader.ts#L555) |

**And partial take-profits are handled on BOTH sides** — his report of 27 Sep (*"if i took profit at
different points, it is recording each profit taken as an individual trade"*) was fixed in both: the
sweep averages every piece into one trade and only records once the whole position is finished
([`:405`](../server/services/brokerAdapters/ctrader.ts#L405)), and the live path now asks the
position's own status instead of "is this deal on the opposite side"
([`:469`](../server/services/brokerAdapters/ctrader.ts#L469)). So one finished position produces one
id on both paths.

**MEASURED.** Fire the same trade down both paths at once and get exactly one row. Then re-run the
sweep over real history and confirm the recorded count does not change.

### Step 3 — react when cTrader ends ONE account's session. **DETECTION BUILT 29 Sep — not deployed, not proven live**

**Built:** payload types 2147 and 2164, read from Spotware's own protobuf (four other values in the
same fetch match the existing constants exactly, which is what makes them trustworthy). The hub now
handles both BEFORE the guard that was dropping them, and re-attaches **that account alone**.
25 checks in `ctraderHub.test.ts`. **NOT built:** the per-account health state machine (item 6).
**NOT proven:** the live test needs a real token refresh on one account while another streams, and the
local `.env` has no account token. Full account in `docs/OPEN.md` D53.

**What.** Listen for the frame that says *this account's session has ended*, and re-authorise that
account on its socket.

**Why this is a blocker, not a nicety.** Our own research doc records
([ctrader-open-api-apps.md:90](./ctrader-open-api-apps.md), sourced to cTrader's message reference)
that this event *"ends the session for that one account only; other accounts on the same connection
survive"* — and that it fires on **token refresh**, which happens routinely by design. Today, with
one account per socket, a dead session surfaces as our own request failing and the
[one-shot refresh](../server/services/ctraderRealtime.ts#L96) recovers it. **With several accounts on
one socket the socket stays healthy and one account silently stops streaming** — nothing notices,
because [the hub discards every frame that is not a fill](../server/services/ctraderHub.ts#L139) and
no payload type for this event is even defined
([`brokerAdapters/ctrader.ts:71-88`](../server/services/brokerAdapters/ctrader.ts#L71)).

**Also in this step — track each account's health separately from its socket's** (his item 6). A
socket being up does not mean every account on it is streaming. Each account needs its own state:
*connecting → authorised → streaming*, and the failure states *session expired, refreshing,
re-authorising, auth failed, token invalid*. Without that, the exact failure above is invisible.

**Files.** `brokerAdapters/ctrader.ts` (the payload type), `ctraderHub.ts` (notice it, name the
account, hold its state), `ctraderRealtime.ts` (refresh that account's token and re-authorise it
alone).

**MEASURED — as TWO separate tests, never combined** (his item 7, and he is right: run together, a
pass cannot tell you which mechanism worked):
1. **Session recovery.** Two demo accounts on one socket; end A's session; **B keeps streaming
   throughout** and A is re-authorised and resumes, with the socket never torn down.
2. **Token refresh.** Separately, and **on a demo account the signal platform does not use** — see
   the hazard above. Confirm the scanner's own token still works afterwards.

### Step 4 — put a limit on the 15-minute sweep. **BUILT AND VERIFIED 29 Sep — not deployed**

**Built:** a fixed number of workers share one queue (`SYNC_SWEEP_WORKERS`, default **4**), and the
sweep is **awaited**, so the timer can no longer start a second sweep on top of one still running.
4 because the database allows only 20 connections and gives up after 3 seconds, shared with all web
traffic. **Verified by running it** — `sweepConcurrency.test.ts`, 9 checks: 250 accounts with 4
workers never exceeds 4 in flight and all 250 still run, and the teeth check proves the test can tell
bounded from unbounded. `docs/OPEN.md` D54.

**What.** A small number of workers drain a queue of accounts, instead of every account being
launched at once.

**Why.** [`autoSyncService.ts:262`](../server/services/autoSyncService.ts#L262) starts every
account's sync and waits for none of them. The cTrader side is protected — each has to take a slot
from the pool of 8 — but **nothing bounds the database side**, and non-cTrader platforms take no slot
at all. At 250 accounts that is 250 syncs querying at once on a 2-CPU box.

**THREE separate limits, not one** (his item 9): how many accounts are being reconciled at once, how
many cTrader requests are in flight, and how many database queries are in flight. ⚠ **The database
limit is not ours to choose freely** — the pool allows **20 connections and gives up after 3 seconds**
([`db.ts:65`](../server/db.ts#L65)), and all web traffic shares those 20. So the worker count sits
well under 20, and the comment there claiming ~160 is wrong for production.

**Files.** `autoSyncService.ts` only.

**MEASURED.** 250 fake accounts produce no more than the worker count in flight at once; **no
"pool exhausted" or 3-second timeout errors appear**; the sweep still finishes inside its 15-minute
window; the signal platform's own timings do not move while it runs.

### Step 4a — make every event measurable (his item 8). **PART BUILT 30 Sep — not deployed**

**Built, and it turned out to be a prerequisite rather than a nicety:** the routing verdict is now
written to `sync_events` as `routing-ok` / `routing-missing-id`, readable for good at
`GET /api/admin/sync-events`. It was a console line printed **once**, in a log that holds about **50
seconds** of history because the Python signal platform writes continuously — so the answer to THE GATE
would have appeared and vanished unread. `logRoutingEvidence` now returns its verdict and
`ctraderRealtime.persistRoutingEvidence` stores it, keeping the hub transport-only.

**Still to do in this step:** per-event timings (arrival → committed), the socket id, and the remaining
alerts (duplicate, session expired, reauth failed, rate limited).

**What.** Record, per real-time event: when it arrived, which account it named, which socket carried
it, and when the database committed it. Then alert on the five things that mean something is wrong:
**unrouted, duplicate, session expired, re-auth failed, rate limited.**

**Most of the foundation already exists.** [`sync_events`](../shared/schema.ts#L981) already records a
row per step with stages `fetched, recorded, duplicate, journaled, healed, backfilled, skipped,
failed`, indexed by account and by time, and it is already readable at
`GET /api/admin/sync-events`. **What is missing:** the timings, the socket, and **the unrouted case —
which today is only a line in the console** ([`ctraderHub.ts:152`](../server/services/ctraderHub.ts#L152))
and not a row anyone can query. That is the single most important one, because it is the symptom of
THE GATE being wrong.

**Why it comes before the ramp, not after.** Step 5 raises accounts per socket one notch at a time and
checks after each. Without this, "checks after each" has nothing to read.

**MEASURED.** A fill produces one row with all four timings; a deliberately unlabelled fill produces
an `unrouted` row, not just a console line.

### Step 5 — raise accounts-per-socket, on evidence only

**What.** `CTRADER_ACCOUNTS_PER_CONN` **one notch at a time: 1 → 2 → 5 → 10 → 20 → 50**, checking
after each. **Requires Steps 1, 3 and 4a green.**

**His item 11, and it replaces what this plan said before.** The old version said "start at 20". That
was wrong for the same reason two demo accounts was wrong in Step 1: there is **no documented limit**
on accounts per connection, so the real number has to be found, not assumed — and one dropped socket
takes every account on it down together.

**⚠ Going back is not instant.** The setting is read **once when the process starts**
([`ctraderHub.ts:46`](../server/services/ctraderHub.ts#L46)), so falling back to 1 needs a **restart**,
which drops every socket and every live feed. It is reversible without a code deploy — his item 12 —
but it is not a live switch, and the rollout plan has to say so.

**MEASURED, at every notch.** The boot line reports accounts and sockets separately, so accounts must
exceed sockets. Then, before the next notch: **zero unrouted events, zero cross-account trades, zero
unexpected duplicate rows**, account recovery still works, socket recovery still works, the 15-minute
safety net finds nothing unexplained, event latency has not grown, and — **every time, his item 14** —
the signal platform's connection, scanner and position-tracker timings are unchanged.

**Stop and investigate, do not push on**, if any of those appear. That is what Step 4a is for.

### Step 6 — tell the browser instead of letting it ask. **APPROVED 29 Sep, and it comes AFTER the server side is reliable**

**What.** One push channel to the browser, so a recorded trade appears without the page asking.

**What is actually true today** (the reviewer's picture was too harsh): there is **no browser-facing
socket anywhere in `server/`** — verified 29 Sep. But polling is **off by default**
([`queryClient.ts:130`](../client/src/lib/queryClient.ts#L130)) and only 12 places opt in, between 10
seconds and 5 minutes. **The journal's own trade list does not poll.** The heaviest are the copier
overview (20 s) and signals (10 s).

**So the win is smaller than he implies**, and it is not urgent at 4 users. It becomes real at 250.

**MEASURED.** A recorded trade reaches the open page with no request from the page; the polling
intervals it replaces are removed, not left running beside it.

### Step 7 — one cTrader layer for all three consumers. **CLOSED 29 Sep — decided AGAINST, and not by me**

**⛔ DO NOT BUILD THIS.** His revised document of 29 Sep rules it out in its own items 14 and 15:
*"Do NOT merge the journal's cTrader connection layer with the Python signal platform for the
250-user target… the signal platform's independence is more important than eliminating a
connection."* So this is settled, and settled the safe way. What follows is kept only so nobody
re-proposes it.

**What the earlier review proposed.** The journal, the signal engine and the copier all consume one
shared cTrader connection layer instead of connecting independently.

**Why that was refused.** It deletes the one property he told us to protect. The signal platform is a
separate Python process with its own connection, and
[`ctraderConnPool.ts`](../server/services/ctraderConnPool.ts) says why in as many words: *"the
scanner can never be stuck behind a user's history backfill, because it is not in this queue."* A
shared layer puts the scanner in that queue and makes Node something the scanner depends on in order
to trade. His words: *"the signal platform is much more important than this."*

**What I would take from it instead.** The reviewer is right that the two processes fetch overlapping
data. The safe version is one-directional: the signal platform keeps its own connection, and the
journal stops re-fetching what the signal platform already has. Smaller, and reversible.

### Later stages — unchanged, still correct

**Stage 8 — new users get history without blocking anyone.** Backfill 30 days at once so the journal
is useful immediately, and queue the remaining ~700 days as low-priority work. 730 days is ~105
requests ≈ 26 s of the scarce 5-per-second historical budget; 500 signups in a day is ~3.6 hours of
continuous fetching with nothing scheduling it.

**Stage 9 — spread the feeds across Node instances. DEFERRED 29 Sep — do not start it.** His item 17
is explicit: do not add Redis, Kafka, more Node instances or sharding *"merely because the eventual
target is 2,000 users"*. Prove 0–250 on what exists, measure, and only then design the next phase.
Worth knowing when that day comes: a PM2 cluster config already exists
([`ecosystem.config.cjs`](../ecosystem.config.cjs), `instances: "max"`) but **production runs one
plain Node process** ([`start.sh:69`](../start.sh#L69)) — only `replit.md` references the cluster path.
The reasoning below stays on file for that phase.

At 2000 users one process holds every socket
and sends a keep-alive every 10 s for each — about 300 a second. That is a process limit, not an API
limit, and no amount of socket sharing fixes it. Shard the way the copy engine already shards
([`config.py:122`](../copy_platform/config.py#L122)).

---

## EVENT-FIRST SYNC — his direction, 29 Sep. The design is settled; the go-ahead is not

**His question:** *"why don't we fix the gaps in event listening and then use it… can we make it not
fail and also have plan B of requesting what it failed it sent?"* He is right, and researching it
produced a better answer than the daily sweep either of us had proposed.

### The hard limit, and it is cTrader's, not ours

Their message reference documents **no sequence numbers, no acknowledgements and no delivery
guarantees**, and fills are **not a subscription that can be replayed** — only market data has
subscriptions. **There is no documented way to ask "did I miss anything?"** So event delivery cannot be
made *provably* lossless. That is the ceiling, and it is a property of their API.
([messages reference](https://help.ctrader.com/open-api/messages/))

### But there is a cheap detector we are not using

`ProtoOAReconcileReq` returns **the account's currently open positions and pending orders.** The docs
put only three requests in the scarce bucket — *"Historical Data (ProtoOAGetTrendbarsReq,
ProtoOAGetTickDataReq, ProtoOADealListReq): 5 requests/second. All other requests: 50
requests/second."* ([FAQ](https://spotware-open-api.readthedocs.io/en/latest/faq/)) **Reconcile is not
one of them**, so it has ten times the budget of the deal-history fetch every sweep uses today.

**Nothing on the Node side asks for positions at all** — verified 29 Sep, no Reconcile request exists
in [`brokerAdapters/ctrader.ts`](../server/services/brokerAdapters/ctrader.ts).

### The four layers

| layer | job | state |
|---|---|---|
| **Live events** | the fast path — a fill is recorded on arrival | **already built** ([`ctraderRealtime.ts:108`](../server/services/ctraderRealtime.ts#L108)) |
| **Catch-up** on boot, on reconnect, and on a detected dead session | recovers anything missed during an outage | **not built** — D55 + Step 3 |
| **Open-position check** — **every 5 minutes, HIS RULING 29 Sep** | *detects* a missed close within minutes, then fetches history for **that one position only** | **not built** — new |
| **Daily sweep — KEPT, HIS RULING 29 Sep** | covers the one case the detector cannot see | exists; drops from 15 min to daily |

**Both of those are his decisions, not defaults**, asked and answered 29 Sep: the check runs every
**5 minutes**, and the **daily sweep stays** rather than being removed once the detector works.

**How the detector works.** Remember which positions the broker says are open. When one **disappears
from that list and there is no recorded trade for it**, a close was missed. The recorded trade already
stores `position_id` ([`schema.ts:788`](../shared/schema.ts#L788)), so that match is a direct lookup.

**What it costs.** 250 accounts checked every 5 minutes ≈ **0.8 requests a second against a
50-per-second budget** — about 1.7% of it. Against today: **1,000 two-hour history fetches an hour,
plus 250 seven-day ones**, all against the 5-per-second budget.

| | the daily-sweep version | with the detector |
|---|---|---|
| time to notice a missed trade | up to 36 hours | a few minutes |
| the expensive request | every account, every day | only when a gap is found |

### The one case that still cannot be caught

**A position opened AND closed between two checks, with both events missed.** The broker's open list
never held it, so its disappearance cannot be noticed — only a history fetch finds it. **That single
case is the reason the daily sweep stays.** Not "events are unreliable" — that one hole. With a
5-minute check it needs a trade that opens and closes inside 5 minutes and loses both its events;
rare, but his timeframes make it less rare than it sounds.

### ⚠ The assumption that must be measured before any of this is built

**I have not verified that this JSON gateway implements Reconcile, or what it names its fields.** That
caveat is not routine here: this gateway has already been proven to differ from the spec twice — it
spells codes as words (`"FILLED"` not `2`), and `closePositionDetail` was **absent on 0 of 30 real
deals** though the spec carries it ([`ctraderRealtime.ts:110`](../server/services/ctraderRealtime.ts#L110)).
So *"the spec says Reconcile returns positions"* is **not** *"this gateway returns positions."* It goes
in the same script as Step 1.

### The order is the risk, not the design

Cutting the frequent sweep is the **last** move, because it is what currently hides the gaps:

1. Step 2 — the database refuses duplicates
2. Step 3 — a dead account session becomes detectable *(without this, the catch-up's third trigger does not exist)*
3. Catch-up on boot and reconnect *(D55)*
4. The open-position detector, once the gateway probe passes
5. Step 4 — bounded queue *(250 accounts reconnecting after a deploy is 250 catch-ups at once)*
6. **Only then** the sweep drops to daily

**And the sweep's interval and look-back move together.** Today it is 2 hours against 15 minutes — 8×
headroom ([`autoSyncService.ts:19`](../server/services/autoSyncService.ts#L19)). Write it as a **ratio,
never two numbers**: the look-back is always at least 1.5× the interval. A daily sweep still looking
back 2 hours creates exactly the hole it is meant to close, and changing one without the other is the
most likely way this gets broken later.

**One marker, not two.** `lastSyncAt` is written by **both** the sweep
([`autoSyncService.ts:222`](../server/services/autoSyncService.ts#L222)) and the live feed
([`brokerSyncService.ts:481`](../server/services/brokerSyncService.ts#L481) →
[`storage.ts:1035`](../server/storage.ts#L1035)), so it means *"when we last recorded or checked"* —
**not** *"the point up to which we are complete."* Two trades close a minute apart, the feed catches
the second and missed the first, and the marker now sits after a trade never recorded. **The overlap is
what absorbs that** — which is why it is load-bearing, and why a second marker that can disagree with
this one must not be added.

---

## Where that lands at 2000 users

| holder | connections |
|---|---|
| Signal platform | **1** — own process, never queues |
| Live feeds, shared and sharded | 2–4 |
| Copy engine (already sharded) | 1–2 |
| Node worker pool (capped) | 4–6 |
| **total** | **~10, flat at any user count** |

---

## What we do NOT know

* **The real connections-per-app ceiling.** Forum-only (~25), not in the docs, and **deliberately not
  measured**: finding it means opening connections until one is refused, and if the scanner needs to
  reconnect at that moment it is refused instead. That is the one thing he said not to risk.
* **Whether a fill on the JSON gateway carries the account id.** THE GATE. Step 1 answers it.
* **How many accounts one connection tolerates.** No documented limit. Start at 20, on evidence.
* **Whether we are anywhere near the rate limits.** Nothing in this codebase reads, counts or reacts
  to a rate-limit response — verified 29 Sep. So we would not know if we were.
* ~~Which rate-limit bucket a deal-history request falls into~~ — **ANSWERED 29 Sep from the docs.**
  `ProtoOADealListReq` **is** one of the three scarce 5-per-second requests; everything else is
  50-per-second. See the event-first section below, which is built on this.
* **What the real ceiling is for this box.** Three processes share 2 CPUs in one container. His item
  16 is right that it should be benchmarked rather than assumed — and one production line on 29 Sep
  already showed the position tracker skipping a run with only four accounts.

The design is built so none of these need answering: at ~10 connections every plausible limit is far
away.

## What must never change

The signal platform keeps its **own process, own connection, own budget**, and is never behind a Node
queue. Every cap here is on the Node side. If a step cannot hold that property, the step is wrong.
