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

### What I got wrong, and he was right to correct it

I told him roughly *"8 sockets × accounts ≈ 100 users"*. The ~25-connection ceiling that number
rested on is **forum-only**, and [ctrader-open-api-apps.md:86](./ctrader-open-api-apps.md) had
**already labelled it unverified**. I quoted the code's own comment instead of our own research doc,
and passed an unverified figure on as if it were a limit. The honest statement:

> **Today's real ceiling is 1 account per socket and 8 sockets — about 8 accounts with live feeds.**
> Whether that becomes 200 accounts on one socket depends on THE GATE below, not on hosting.

---

## ⛔ THE GATE — one unobserved fact blocks the first stage

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

### Step 1 — prove the routing on demo accounts. **Unblocks Step 5 and the capacity number**

**What.** A script that puts two or more demo accounts on ONE socket, prints every incoming frame's
type and whether it carries `ctidTraderAccountId`, then places a small order on each demo account in
turn and shows which account each fill was delivered to.

**Why a script and not a unit test.** [`ctraderHub.test.ts`](../server/services/ctraderHub.test.ts)
already proves the routing logic is correct against **invented** frames — 16 checks, including that
an unlabelled fill on a shared socket is dropped rather than guessed. What no test can prove is what
the **real gateway actually sends**. This is the trap that rule exists for: a harness must reproduce
what can actually break the code, not what is easy to model.

**Files.** One new script. **No production code changes.**

**MEASURED.** For each demo account: a fill arrives, it names its own `ctidTraderAccountId`, and it
is delivered to that account and no other. Account A's trade must never appear under Account B. Run
it more than once.

**Two outcomes, both useful.** The id is there → Step 5 becomes a one-setting change. The id is
missing → **the socket-sharing approach is dead as built**, and that is the finding; it gets written
here, not forced.

### Step 2 — make the database refuse duplicates. **Do this first if Step 1 is delayed**

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

**MEASURED.** Fire the same trade down both paths at once and get exactly one row. Then re-run the
sweep over real history and confirm the recorded count does not change.

### Step 3 — react when cTrader ends ONE account's session. **Blocker for Step 5**

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

**Files.** `brokerAdapters/ctrader.ts` (the payload type), `ctraderHub.ts` (notice it, name the
account), `ctraderRealtime.ts` (refresh that account's token and re-authorise it alone).

**MEASURED.** Two demo accounts on one socket; force a token refresh on A; B keeps streaming
throughout and A resumes without the socket being torn down.

### Step 4 — put a limit on the 15-minute sweep

**What.** A small number of workers drain a queue of accounts, instead of every account being
launched at once.

**Why.** [`autoSyncService.ts:262`](../server/services/autoSyncService.ts#L262) starts every
account's sync and waits for none of them. The cTrader side is protected — each has to take a slot
from the pool of 8 — but **nothing bounds the database side**, and non-cTrader platforms take no slot
at all. At 250 accounts that is 250 syncs querying at once on a 2-CPU box.

**Files.** `autoSyncService.ts` only.

**MEASURED.** 250 fake accounts produce no more than the worker count in flight at once; the sweep
still finishes inside its 15-minute window; the signal platform's own timings do not move while it
runs.

### Step 5 — raise accounts-per-socket, on evidence only

**What.** `CTRADER_ACCOUNTS_PER_CONN` from 1 upward. **Requires Steps 1 and 3 green.**

Start at **20**, not 200 — there is no documented limit on accounts per connection, so the number is
ours to establish, and one dropped socket takes all its accounts down together.

**MEASURED.** The boot line reports accounts and sockets separately — accounts must exceed sockets.
Then: every account on a shared socket receives its own fills for a full session, and the 15-minute
safety net reports nothing missed.

### Step 6 — tell the browser instead of letting it ask. **Needs his go-ahead on scope**

**What.** One push channel to the browser, so a recorded trade appears without the page asking.

**What is actually true today** (the reviewer's picture was too harsh): there is **no browser-facing
socket anywhere in `server/`** — verified 29 Sep. But polling is **off by default**
([`queryClient.ts:130`](../client/src/lib/queryClient.ts#L130)) and only 12 places opt in, between 10
seconds and 5 minutes. **The journal's own trade list does not poll.** The heaviest are the copier
overview (20 s) and signals (10 s).

**So the win is smaller than he implies**, and it is not urgent at 4 users. It becomes real at 250.

**MEASURED.** A recorded trade reaches the open page with no request from the page; the polling
intervals it replaces are removed, not left running beside it.

### Step 7 — one cTrader layer for all three consumers. **HIS RULING NEEDED — I do not recommend it**

**What he proposes.** The journal, the signal engine and the copier all consume one shared cTrader
connection layer instead of connecting independently.

**Why I would not.** It deletes the one property he told us to protect. The signal platform is a
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

**Stage 9 — spread the feeds across Node instances.** At 2000 users one process holds every socket
and sends a keep-alive every 10 s for each — about 300 a second. That is a process limit, not an API
limit, and no amount of socket sharing fixes it. Shard the way the copy engine already shards
([`config.py:122`](../copy_platform/config.py#L122)).

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

The design is built so none of these need answering: at ~10 connections every plausible limit is far
away.

## What must never change

The signal platform keeps its **own process, own connection, own budget**, and is never behind a Node
queue. Every cap here is on the Node side. If a step cannot hold that property, the step is wrong.
