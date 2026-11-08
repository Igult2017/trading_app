# PLAN - autotrade refuses a candle admitted only by the 24-hour memory

HIS RULE: "Autotrader should only take trades from candles that qualify momentum candle size or
misses it by the margine of error but not the previous momentum candles before the momentum candle
size changes." Then, scoping it: "This only affects trades taken by autotrade. Everything else
including DM remains the same." And ask 2 (all VIX signals to DM) is DROPPED: "Just do 1 and forget
about 2."

## What the size test does today (vix1_momentum.py)
Three routes pass qualifies_for_trade (:299 -> size_yardstick :273):
  1. body >= 2.5x its own 100-bar median body               -> HIS RULE, keep
  2. >= 2.3x (2.5 - 0.2 margin, _size_mult :201)            -> HIS RULE, keep
  3. clears the LOWEST requirement remembered from a candle that qualified ON ITS OWN in the
     previous 24 CLOCK hours (_remembered :240, _MEMORY_HOURS :57)  -> THIS ONE MUST NOT TRADE
Route 3 is literally "the previous momentum candles before the momentum candle size changes": in his
10-11 Sep GBP/USD move the requirement climbed 9.2 -> 11.6 pips, and route 3 lets a candle too small
for the NEW bar pass by clearing the OLD one.

## Design
size_yardstick ALREADY answers it: it returns the candle own index when big on its own, and an
EARLIER index when the memory admitted it. So the fact needs no new derivation.
NO DB COLUMN NEEDED - the placer receives the LIVE Signal object, so an in-memory flag carries it.
And the dispatcher sends the card BEFORE calling autotrade (guards.py: "IT REFUSES THE ORDER, NOT
THE SIGNAL"), so a refusal here can never suppress the DM - which is exactly his scoping.

## Tasks
1. core/types.Signal: a flag for "this candle was admitted by the 24-hour memory, not on its own".
2. vix1 sets it where the momentum candle is known (vix1_bias already computes size_note there).
3. execution/placer (or guards): refuse to place when the flag is set, with a readable reason that
   lands on the Autotrade screen via decision_log.
4. ⚠ qualifies_for_trade, is_momentum_candle, the pre-close heads-up, spacing and the DM
   announcement are ALL UNCHANGED. Only the placement refuses.

## Health check
A route-1 candle places; a route-2 (margin) candle places; a route-3 (memory) candle is REFUSED with
a reason naming the memory. TEETH: the DM/signal path is untouched; qualifies_for_trade still
returns True for a memory candle; removing the gate fails the checks.

## NOT in scope
Ask 2 (widening the DM). Changing the memory for anything other than placement.
