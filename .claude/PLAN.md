# PLAN - The copier goes deaf without saying so, and nothing ever notices

## Phase 1 - Architecture (ROOT CAUSE)

THE HISTORY FIRST: the copier has had FOUR separate faults, each genuinely fixed, NONE ever seen
working. 20 Sep sizing/stop (superseded); 21 Sep a resting ORDER discarded at the door - its entry
says "NOT PROVEN LIVE, and that is the only proof that counts"; 25 Oct the 30s safety net stayed
silent about a position that APPEARED; 02 Nov the server moved and the DATABASE WAS WIPED.

TODAY'S FINDING is the one still open, and it defeats all three earlier fixes because it stops the
engine HEARING anything.

The detection side logs in as a strict chain, each step triggered ONLY by the previous success:
  socket -> app auth            providers/ctrader.py:187-195
  app in -> ACCOUNT auth        :245-249
  account in -> _authed=True    :251-256
  symbols -> reconcile + START THE 30s SAFETY NET   :259-270

It reacts to exactly SIX message types (:245 :251 :258 :272 :279 :350). The elif chain ENDS AT LINE
352 WITH NO else, so everything else is dropped with no log line at all. Dropped: 2142 (the broker's
refusal "Trading account is not authorized"), 2147 (session ended), 2164 (account disconnect).

THREE SILENT CONSEQUENCES:
1. A refusal anywhere in that chain STOPS IT DEAD - `_reconcile_scheduled` never set, so THE 30s
   SAFETY NET NEVER STARTS. Nothing retries; nothing knows.
2. `_authed`/`_connected` clear ONLY on TCP disconnect (:197-204), and needs_recycle() (:170-173)
   requires `not self._connected`. A dead SESSION on a live SOCKET is NEVER recycled.
3. The socket never drops - the installed TcpProtocol heartbeats by itself. No rescue.

DOCUMENTED TRIGGER: Node refreshes the SHARED token (routes.ts:2810-2820) and cTrader ends that
account's session elsewhere, pushing 2147 - ctrader-open-api-apps.md:92 "Fires on: ... token
refreshed". SAME ROOT CAUSE AS D64, which I fixed in the scanner an hour ago. I fixed one of two.

NOT THE CAUSE (checked): COPY_ENGINE_ENABLED unset -> start.sh:46 defaults ON. COPY_DRY_RUN unset ->
config.py:108 defaults False. Encryption key set, 44 chars, both Coolify scopes IDENTICAL. The
EXECUTOR re-logs-in on every order (executors/ctrader.py:226-236) so it cannot go stale. The two
deliberate refusals (no stop loss, session filter) write a SKIP row WITH A REASON - visible.

## Phase 2 - Tasks

REUSE THE RECOVERY THAT EXISTS. engine.py:98-115 already recycles a provider every 90s and the
rebuild RE-READS CREDENTIALS (_load_masters -> get_creds :221). That is what is needed after a
rotation, because a live provider's self.creds is STALE - a plain reconnect reuses the dead token for
ever. The provider only has to ADMIT the session is gone.

1. providers/ctrader.py: add an `else` to _on_message so nothing is dropped in silence again.
2. Handle 2147 + 2164 -> mark the session lost, log at WARNING.
3. Handle 2142 -> decode it; when it means "not logged in", mark lost. REUSE the judgement already
   written and tested for D64 (ctrader_auth_state.is_auth_failure) - it reads the DESCRIPTION as
   well as the code and is already FALSE for rate limits. ONE list only; two lists drift silently.
4. Extend needs_recycle(): also true when the session was marked lost, OR the socket is up but the
   login chain never completed past a grace period (the "dead from the first second" case).
5. ⚠ A REFUSAL MUST NEVER BECOME A RECONNECT STORM. The 90s supervisor IS the brake and already
   exists - ride on it, add no faster retry path. Answering refusals with more connections is D63.

## Phase 3 - Execute in that order.

## Phase 4 - Health check
Extend copy_platform/tests/test_provider_resilience.py - it already builds a real provider with NO
socket (make_provider(), :41-57). 2147 marks lost and needs_recycle() returns TRUE while _connected
is still True. Same for a 2142 "not authorized". TEETH: REQUEST_FREQUENCY_EXCEEDED and an ordinary
push leave it ALONE. TEETH: connected + never authed + past grace -> recycle. Healthy -> never.
Plus the existing 15 files / 227 checks still pass.

## ⚠ WHAT I COULD NOT CHECK - matters MORE than the code
Production reads were REFUSED by the permission gate. So I have NOT seen the live engine, its
masters, its followers or its log. Unknown: (1) whether the session is dead right now, (2) WHETHER
ANYTHING IS CONFIGURED TO COPY AT ALL - the 02 Nov migration left the DB empty, and with no master/
follower row the engine runs, finds nothing, logs nothing, and behaves IDENTICALLY after this fix.
A code fix cannot conjure a configuration. One call answers both:
GET /api/admin/copy/diagnostics with X-Admin-Secret.
His options, as plain text: (a) allow the production read - RECOMMENDED; (b) he runs it and pastes;
(c) I build on code evidence alone and accept that nothing may visibly change.

## Reported, NOT acted on
gateway.py is DEAD - 260 lines, imported only by tests/test_scale.py; add_handler (:235) has no
caller. It fixes something real (1,941 symbols / 312 KB per order) and passes its tests. Wire it or
delete it is HIS call; it is not why copying fails.
tests/test_provider_resilience.py:48 sets _awaiting_stop "mirrors the real __init__" - that field was
deleted 2026-09-21. Stale comment.

## NOT in scope
The order-placing side. Wiring/deleting gateway.py. Who refreshes the token. The two deliberate
refusals.
