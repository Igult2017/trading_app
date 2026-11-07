# PLAN - answer the copier question from the LIVE log, and correct the record

He said he has no admin secret and offered to set one from Supabase. Two facts first:
 - ADMIN_SECRET ALREADY EXISTS in Coolify (22 chars). It is NOT a Supabase thing, and
   requireAdminSecret (routes.ts:2770-2775) accepts ONLY the x-admin-secret header - no signed-in
   path - so a Supabase login would not open that endpoint.
 - It must NOT be casually rotated: the signal scanner uses it to fetch the cTrader token
   (node_bridge.py:53, :73).

AND I DID NOT NEED IT. The production container log is readable with the Coolify token I have had
all session: GET /api/v1/applications/<uuid>/logs?lines=5000. That is the lesson from the previous
turn applied - check what already works before asking for a permission.

## THE LIVE ANSWER (3,126 lines, boot 13:56 UTC -> 14:24 UTC, i.e. POST-deploy, verified by `date`)

COPIER: THERE ARE ZERO ACTIVE COPY MASTERS IN THE DATABASE. Evidence:
 - engine healthy: "[engine] starting copy engine (worker 0/1)" 13:56:29,
   "[notify] listening on 'copy_change'", "[watchdog] starting copy engine (attempt 1)" - no crash
   loop, and NO "copy engine exited" anywhere.
 - EXACTLY ONE [engine] line in the whole log. None of: "provider started for master",
   "broker account ...", "its account is signed out", "not yet supported", "cannot get creds".
 - A FAILED query would have logged "[engine] initial _load_masters failed" with a stack trace
   (engine.py:86) - it did not. So the query RAN and returned nothing.
 - _load_masters loops over the master list; an EMPTY list logs nothing at all (engine.py:128).
=> The copier has nothing to copy. MY FIX IS A REAL DEFECT FIX BUT IT IS NOT WHAT BLOCKS COPYING
   TODAY. This is exactly the scenario I flagged as unverifiable, now verified.

D64 (scanner), HONEST STATUS:
 - 0 "Trading account is not authorized" in 28 minutes (was 1,556 in 48 minutes).
 - BUT my new path has NOT fired: 0 "AUTHORIZATION LOST", 0 "authorization regained",
   0 "re-authenticating".
 - At 14:13:35 AutoSync ran on 4 accounts, then the scanner re-read Node's token
   ("using live token from Node DB") and logged in again - via the PRE-EXISTING socket-closed
   rebuild, not my new code. So: symptom absent, my code NOT YET EXERCISED. DO NOT claim the fix
   is what cleared it.

## Tasks
1. Update docs/OPEN.md C-COPY3: the open question is ANSWERED - zero active masters. State that the
   code fix is not today's blocker.
2. Update the memory note with the same.
3. Tell him the concrete next step, VERIFIED: the /accounts page (App.tsx:230) holds the copy-listing
   toggle (AccountsPage.tsx:803) and register-as-provider (useProviderStudio.ts:45). The engine
   picks a new master up instantly via the copy_change listener, which the log shows is live, or
   within 60s.
4. Do NOT rotate ADMIN_SECRET. Do NOT ask for the diagnostics permission again - it is not needed.

## NOT in scope
Any further copier code change. Creating the master/follower rows for him - that is his app, his
accounts, and registering a trading provider is his decision, not mine to make.
