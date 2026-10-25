# The ladder keeps using live FIX prices, and stops crying wolf

## Context

His report, 25 Oct 2026: the candle-close watcher and the ladder *"keeps on going off ... i think
is not FIX data issue but how it was built such that it is not aware of when the price is moving
slowly hence it assumes FIX data has stopped when price stops or starts moving slowly."*

He was right, and the measurement is worse than the hypothesis.

His condition on this work: **the watcher and the ladder must keep using live FIX data** — the fix
must not quietly turn them into pollers — **and the false alarm must be gone.**

## WHAT I MEASURED, from 786 days of the broker's own saved minutes

The M1 bars carry cTrader's tick COUNT per minute, so the pauses can be counted without waiting for
a live session. 782,589 open-market minutes per pair. Allowing for ticks arriving at random (a
Poisson model, which UNDERSTATES it — real ticks arrive in bursts):

| | EUR/USD | GBP/USD |
|---|---|---|
| pauses of 3s or more, per weekday | **1,940** | **1,452** |
| minutes containing at least one | **34.6%** | **25.6%** |
| at 21:00 UTC | **291/hour** — one every 12s | 247/hour |
| even at the busiest hour (14:00) | 5/hour | 3/hour |

The ladder's threshold is **3 seconds, per pair** (`trade_watcher.py:46`, used at `:182`), so it
decides the stream is dead roughly two thousand times a weekday and DMs him on each flip
(`:190`, `:203`).

**Two findings that shape the fix:**

1. **The candle-close watcher is INNOCENT.** Its rule is 90s with no tick on ANY pair
   (`entry_watcher.py:42`). In 786 days there was not one stretch of even two consecutive tickless
   minutes, on any pair. If it fires, something is really wrong. Its threshold is left alone.
2. **No price-based threshold is good enough.** To get under one false alarm a day needs 60-90s —
   and a stop that waits 90s to notice a dead feed is the exact risk the 3s was lowered to avoid on
   6 Sep. The price is the wrong signal, not the wrong number.

## The idea the whole fix rests on

**A price that has not ticked has not CHANGED.** A tick is sent when the bid or ask moves; no tick
means the quote still stands. So while the session is alive, the newest FIX price IS the current
price, however many seconds old — and polling the broker would return the same number.

So the two questions are separated:

| question | answered by | used for |
|---|---|---|
| *Is this the current price?* | the session being alive | moving a stop — **keeps using FIX** |
| *Is the feed broken?* | the SESSION going silent | the alarm and the fallback |

## The change

| file | change |
|---|---|
| `data/fix_book.py` | a second clock: the last time ANY inbound message arrived, not just a price. `session_silent(limit)` reads it |
| `data/fix_quotes.py` | stamp that clock on EVERY inbound message in `_pump` — heartbeats (`35=0`, currently not handled at all) and test requests (`35=1`, answered at `:207` but not recorded) as much as quotes. **Proactive test request:** nothing inbound for 40s → send one and expect a reply; no reply within 10s → the session really is dead |
| `data/fix_quotes.py:215` + `data/fix_wire.py` | **keep the leftover bytes.** `buf = ""` after each read throws away a message split across two network reads, and the parser has no notion of a remainder — so a split test request is never answered and the broker logs us out. A real disconnect caused by our own parsing |
| `monitor/trade_watcher.py` | use the streamed FIX quote whenever the session is alive, however old it is; poll ONLY when the session is silent or no quote has ever arrived. The alarm moves to session death. **One state per session**, replacing the single flag tested per pair — which today flips both ways on one pass when two pairs differ, every 2 seconds |
| `monitor/entry_watcher.py` | same liveness signal; its 90s price rule stays as the second line |

**We negotiate a 30-second heartbeat at logon** (tag 108, `fix_quotes.py:123`), so an idle session
is obliged to keep talking. 40s of total silence is already abnormal; the test request then settles
it beyond doubt rather than guessing.

## ⚠ The one case this must still catch

A session that lives while ONE pair's subscription quietly dies. The discriminator is cheap and
needs no threshold: **if other pairs are ticking and this one is not, that is suspect; if nothing is
ticking at all, the market is simply quiet.** Only the first polls and reports.

## Verification

1. **Replay the real quiet window.** Drive the watcher with the measured 21:00-23:00 UTC tick
   pattern, heartbeats flowing: **zero alarms**, and every stop decision still made from a FIX
   price. The same replay against today's code must produce the hundreds of alarms measured above —
   that contrast IS the test.
2. **A genuinely dead session** — no messages at all, heartbeat included: exactly ONE alarm, the
   fallback engages, and a recovery message on return.
3. **One pair's subscription dies while others tick:** reported and polled for that pair alone.
4. **A split message** across two reads is parsed once and intact, and a split test request is
   still answered.
5. **The flip-flop is gone:** two pairs, one quiet and one busy, over many passes — no alternating
   warning/all-clear.
6. All 17 signal-platform suites plus the VIX.1 tick and watcher tests, then build and deploy.

## Risks

| risk | handling |
|---|---|
| Using a quote that is genuinely out of date | only while the session is proven alive, and a dead subscription is caught by the "others are ticking" check |
| The broker does not send heartbeats when busy | the proactive test request does not depend on the broker volunteering anything |
| A broker that ignores test requests | would show immediately in the drill as a false "dead session"; the threshold stays generous (40s + 10s) |
| GBP/JPY has no saved minute data | the design needs no per-pair threshold, which is exactly why this matters less |
| Making a stop decision late | unchanged: the ladder still acts on every tick as it arrives; only the alarm and the fallback move |
