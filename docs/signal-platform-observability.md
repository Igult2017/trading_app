# Signal platform observability — how to find out what actually happened

Added 2026-07-27, in response to a failure that could not be diagnosed at all.

## Why this exists

On 27 Jul 2026 VIX.1 found three valid EUR/USD sell setups. The user received only the third and
worst, and it failed. The investigation established:

| candle | signal created (UTC) | entry | grade | what happened |
|---|---|---|---|---|
| 07:00 | **11:17:15** | 1.13899 | A | **built, validated, saved — never delivered** |
| 11:00 | none | — | A | correctly blocked (news window, then one-at-a-time) |
| 13:00 | 14:46:29 | 1.13689 | B | delivered; failed |

The strategy's trading logic was right — it picked the best candle at the best price, 21 pips better
than what was delivered. Everything that went wrong was downstream of it, and **none of it could be
proven from logs**, because the container restarted at 16:28:54 and took every prior line with it.

Two lessons are baked into the design here:

1. **stdout cannot survive a restart, so it cannot be the audit trail.** An outage erases its own
   evidence, which is precisely when you most want the evidence.
2. **A swallowed exception is worse than a crash.** Two subsystems were dead for hours while
   reporting perfect health, because their errors were caught and discarded.

## The three tables

Declared in `signal_platform/storage/observability_models.py`, mirrored in `shared/schema.ts` (so
`drizzle-kit push` cannot drop them) and created in `docker-migrate.sql` (which is how production
actually syncs schema — **not** `db:push`).

### `signal_events` — one row per stage transition

`built → validated → saved → dispatched → delivered`, or `dropped` with the reason in `detail`.

`signal_id` is **nullable on purpose**: the most valuable events happen before the signal row exists.
A signal the validator refuses never gets an id at all, and those were previously invisible.

**The query that would have answered 27 Jul in two seconds** — signals that were handed to the
notifier and never confirmed sent:

```sql
SELECT d.symbol, d.strategy, d.signal_id, d.created_at, d.detail
  FROM signal_events d
 WHERE d.stage = 'dispatched'
   AND NOT EXISTS (SELECT 1 FROM signal_events x
                    WHERE x.signal_id = d.signal_id AND x.stage = 'delivered')
 ORDER BY d.created_at DESC;
```

The full life of one signal:

```sql
SELECT stage, detail, created_at FROM signal_events
 WHERE signal_id = '<id>' ORDER BY created_at;
```

Everything a strategy produced and why it did not ship:

```sql
SELECT created_at, symbol, stage, detail FROM signal_events
 WHERE strategy = 'vix1' AND created_at > now() - interval '2 days'
 ORDER BY created_at DESC;
```

### `platform_heartbeat` — single row, rewritten every scan

Its **age at boot is the downtime measurement**. Read it before anything overwrites it; `main.py`
calls `observability_repo.detect_downtime()` at startup, ahead of the first `beat()`.

**IT WAS WRITE-ONLY UNTIL 2026-08-20, and that is worth knowing about.** It was written by every scan
and read exactly once — at boot, by `detect_downtime()`. No API exposed it and nothing else consumed
it, so the one number that says whether the platform is scanning **could not be observed at all**
without direct database access, and `detect_downtime()`'s own verdict was never surfaced either. I
then mistook a different timestamp for it and reported the heartbeat dead on that basis. It was not:

> `GET /api/signal-platform/status` → `platformStatus.ts` is the **BOOT** time, written to
> `/app/.signal_platform_status.json` by `main.py` when Python starts. On a container that has been
> up for a while it looks hours old, **which is what a healthy platform looks like.** It is not the
> heartbeat and must never be read as one.

The same endpoint now returns the real thing, so the question is answerable in one request:

```jsonc
"heartbeat":    { "beatAt": …, "ageSec": 24, "scans": 33476, "lastTickMs": 11980, "stale": false },
"lastDowntime": { "downFrom": …, "downTo": …, "seconds": 17109, "note": "heartbeat stale at boot …" }
```

**MEASURED IN PRODUCTION, 2026-08-20 14:15 UTC** — eight consecutive ticks, sampled through this
endpoint:

| | |
|---|---|
| tick duration | **11.5 – 12.5 s**, median **12.0 s**. No outliers across eight ticks |
| interval at the time | **30 s** — London + New York overlap (`scan_interval_seconds`: 30 s on the overlap, 45 s on a single major session, 60 s otherwise) |
| utilisation | ~40% of the *tightest* interval the platform ever uses |
| first tick after a cold boot | 12.0 s — the empty-cache case is not meaningfully slower, because the fetch is concurrent |

So the "174 s against a 5 s median" I asserted was **wrong on both numbers**: the real median is 12 s,
not 5, and nothing resembling 174 s occurred. The scan loop has comfortable headroom. If a genuine
overrun ever happens, the `SLOW TICK` warning fires and names the instruments responsible.

`stale` uses the same 300s threshold Python does. `lastTickMs` is **how long the tick that wrote the
beat took** — added because nothing measured the scan loop's duration, so "ticks sometimes take three
minutes" could be neither confirmed nor refuted, and I asserted a 174-second figure inferred from the
spacing of throttled audit rows, which cannot support that claim. The scanner also logs
`SLOW TICK — 174.0s against a 60s interval; slowest: XAU/USD 171.4s, …` whenever a tick overruns its
own interval, naming the three slowest instruments — the total alone says a tick was slow without
saying why, and the answer is nearly always one instrument's feed.

Two reads of `scans` a minute apart give the true tick rate independently of any of this.

### The outage now ANNOUNCES ITSELF at boot (added 2026-08-20)

Recording it was only half the job. The 15 Aug outage was detected and written correctly at the next
boot — and then sat in the database for five days, because nothing read it.

**The existing S3 health alert cannot cover this case, by construction.** It fires from
`startup_helpers.write_status` on a boot **error** — Python started, ran its checks, found a fault.
A process that is KILLED, a container that dies, a host that goes away: none of them call
`write_status`, so no ⏬ is sent, and no ⏫ either (recovery only fires when a prior ⏬ left the
`/app/.s3_down` marker). **An absence with nothing running is invisible to it.**

`startup_helpers.report_downtime(obs.detect_downtime())` in `main.py` closes that gap — the
heartbeat's age at boot is the only witness such an outage leaves, so this is the only place it can
be announced from. It goes to the private coded chat as `🛰️ S3 ⏫`, with the window and the length in
plain words, and says what it MEANS: *"Anything that set up while it was down was MISSED, not
declined."*

**No dedup is needed and none was added.** `detect_downtime` measures the heartbeat's age at THIS
boot, so a crash-loop restarting every 60s sees a 60-second-old heartbeat, falls under the 300s
threshold and returns None. The alert can only fire on a real absence. Confirmed against a real
deploy: the 2026-08-20 redeploy did **not** create a downtime row, so ordinary deploys stay under the
line and this will not become deploy noise.

### `platform_downtime` — one row per detected outage

Answers the question nothing in the system could answer before: *was the platform even up when that
candle closed?* A missing signal has two completely different explanations — the strategy declined
it, or the process was not running — and they were indistinguishable.

```sql
SELECT down_from, down_to, seconds/60 AS minutes, note
  FROM platform_downtime ORDER BY down_from DESC LIMIT 20;
```

Gaps under `_DOWNTIME_THRESHOLD_S` (300s) are treated as a clean restart and logged, not recorded.

## The silent failures that were fixed alongside

Each of these could lose a signal without producing a single log line.

| where | what it did | now |
|---|---|---|
| `storage/db.py` | `expire_on_commit=True` meant `get_active()` returned expired, detached ORM rows — the first attribute read raised `DetachedInstanceError` | `expire_on_commit=False`; **load-bearing, do not remove** |
| `monitor/signal_monitor.check_all` | `gather(..., return_exceptions=True)` with results **discarded** — 158 polls judged nothing, logged nothing | results inspected, every exception logged with its row; one INFO summary per poll |
| `monitor/_get_window`, `_window_size` | failures at `DEBUG`, invisible in production | `WARNING`, and an explicit line when zero bars come back |
| `orchestrator/scanner` | the same discarded-`gather` bug per instrument | failures counted and logged; tick line reports `n/m instruments scanned` |
| `validation/signal_validator` | `_load_active_from_db` swallowed its error, leaving the duplicate guard permanently empty; rr/confidence/dedup rejections at `DEBUG` | DB consulted on every admission; all rejections at `INFO` |
| `notifications/dispatcher._send_photo` | returned `None` unconditionally, so callers read a total send failure as success | returns `bool`; the text fallback's result is propagated |
| `notifications/dispatcher` | "no target chat" **discarded a saved signal** at `log.debug` | `ERROR`, naming the config that caused it |
| `orchestrator/strategy_runner` | ignored `signal_repo.save` returning `""`, dispatching a card for a row that does not exist | treated as "not saved, do not dispatch" |

**The standing rule that came out of this: no `except` that only logs at `DEBUG`.** If a branch can
lose a signal, it logs at `INFO` when it is a decision and `WARNING`/`ERROR` when it is a fault.

## One-signal-at-a-time is now enforced in the database

`trading_signals (strategy, symbol, type) WHERE status = 'active'` is a **unique partial index**.
The user's rule: *"One ticker cannot send 2 signals at the same time using this strategy."*

It was previously enforced only by an in-memory set, which a restart empties and a seeding failure
blanks — that is how two `vix1 EUR/USD sell` rows went active at once. Three layers now: the
in-memory set, a DB check on every admission, and the index, which no process state can bypass.

`docker-migrate.sql` resolves any pre-existing duplicates before creating the index (keeping the
newest active row per key and expiring the rest). That expiry is deliberately **silent** — a plain
status change emitting no `SIGNAL_CLOSED` — so no "trade closed" card is sent for a signal the user
may never have received.

## Retention

`signal_events` is append-only. `observability_repo.purge_older_than(days=30)` exists for pruning; it
is not scheduled yet, so watch the table size if the platform runs for months.

## Telegram routing — the channel carries entry signals and nothing else

Changed 2026-07-27. User: *"take those TP HIT and other unnecessary messages to DM for now. Only send
BX entry signals to the channel."*

| message | destination |
|---|---|
| confirmed ENTRY signal, strategy in `DM_ONLY_EXEMPT` (today `bx_sd`) | **public channel** |
| confirmed entry, any other strategy (VIX.1) | admin DM |
| `_watch` / setup heads-ups | admin DM |
| outcome cards — TP hit, SL, cancelled (`on_signal_closed`) | admin DM |
| session opens (`on_session_open`) | admin DM |
| boot heartbeat, "Scanner Active" | admin DM |

Controlled by `CHANNEL_ENTRIES_ONLY` (default **true**). While it is on, `DM_ONLY_EXEMPT` acts as a
positive **allowlist** for the channel.

That allowlist is deliberately **not** gated behind `SIGNALS_DM_ONLY`. Making "only BX reaches the
channel" true only while a separate kill-switch happened to be on would mean that turning the
kill-switch off silently republishes every other strategy to subscribers — the guarantee has to hold
on its own. Set `CHANNEL_ENTRIES_ONLY=false` to restore the previous behaviour (outcome cards and
session opens public) without a code change.

## Making the CURRENT state discoverable — the log throttle

Added 2026-07-29, after "I haven't received any signal from BX, is it working?" took a broker query
and a local replay to answer instead of one grep.

**The log buffer is a fixed budget.** A 6,000-line pull came back covering **3h29m**. Two opposite
habits both waste it:

| | lines in that window | problem |
|---|---|---|
| BX-S/D | **0** | logged only on stage CHANGE, so a settled state is invisible |
| VIX.1 | 627, one reason repeated 209× | logged every tick, drowning the buffer |

`core/stage_tracker.py` is the shared mechanism: **emit on change, and re-emit every `HEARTBEAT_S`
(900s) even when unchanged.** A floor for the quiet producer, a ceiling for the noisy one. It knows
nothing about trading — callers own their own wording and keys, which is what lets independent
strategies share it without their rules leaking into each other.

**Measured on the real captured window, not estimated:** VIX.1 627 → 5 lines (99% fewer) with all
5 distinct reasons preserved and none lost. In production the 15-minute restate makes that ~70 lines
over the same window — still ~89% fewer, and every instrument's state always present.

### The keying mistake worth not repeating

Keying the throttle on the **symbol alone** gave only a 33% reduction. VIX.1 emits more than one
reason per scan (the bias line, then the 1M line), so consecutive calls alternate A,B,A,B — every one
looks "changed" and nothing is suppressed. The key must be **(symbol, reason-shape)** so each reason
throttles independently. This was caught by measuring against the real log, not by reasoning about it.

**The shape strips DECIMALS only** (`strategies/vix1_log.shape`). Prices move every tick and would
defeat de-duplication; integers are kept, because `1HR=-1` → `1HR=1` is a trend flip and must print.

### `evaluated` — strategy state that survives a restart

Every line that actually prints is also written to `signal_events` as `stage='evaluated'`. Only
emitted lines, so the volume is the de-duplicated one — never per tick (~7,700 scans/day would swamp
the table and add nothing). This is what answers "what was it doing at 3am on Tuesday" after the log
buffer has rolled and the container has restarted.

### Reading it — `GET /api/admin/signal-events`

`signal_events` had no reader outside the container, which is precisely why "check the events" could
not be answered. Behind `requireAdmin` (`X-Admin-Secret` header) because these rows expose strategy
internals — unlike `/api/trading-signals`, this must not be public.

```bash
curl -s -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://www.fsdzones.cloud/api/admin/signal-events?strategy=bx_sd&limit=50"

# what is each instrument doing right now
curl -s -H "X-Admin-Secret: $ADMIN_SECRET" \
  "https://www.fsdzones.cloud/api/admin/signal-events?stage=evaluated&since=2%20hours"
```

Filters: `strategy`, `symbol`, `stage`, `since` (an interval like `2 hours`, or an ISO timestamp),
`limit` (default 200, max 1000). Defaults to the last day.
