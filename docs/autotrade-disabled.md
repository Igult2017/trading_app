# Autotrade is OFF — what that means, and how to turn it back on

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
