# Autotrade — OFF from 2026-10-05, BACK ON from 2026-11-14, SWITCHED FROM THE ADMIN PANEL from 2026-11-16

> ⚠ **19 NOV 2026 — ORDERS HE DECIDES ARE EXEMPT, AND THE LIMITS MOVED TO THE ADMIN PAGE.**
> His words: *"make an exemption for orders placed by DM so that they can be placed whether autotrade doesnt allow
> them and no matter the time."* His answers: 1A, 2A, 3B.
>
> - **An order he decides** = his ✅ Confirm press, a `/level` order, or a Tradeable mark. It SKIPS autotrade's
>   strategy list, pair list, sessions and 16:00 UTC cut-off (`guards.scope_refusal`, rules 3/4/4b/4c). It still
>   needs: a demo account, an honest size, room under the daily cap, and no other trade live (rules 2/5/6/7). A
>   Confirm press while trading is OFF still places nothing.
> - **A signal outside those limits** (gold, PIX, after 16:00 UTC, …) that passes every OTHER rule is no longer
>   refused: in Autotrade AND in DM-confirmation mode it comes to his DM as a Confirm card, with the line
>   *"⚠ Outside autotrade hours/pairs — <reason>"* (`placer.place_for_signal`, the `outside` branch). It never joins
>   the best-signal window, so it cannot knock out a trade autotrade would place. Inside the limits nothing changed.
> - **This fixed a live fault:** every `/level` order was refused — always by the strategy list (`manual_level` was
>   never on it), and on gold or outside London/New York by the pair and session rules too.
> - **The limits are now set on the admin Autotrade page**, under the switches: pairs, strategies, sessions, cut-off,
>   risk %, largest order, trades a day — plus signal quality, delivery and the scan / breakeven switches. One list
>   (`signal_platform/config/engine_settings.json`) is checked by the website before saving
>   (`server/lib/engineSettings.ts`) and by the engine when reading (`config/live_settings.py`, 5-second memory, a bad
>   value ignored). No row = the Coolify value, else the code default; "Reset" deletes the row. `MIN_RR`,
>   `MIN_CONFIDENCE`, `SCAN_ENABLED`, `AUTO_BREAKEVEN_ENABLED` and the dead `AUTOTRADE_ENABLED` were removed from
>   Coolify; breakeven's ON was carried over by a seeded row (`docker-migrate.sql`). The real-time watcher switch
>   stays in Coolify — it is read only at start-up. Proofs: `tests/test_dm_exemption.py` (25 checks),
>   `tests/test_live_settings.py` (20), `server/lib/engineSettings.test.ts` (28, on PGlite).

> ⚠ **HOW IT IS TURNED ON AND OFF CHANGED ON 16 NOV 2026.** The `AUTOTRADE_ENABLED` environment
> variable is GONE. The admin **Autotrade** page now has two switches, and only one can be on:
>
> | switch on | what happens to a signal autotrade would take |
> |---|---|
> | **Autotrade** | placed by itself |
> | **DM confirmation** | sent to his Telegram DM with ✅ Confirm / ❌ Reject; placed only on Confirm, after every check runs again. No answer = nothing. A Confirm after the price reached the entry is refused with the reason |
> | neither | nothing placed; every setup still recorded as *"Refused — trading is OFF"* |
>
> Saved as one value, `trade_mode` = off | auto | confirm, in the `platform_settings` table, read by the
> signal engine within 5 seconds (`signal_platform/execution/trade_mode.py`). No redeploy. If it cannot
> be read it counts as OFF. **The sections below that say "set `AUTOTRADE_ENABLED` in Coolify and
> redeploy" are HISTORY** — they record how it was done before 16 Nov. The OFF behaviour they describe
> (record everything, place nothing) is unchanged.


> ⚠ **IT IS ON AGAIN.** His instruction, 2026-11-14: *"enable autotrader and let it only
> take trades that have qualified all the requirements including Market state and stomach
> rule. Remove Gold from autotrading. Also let autotrader only take trades in the busy and
> active hours of London and New York Sessions … from 7 pm Kenyan time."*
>
> What changed with it: **gold cannot be auto-traded** (`autotrade_symbols` is now a real
> list instead of empty, and empty meant *every symbol*); **the day stops at 16:00 UTC**,
> which is 7pm in Kenya all year (`autotrade_cutoff_utc`, guard rule 4c); and the **market
> state now refuses a signal outright**, so a CHOP or RANGE market produces nothing to
> trade in the first place. Everything below still describes what the OFF switch does — it
> is kept because that is how it gets turned off again.

**Disabled 2026-10-05 on his instruction:** *"Disable autotrade and document how you did it. However,
the setups recording in autotrade section still remains so that we can use it for investigations. Just
disable it from taking trades only."*

---

## In one line

**Autotrade places no orders. It still writes down every setup it would have considered**, on the admin
Autotrade screen, as *"Refused — autotrade is OFF"* with the entry, stop and target attached.

---

## What is OFF, and what is still running

| still running | what it does |
|---|---|
| **VIX.1 and BX-S/D** | unchanged. Signals are still found, still scored, still sent to Telegram |
| **The Autotrade screen's recording** | one row per confirmed signal, saying the switch refused it and showing the setup |
| **Stop management** | breakeven and the profit ladder have their OWN switch (`auto_breakeven_enabled`). **An open trade keeps being managed** — see "Why" below |
| **Broker sync and the journal** | unchanged. A trade placed by hand is still recorded and journaled |

| switched off | what it means |
|---|---|
| **Placing orders** | no pending stop order is ever sent to the broker |
| **The credential fetch, the balance read, the broker connection** | none of them happen on a signal any more. Nothing on the signal path can reach the broker at all |

---

## How it was done — two parts, in this order

### 1. The code change, so OFF does not also mean blind

`notifications/dispatcher.py`, in `_autotrade`.

**The problem.** The kill switch was a bare `return`. The row that says *"a signal fired and no order
went out, and here is why"* is written further down the path, by `execution/placer.py`
(`decision_log.refused`). That `return` skipped it. So turning autotrade off would have turned the
Autotrade screen off too — **the period most worth investigating would have been the one with no
record**, and an empty screen reads exactly like a broken pipeline.

**The change.** When the switch is off it now writes that row itself, then returns:

```python
if not _s.autotrade_enabled:
    from execution import decision_log
    await decision_log.refused(
        signal,
        "autotrade is OFF (autotrade_enabled=false) — the setup is recorded for investigation, "
        "no order was sent",
        None,
    )
    return
```

**Three things about it that were deliberate:**

- **It still touches no network.** The credential fetch, the balance call and the broker connection all
  remain *below* that return. The row goes to `signal_events`, the audit trail the platform already
  keeps, on a worker thread. Nothing here can reach a broker.
- **It reuses the existing `autotrade_refused` stage** rather than inventing a new one. A new stage
  would be invisible unless added in two more places — `AUTOTRADE_STAGES` in `server/routes.ts` (or
  the endpoint never returns it) and the `NOT_PLACED` map in
  `client/src/features/admin-autotrade/autotradeRows.ts` (which drops an unmapped stage silently).
  Reusing it needs no API and no UI change, and it is honest: the order *was* refused.
- **No lot size is recorded** — see "What the rows do not tell you" below.

### 2. The switch itself

`AUTOTRADE_ENABLED` in Coolify, `true` → `false`.

⚠ **There are TWO copies of that variable.** Coolify mirrors every variable into a preview scope, so
the production one and the preview one both exist. **Both were set to `false`.** Changing only one
leaves a later redeploy able to pick up the copy still saying `true`.

The code default in `config/settings.py` has always been `False`; the environment variable is what had
it on.

---

## What the rows on the screen tell you

Per confirmed signal: **time, strategy, symbol, side, entry, stop, target**, and the reason. They appear
in the "Orders and decisions" table as **Refused**, and count towards "Not placed".

One row per **signal**, not per scan — the switch is asked once, when a signal is dispatched. An
unconfirmed heads-up (a `_watch` alert, including the candle-count DM) never reaches autotrade at all,
so it creates no rows.

### What the rows do NOT tell you

- **No lot size.** Sizing needs the account balance, and reading it means a broker call — which is
  exactly what being off avoids.
- **Not whether the other guards would also have refused** (outside the London/New York session, a
  duplicate live order, the daily cap). Those need the account and the broker too.

If either becomes worth having, the honest way is a separate "record only" mode that runs the whole
path and refuses at the broker call. It was deliberately **not** built here: it would fetch credentials,
read the balance and open a broker connection on every signal while autotrade is believed off, and it
would create a second execution path that can drift from the live one. `COPY_DRY_RUN=true` has been set
since 26 July and is why copy trading has never placed an order — that went unnoticed for months, and
it is the same shape of trap.

⚠ **`signal_events` is purged after 30 days**, and the screen shows at most 30. A disabled stretch
longer than a month cannot be reviewed in full from this screen.

---

## How to turn it back on

1. Set **both** copies of `AUTOTRADE_ENABLED` back to `true` in Coolify.
2. Redeploy.
3. Confirm on the next signal: the Autotrade screen should show **Placed**, not Refused, and the order
   should exist at the broker.

Nothing in the code needs reverting. The recording change is deliberately useful in both states: with
the switch on it changes nothing at all, because the branch it sits in is never taken.

**What is still true when it comes back on** — these were not touched and still hold:
demo accounts only (checked against the live account, not assumed from config), VIX.1 only, London and
New York sessions only, 2% of the starting balance, a 6-order rolling 24-hour cap, and one live order
per symbol and direction at a time. All of them are in `execution/guards.py`.

---

## Proof it is off

- `tests/vix1/test_autotrade_decision_log.py` — 28 checks. The ones that matter here: with the switch
  off a refusal row **is** written carrying the levels, **and** the account is never loaded and the
  placer is never called. Both directions are asserted together, because they pull against each other.
  Proven able to fail: restoring the bare `return` turns 9 of them red.
- At the broker, immediately before the change: no open positions and no resting orders, so nothing was
  left in flight that could still fill.

**Related:** `docs/OPEN.md` D59 · `execution/guards.py` (every other guard) · `config/settings.py`
(`autotrade_enabled`, with the same note).
