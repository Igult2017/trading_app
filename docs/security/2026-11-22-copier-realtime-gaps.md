# Security pass — the copier's real-time gap work (22 Nov 2026)

**Scope:** commits 4d9abe00 … (copier steps 1-5 of `.claude/plans/declarative-roaming-bentley.md`).
**Result: no High or Critical finding. One rule-violation found and fixed in the same work (the one-hop rule).**

| Surface | What it can do | Who can reach it | Finding |
|---|---|---|---|
| `copy_master_book` (new table) | Holds each master's open trades and resting orders (symbol, side, size, prices) | The copy engine only; no web route reads or writes it | Trade data only — **no token, no password, no account credential** (`master_book.to_json` writes the two snapshot types and nothing else). None |
| The catch-up after a gap (`master_book.diff`, `providers/ctrader._catch_up`) | **Sends copy actions to followers** (close, partial close, stop change, open, pending place/move/cancel) | Inside the engine, only on a master's own state | Every action goes through the normal dispatcher, so the follower's risk caps, session filter and duplicate guard still apply; a master never seen before loads silently (nothing copied); a size it cannot read stops the comparison rather than guessing. Accepted as designed |
| The deal-list read (`_fills`) | Reads the master's last 7 days of deals | Inside the engine, on the master's own login | Read-only. None |
| Trade-path label check (`_is_our_own_copy_position`) | Refuses to copy a trade this engine placed | Inside the engine | **FIXED** — before it, a filled MARKET copy landing on an account that is also a master was copied onward (one-hop rule held for orders only); with a ring of accounts that is an unbounded stream of real orders. Reproduced with a real execution event, now tested (`tests/test_no_copy_loops.py`) |
| Two send lines per connection (`ctrader_protocol.low_priority`) | Orders checks behind copies | Inside the engine | Same per-second limit as before. None |
| Targeted checks (`sweep.request_check`) | Reads a follower account and may cancel an orphan copy order, close a copy whose master trade is closed, or add a missing stop | Triggered by the follower's own broker messages, a failed copy, a re-login | Same repair rules as the existing check (it never opens a trade); a burst of requests becomes one check. None |

**Companion checks:** secret scan of every added line in `copy_platform/` and `docker-migrate.sql` since 4d9abe00~1 —
clean. No new web routes and no new dependencies, so no new ZAP surface and no new `npm audit` item; the passive ZAP
baseline of the live site from this morning (`docs/security/2026-11-22-account-sync.md`) stands.

## Addendum 2026-11-23 — putting back a stop/target changed by hand

**Scope:** `sweep.py` / `sweep_decide.py` (new "restore" repair), `follower_watch.py` (notices stop/target changes),
`dispatcher._moved_levels` + `_exec_follower(restore=True)`; Recent activity display (`Sidebar.tsx`, one CSS class).

**Outside surface:** none added — no new web address, form, or input. The website change is display only. ZAP scan
not re-run: nothing it can reach changed (stated, not skipped silently).

**Manual review:**
- *Who it can act on:* only trades carrying the copier's own `cp-` label, on accounts the copier already holds as
  followers; never a trade without the label (`test_sweep.py` check). It never opens a trade or changes a size.
- *What it can send:* the master's CURRENT levels through the follower's own risk rule and 1-3% stop ceiling — a
  restore cannot widen a follower's risk past his limit (`test_restore_levels.py`: 1.099 sent, not the raw 1.095).
- *Abuse / load:* a follower changing a stop again and again gets at most ONE restore per trade per 10 minutes
  (`restore_due`), so neither a person nor a refused amend can make it hammer the broker's per-second limit; checks
  stay on the low-priority line behind copies.
- *Injection:* the new query uses the ORM with bound parameters only (`dispatcher._moved_levels`).
- *Secrets:* diff scanned for tokens/passwords/keys — none.

**Findings:** none High/Critical. Low (accepted, documented in the fix log): a hand change made while the follower
listener was down, on a copy whose stop the copier never moved, is not detected.
