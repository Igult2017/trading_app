# PLAN - see the bot's resting order in Pepperstone, and respect a stop he moved (his A + B)

## Phase 1 - Architecture

HE CORRECTED ME THREE TIMES AND WAS RIGHT EVERY TIME:
 1. "it is a pending order, different tab" - WRONG, he sees his own resting orders fine.
 2. the account / the kill switch - not the question.
 3. "The cancel takes effect once the price has gone outside the SL band on the opposite side not
    the direction we predicted. So i dont know why you are saying we delay it" - RIGHT.

THE CANCEL IS CORRECTLY TARGETED. signal_monitor.py:224-228 fires only when, for a buy, the LOW went
DOWN through the stop before price ever rose to trigger the entry - "through the stop at ... before
the entry ever filled". Exactly the opposite-side case he described. Option (c) "delay the cancel"
should never have been offered. WITHDRAWN.

SO THE REAL REASON THE ORDERS VANISHED: THEY WERE BORN DEAD. If the cancel only removes a genuinely
dead setup, an order that disappeared at once was already invalid when sent. That is OPEN.md B30:
7 of 11 orders were sent AFTER price had already gone through their own stop. THE FAULT WAS THE
PLACEMENT, NOT THE CANCEL.

AND IT IS ALREADY FIXED: vix1_entry.py:313 calls stop_already_hit and returns NO ORDER for such a
setup - live in the entry path, not merely tested. Plus the stop is now much wider (0.30 -> 0.552 of
the momentum body, + the spread on a sell, both shipped today), so being traded through before the
entry triggers is far less likely; test_entry_stop_already_hit's own docstring records that none of
those eight September cases is killed by the check any more once the stop widened.
=> an order should now REST normally and be visible. What is left is exactly A and B.

⚠ I COULD NOT RE-MEASURE THE SEPTEMBER FIGURES. The broker returned ZERO orders for 8-21 Sep on the
account this session reads, while the same account does return the 23 Sep ones. B30/B29 are a record
I wrote at the time, not a fresh measurement. Say so plainly.

THE GAP THAT STILL DEFEATS ADJUSTING A STOP BY HAND: signal_monitor.py:167 reads
`sl = float(row.stop_loss)` - OUR stored stop, never the broker's live order. Widen it by hand and
the platform keeps judging against the ORIGINAL level, calls the setup dead, and withdraws the order
he just edited.

PLUMBING THAT ALREADY EXISTS (no new broker request):
 - ProtoOAReconcileRes.order carries EVERY pending order WITH its stopLoss, in a reply that already
   arrives every 30s. ctrader_positions keeps only the IDS and discards the stop (:53-54); prices
   divide by a fixed 100,000 (:18).
 - canceller is already async, off the trading path, already calls the broker.
 - ProtoOANewOrderReq has label, comment AND clientOrderId; orders.build_stop (:85-100) sets NONE.
 - ⚠ The copy engine matches its mirrors on an exact `cp-<master order id>` label
   (copy_platform/executors/ctrader.py:183-192) so a different prefix cannot collide. A label also
   travels from the order onto the position.

## Phase 2 - Tasks

A. RESPECT A STOP HE MOVED
 1. data/ctrader_positions: keep each resting order's stopLoss beside its id, same reply.
 2. execution/canceller: before withdrawing, compare the broker's LIVE stop with the stored one. If
    he moved it, DO NOT CANCEL - adopt his stop, say so in the log + DM.
 3. Persist his stop so the next 30s pass judges against HIS level.
 ⚠ RESTING ORDERS ONLY, never a filled one (canceller rule 2 already enforces it).
 ⚠ IF THE BROKER READ FAILS, CANCEL AS TODAY. A dead order left resting is the gold-72-points
   complaint. Fail TOWARD today's behaviour.
 ⚠ Flag: the stored stop is the PLANNED risk. Auto-journal takes R from the ENTRY ORDER at the
   broker, which would carry his stop, so they agree - but the recorded plan becomes his.

B. MARK THE ORDER
 4. orders.build_stop sets a short label (strategy + signal stub) and a comment (lots, risk %, stop
    basis). Both read back on the order history - my probe labels came back today.
 ⚠ Never `cp-` prefixed.

## Phase 4 - Health check
A: stop moved wider -> no cancel + stored stop updated. TEETH: an UNMOVED stop cancels exactly as
today; a FILLED order is never touched; a FAILED broker read still cancels.
B: label + comment set, short, never `cp-` (TEETH).
Green: test_order_volume, test_stop_from_his_trades, test_pip_value, test_execution_placement,
test_autotrade_dm, test_entry_stop_already_hit, canceller/monitor suites.

## Verification
⚠ NOT PROVABLE until autotrade is on and a real order rests: the order appears in Pepperstone with
its label, he widens the stop, the platform leaves it alone and says so. Do NOT call it done on
green checks - that is the mistake this project paid for four times on the copier.

## NOT in scope
Delaying or weakening the cancel - it is correctly targeted and he was right to challenge me.
Turning autotrade on. Re-measuring the September lifetimes (the broker no longer returns them).
