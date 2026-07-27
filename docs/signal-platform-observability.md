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
