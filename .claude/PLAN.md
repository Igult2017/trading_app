# cTrader credentials: stop one account's failure taking everything down

## Context

His instruction: *"If one account logout or failure brings the whole sync platform down then that
is bad user experience."* Today it does, twice over, and I proved both mechanisms rather than
inferring them.

What he saw: the signal platform crash-looped for ~30 minutes (20 restarts), and after reconnecting
one account, two others began demanding a fresh sign-in.

## WHAT I MEASURED

**1. cTrader answers a dead renewal ticket with HTTP 200, not an error status.** Probed against the
live endpoint with a deliberately invalid ticket:

    POST https://connect.spotware.com/apps/token   grant_type=refresh_token
    HTTP_STATUS=200
    {"errorCode":"ACCESS_DENIED","description":"Access denied. Make sure the credentials are valid."}

refreshAccessToken only throws on a non-200 (brokerAdapters/ctrader.ts:206), so it sails past and
returns accessToken: undefined. _refreshCTraderTokenInner writes that straight back
(autoSyncService.ts:92-100); JSON.stringify drops the undefined key, so **the account's login is
erased** and stamped "valid for another hour". Every later read then reports
brokerAdapters/index.ts:56 *"cTrader: not connected. Complete OAuth first."* -- permanently, until a
human signs in. exchangeCodeForTokens (ctrader.ts:189) has the identical hole.

**2. One sign-in issues ONE ticket, and we save a copy of it on every account.**
routes.ts:5035-5053 exchanges the code once and copies that single pair onto every account the
sign-in returned; select-account then writes it to the chosen row only (routes.ts:5159). cTrader's
own docs: a refresh returns a new pair and **the old pair is invalidated immediately**, the ticket
is single-use, access tokens last ~30 days, refresh tokens never expire
([account authentication](https://help.ctrader.com/open-api/account-authentication/)). Our own
docs/ctrader-open-api-apps.md:86-89 already records this, and line 107 already states the principle
we are not following: **"Exactly one token owner per account."**

So the first account to renew invalidates every other row's copy; each of those then renews, gets
the 200 + ACCESS_DENIED, and erases itself. **Fixing one account arms the trap for the next.**

**3. Two engines treat a credential failure as fatal.** signal_platform/main.py:183 calls
sys.exit(1) when the cTrader probe fails, so one account's dead token takes down ALL scanning,
monitoring and Telegram signals. The journal sync sweep, by contrast, is already isolated --
syncOne catches per account (autoSyncService.ts:409) -- and the live feed already re-authorises one
account without disturbing the others (ctraderHub.ts:251-275). Those two stay as they are.

**4. Nothing records why.** autoSyncService.ts:103 is a bare catch that returns null, so the one
error explaining a platform-down condition is discarded.

## Phase 0 -- STOP ERASING LOGINS. Ships first, alone, before anything else

Until this is in, every sign-in he does is one renewal away from erasing another account.

| file | change |
|---|---|
| server/services/brokerAdapters/ctrader.ts | one shared assertTokenResponse(data) used by BOTH exchangeCodeForTokens and refreshAccessToken: reject a body carrying errorCode, and reject any response without access_token, putting cTrader's own description in the thrown error |
| server/services/autoSyncService.ts | never write credentials that lack an access token; log the real error instead of swallowing it; record needs_reconnect plus reason and time on the account |

After this a failed renewal leaves the account exactly as it was -- still needing a sign-in, but
never silently destroyed, and the reason is in the log.

## Phase 1 -- ONE TICKET, ONE OWNER, SHARED BY THE ACCOUNTS IT COVERS

| file | change |
|---|---|
| shared/schema.ts AND docker-migrate.sql | new ctrader_tokens table: id, user_id, app, access_token_enc, refresh_token_enc, expires_at, version, updated_at, last_error, last_error_at; broker_accounts gains ctrader_token_id. **Both files** -- production applies docker-migrate.sql at boot (start.sh:17), not db:push |
| server/routes.ts OAuth callback + select-account | create ONE token row per sign-in and attach **every** account that sign-in returned -- we already hold the full list at routes.ts:5036. Reconnecting one account therefore repairs the whole family |
| server/services/autoSyncService.ts | renew through the token row; **single-flight keyed by the token row, not the account** (today _refreshInFlight is keyed by account.id, so two accounts of one family race and the loser spends a single-use ticket); write with a compare-and-set on version so a concurrent renewal cannot clobber a newer ticket |
| server/routes.ts:2733 ctraderCredsFor | read the token row, falling back to the per-account copy while the migration settles |

**Migration for rows that already exist:** group by (user_id, app, refreshToken) -- an identical
ticket IS the same family, which is exact and needs no guesswork. Erased rows have no ticket to
group on; they attach to a family at the next sign-in, which is the one re-auth he cannot avoid.

**Open question the vendor docs do not answer** (I checked): whether a NEW sign-in invalidates an
older ticket for the same cTrader user. The design is safe either way, because each sign-in's own
account list re-attaches those accounts to the newest ticket.

## Phase 2 -- ONE ACCOUNT CANNOT TAKE A PLATFORM DOWN

| file | change |
|---|---|
| signal_platform/main.py | a credential failure no longer calls sys.exit(1). The platform boots into "waiting for credentials", retries on a backoff (30s to 5min), alerts ONCE, and announces its own recovery. The hard exit stays only for genuinely unrecoverable config (no client id or secret) |
| signal_platform/main.py:173 | choose the hint from the ACTUAL failure. Node answering 409 means "reconnect account 47535363", not "set ADMIN_SECRET" -- the secret was working perfectly today and the alert sent him to the wrong place |
| signal_platform/data/ctrader_session.py:27 | delete _TOKEN_URL -- declared, never used (checked every reference). Dead code that implies the scanner mints tokens, which it must never do |

**Market-data fallback, opt-in and explicitly bounded:** CTRADER_MARKET_DATA_FALLBACK_IDS lets the
scanner read candles through another account of the same user when its pinned one is unavailable,
logging loudly each time it switches. WARNING: it applies to READING CANDLES ONLY and must never
pick the identity for a trading action -- the pin exists precisely to stop identity drift, and
autotrade is off and stays off. If he would rather not have this at all, Phase 2 still fixes the
outage.

## Phase 3 -- HE CAN SEE IT AND FIX IT IN ONE CLICK

- A per-account state of needs_reconnect with the reason and since-when, instead of a generic red
  error that cannot be told apart from a network blip.
- One **Reconnect** restores every account in that family (Phase 1 makes this true).
- No error banner while a renewal is merely in progress.

## Phase 4 -- OBSERVABILITY

- The real cTrader error text wherever it is currently swallowed.
- One boot line: how many cTrader accounts are healthy versus needing reconnect.

## What I will NOT do

- **No token minting outside Node.** The scanner and copy engine stay readers -- verified: neither
  posts to the token endpoint today.
- **Never auto-switch the trading identity.**
- **No change to the journal sync sweep or the live-feed hub** -- both already isolate per account,
  measured above.

## Verification

1. **Unit, the bug itself:** a 200 body carrying errorCode must throw, and nothing may be written.
   Today it writes and erases, so the test fails before the fix and passes after.
2. **Unit, the cascade:** two accounts sharing one ticket renew concurrently produces exactly ONE
   call to cTrader, both accounts end up with the new ticket, neither is erased.
3. **Unit, compare-and-set:** a stale writer cannot overwrite a newer ticket.
4. **Live, read-only:** re-run the probe above and confirm the new code classifies it as a failure.
5. **Live, end to end:** reconnect ONE account, then confirm via /api/internal/ctrader-credentials
   that the siblings answer 200 rather than 409 -- no second sign-in.
6. **Outage drill:** point the scanner at an account with a dead ticket and confirm the process
   STAYS UP, retries, alerts once, and recovers on its own once the ticket is restored, instead of
   20 restarts.
7. npx tsc --noEmit, the existing server test suites, build, deploy, then grep the live log.

## Risks and how each is handled

| risk | handling |
|---|---|
| The schema change does not reach production | it goes in docker-migrate.sql as well as shared/schema.ts; the boot log already reports migration failures |
| Migration groups the wrong accounts together | grouping is on the identical stored ticket, not a guess; rows that cannot be grouped are left alone |
| A half-migrated state | reads fall back to the per-account copy until the token row exists |
| Tokens in a new table | same encryption as today, never logged, never returned by any public endpoint |
| Doing too much at once | Phase 0 ships on its own and stops the damage; the rest follows behind it |
