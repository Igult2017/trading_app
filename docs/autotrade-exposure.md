# How a signal becomes a live order — and where correlated risk is NOT controlled

**His instruction, 2026-09-06:**

> *"I want you to document how signals are currently taken and placed to avoid double risk or triple
> risk exposure of related pairs because we will enable it later. But for now I want all the signals
> to be autoplaced or traded even if they are related because I want to see performance then we
> enable that risk guard later. Document it first so that when we come back to enable it you don't
> confuse."*

**THE DECISION THIS RECORDS: every signal is placed, related or not. That is deliberate, it is his
call, and it is the state today.** The point is to measure how the strategy performs unconstrained
before adding a guard that would hide some of its trades. Do not "helpfully" add an exposure limit
because this document explains the risk — the risk is understood and accepted for now.

**NOTHING WAS CHANGED TO ACHIEVE THIS.** The behaviour he asked for is already what the code does:
there is no correlation or exposure guard anywhere in the placement path. This document exists so
that when the guard IS built, nobody has to re-derive any of the below.

---

## 1. The path a signal takes, end to end

| # | what happens | where |
|---|---|---|
| 1 | The scanner runs every ~60s and calls each strategy for each instrument | `orchestrator/scanner.py` |
| 2 | The strategy returns signals | `strategies/vix1.py` `analyze()` |
| 3 | The validator drops anything under `min_rr=2.0` or the confidence floor, and de-duplicates | `orchestrator/signal_validator` |
| 4 | The chart is attached, the signal is saved, `SIGNAL_CONFIRMED` is emitted | `orchestrator/strategy_runner._attach_chart` |
| 5 | The dispatcher sends the Telegram card | `notifications/dispatcher.py` |
| 6 | **Autotrade sizes the order and asks the guards** | `execution/placer.place_for_signal` |
| 7 | `guards.check()` returns `None` to place, or a string reason to refuse | [`execution/guards.py:75`](../signal_platform/execution/guards.py#L75) |
| 8 | The stop order goes to the broker | `execution/orders.py`, `execution/broker.py` |

**Everything is refused by default.** `guards.check` runs once per signal, at dispatch — not per
scan — and its verdict is final.

## 2. What `guards.check` actually refuses — the complete list

Read in order; the first one that matches refuses the order.
[`execution/guards.py:75-142`](../signal_platform/execution/guards.py#L75)

| # | check | refuses when |
|---|---|---|
| 1 | kill switch | `autotrade_enabled` is false |
| 2 | demo only | the account is not a demo account (checked at runtime, not assumed) |
| 3 | strategy allow-list | the strategy is not in `autotrade_strategies` |
| 4 | symbol allow-list | the symbol is not in `autotrade_symbols` (empty = allow all) |
| 5 | session allow-list | outside `autotrade_sessions` |
| 6 | size sanity | lots ≤ 0, or equity unknown |
| 7 | daily cap | `autotrade_max_per_day` orders already placed in a rolling 24h |
| 8 | one per symbol+direction | the same symbol AND direction was already placed in the last 24h |

**THERE IS NO NINTH CHECK. Nothing looks at correlation, related pairs, total exposure, or how much
of the account is already at risk.** Check 8 is per-symbol; two DIFFERENT symbols never see each
other.

## 3. The live settings, and what they mean for exposure

Only `AUTOTRADE_ENABLED=true` is set in production. Everything else is the code default
([`config/settings.py:143-171`](../signal_platform/config/settings.py#L143)):

| setting | value | why it matters here |
|---|---|---|
| `autotrade_risk_pct` | **2.0** | 2% of the STARTING balance, static — his instruction, 2026-09-03. Not 2% of the live balance, so it does not shrink as losses land |
| `autotrade_max_per_day` | 6 | rolling 24h cap on orders |
| `autotrade_strategies` | `vix1` | VIX.1 only; BX must be opted in deliberately |
| `autotrade_symbols` | *(empty)* | every symbol the strategy fires |
| `autotrade_sessions` | `london,new_york` | |
| `autotrade_max_lots` | 5.0 | binds on a stop under ~4 pips, and says so out loud when it does |
| `autotrade_demo_only` | **true** | a live account is refused at runtime |

**VIX.1 trades EUR/USD, GBP/USD and XAU/USD** ([`vix1.py:114`](../signal_platform/strategies/vix1.py#L114)).
**All three are priced against the dollar.** A single dollar move can put all three the same way.

### The arithmetic he needs to have in mind

Each order risks **2% of the starting balance**, independently. So:

| simultaneous same-direction signals | total at risk | in practice |
|---|---|---|
| 1 | 2% | one bet |
| 2 | 4% | e.g. EUR/USD and GBP/USD both short |
| **3** | **6%** | all three, which is one dollar bet in three costumes |

The rolling cap of 6 orders and the one-per-symbol-per-direction rule mean the arithmetic worst case
in 24h is 6 orders — 3 symbols × 2 directions — for **12% risked**, though that requires reversals.
**The realistic correlated case is 3 orders at once for 6%.**

## 4. The one piece of correlation logic that DOES exist — and it changes nothing

VIX.1 computes a correlation list and prints it on the Telegram card. It does **not** affect whether
the signal is emitted, its confidence, or its size.

* **The window:** `_CORR_WINDOW = 4 * 3600` — a same-direction signal on another USD pair within four
  hours ([`vix1.py:54`](../signal_platform/strategies/vix1.py#L54)).
* **The computation:** [`vix1.py:302-304`](../signal_platform/strategies/vix1.py#L302), and the
  comment above it says it plainly — *"warn, don't block"*. It counts only signals that were actually
  DELIVERED, so a signal the validator dropped cannot put a phantom warning on a real one.
* **Where it surfaces:** three places, all of them TEXT on the card —
  [`vix1_signal.py:96`](../signal_platform/strategies/vix1_signal.py#L96)
  (`⚠️ CORRELATED: … — size down or skip`),
  [`:125`](../signal_platform/strategies/vix1_signal.py#L125) (`PA::CORRELATED USD — SIZE DOWN`),
  and [`:177`](../signal_platform/strategies/vix1_signal.py#L177) (a word in the summary line).

**It is advice to a human reader. Autotrade never reads it.** That is the single most important
sentence in this document: the card can say "SIZE DOWN" while the platform places full size.

---

## 5. When we come back to enable the guard

**Read this section before writing any code, and do not re-derive the above.**

### Where it goes
`guards.check()` — as check 9, after the daily cap. It has the symbol, direction, strategy, equity
and lots already. It would need one thing it does not have: **what is currently open or pending**.

### What it must be given
`guards._placed` is an in-process list of `(when, symbol, direction)`, rehydrated on boot
(`guards.rehydrate()`). That is enough to know what THIS PROCESS placed in 24h, but not what is
actually open at the broker — a position closed an hour ago still sits in that list. A real exposure
guard should read the live positions, and `monitor/position_book.positions()` now provides exactly
that, shared and cached, without a broker request per call.

### The three questions to settle with him FIRST, before any code
1. **What counts as related?** Same quote currency (all three of his instruments share USD)? A
   measured correlation over some window? A hand-written group list? The existing 4-hour warning uses
   "another USD pair, same direction" — that is a starting point, not an agreed rule.
2. **Refuse, or size down?** The card already says *"size down or skip"*. Those are different
   behaviours and he has not chosen between them. Refusing loses the trade; sizing down keeps it at
   reduced risk. **Do not pick one on his behalf.**
3. **What is the cap?** Total percent at risk across correlated positions (e.g. "never more than 4%
   on one dollar direction"), or a count ("never more than 2 correlated positions")? A percent cap
   composes with the 2% per trade; a count does not.

### What must NOT change when it is built
* The kill switch stays first and absolute.
* `guards.check` keeps returning a REASON string, not a bare false — every refusal reaches the log
  and the DM with its reason intact, and `placer.refusal_message` formats it.
* The refusal is per SIGNAL, not per scan. Anything that fires once per scan would spam.

---

## Fix log

**2026-09-06 — written.** No code changed. Verified by reading, not assumed:
`guards.check` has eight checks and none is about correlation or exposure; VIX.1's correlation list
reaches only card text; production runs at 2% static risk per trade with a 6-order daily cap, on
three USD-denominated instruments.
