# Copy trading — the follower gateway: audit and KEPT plan

> **STATUS: NOT STARTED — TO BE FIXED LATER (his decision, 15 Nov 2026).**
> His words: *"First audit the gateway and then plan and keep the plan and record that it will be
> fixed later."* This is the plan. When he says "start the gateway work", start at step 1 below.
> Do not re-audit from scratch; check these findings against the code, then build.

## What the gateway is, and why it exists
- **What it is:** `copy_platform/gateway.py`, built 26 Sep 2026 (commit d7079607) after his
  instruction *"ensure copy trader can be used by many people and the only limit is resources"*.
- **What it replaces:** today, every follower order opens a NEW connection to cTrader, logs in the
  app and the account, sends one order and disconnects (`executors/ctrader.py:228-238`,
  `dispatcher.py:527-532`).
- **What it does instead:** sends every follower order over **2 shared connections** (demo + live),
  logging each follower account in once. This is Spotware's own guidance: *"A single user should not
  need more than two connections."*
- **Why it is not used:** it was deliberately left unconnected (*"the riskiest part"*, commit
  d7079607), and **nothing in production uses it**.
- **Masters are NOT part of this.** They keep one listening connection each: the event-listener
  design he approved on 15 Nov.

## The audit — findings (15 Nov 2026, read line by line)
1. **Its speed limit is fake: real sending is 5 messages/s, not 45.**
   - The gateway's pacing allows 45/s (`gateway.py:101`, `config.py:146`).
   - But the library's `Client` sends at most `numberOfMessagesToSendPerSecond=5` a second unless
     told otherwise (library signature), and the gateway never sets it (`gateway.py:116`).
   - So a fan-out queues inside the library: 200 followers × ~3 messages = ~2 minutes to send.
2. **It leaks connections when a login fails or times out.**
   - `ensure()` makes a NEW `Client` whenever the app is not ready (`gateway.py:112-120`) but never
     stops the old one.
   - A refused or slow app login therefore leaves the old connection running, and every retry adds
     another.
   - This is the same shape as the D63 socket leak that kept the web app rate-limited.
3. **It leaks connections on every disconnect.**
   - `_on_disconnected` sets `_client = None` (`gateway.py:136`), but the library's connection service
     keeps running and reconnects by itself.
   - The next `ensure()` then starts a second one, so two live connections are open for one gateway.
4. **It never hears that an account was logged out.**
   - `_on_message` handles only app-login and account-login replies (`gateway.py:211-233`).
   - Nothing handles a refused account login, "token invalidated" or "account disconnected" (the
     signals the master path already handles via `auth_loss`, `providers/ctrader.py:404-431`).
   - A logged-out follower stays marked "logged in" (`_accounts`), and every order for it is refused
     until the whole connection drops.
   - A refused login just waits the full 30 s (`gateway.py:168`).
5. **The reply matching is not written.**
   - The docstring promises replies matched by `clientOrderId` / `orderId` / (account, type)
     (`gateway.py:30-35`), but no handler is registered by anything: `add_handler` has no callers.
   - The executor's order logic (open / close / modify / place pending / cancel,
     `executors/ctrader.py`) still runs only on its own one-shot connection.
6. **Smaller items:**
   - **One app per connection:** it logs in with the first caller's app (`gateway.py:115`, `:125`)
     and is keyed by environment only (`:246-252`). Fine while there is one app; wrong if a second
     ever appears. The web app keys by host + app.
   - **A clashing request key overwrites the first waiter** (`:191`), which is then left to time out.
   - **The heartbeat task is never cancelled on disconnect** (harmless, because it is guarded).
7. **The tests cover almost nothing.** `tests/test_scale.py:144-176` checks only the pacing maths and
   "two gateways, not more". Nothing tests connecting, logging in, disconnecting, reply matching or
   leaks.

## The kept plan — to wire follower orders through the gateway LATER
Masters are untouched: they keep one listening connection each (the event-listener design he
approved).

**Order of work:**
1. Fix finding 1: pass `numberOfMessagesToSendPerSecond` from `CTRADER_REQS_PER_SEC`.
2. Fix findings 2-3: one connection per gateway, ever.
   - Stop the old service before making a new one.
   - Keep the service on disconnect; let the library reconnect it; re-run the logins on reconnect.
3. Fix finding 4: route error replies and `auth_loss` signals to the waiting account login.
   - Mark the account logged out on token-invalidated / account-disconnected.
   - Refresh the token through the existing `cred_manager.get_creds`, never a second refresher (the
     shared-token rule).
4. Fix finding 5: an executor mode that sends through `gateway.request` with the documented keys:
   - new order → `clientOrderId`;
   - amend / cancel / close → `orderId` / `positionId`;
   - symbols and reconcile → (account, type).
   - Behind a setting, `COPY_USE_GATEWAY`, default OFF, so it can be switched back instantly.
5. **Tests before switching anything on:** connect, login refused, disconnect + reconnect (no second
   connection), token invalidated, 200-follower fan-out timing, and a TEETH test for each leak.
6. **Prove it on demo accounts:** one master trade copied to his demo followers through the gateway,
   checked in the log and the broker.
   - Only then switch it on for live.
   - Then measure how many followers one connection carries (the docs give no limit).
7. **Precondition, not part of this work:** a copy must first be seen placed through today's path,
   after the D68 fix. Scaling a path never proven to work is pointless.

## Related
- `docs/OPEN.md`:
  - **D69**: this deferred work;
  - **D68**: the library's shared send queue, fixed 15 Nov (`copy_platform/ctrader_protocol.py`);
  - **D67**: unhandled reply timeouts, fixed 15 Nov (`copy_platform/ctrader_send.py`);
  - **D63**: the web app's rate-limit storm (the leak pattern findings 2-3 repeat).
- `docs/ctrader-scaling.md`: the platform-wide connection plan.
