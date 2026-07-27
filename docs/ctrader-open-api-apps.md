# cTrader Open API — the two apps, and why new account connects are pointed at the blocked one

**Status: OPEN. Nothing has been changed.** Investigated 2026-07-27. The fix is known, needs no
contact with Spotware, and is two steps (env change + redeploy). Read "The fix" below and decide.

---

## TL;DR

Production has `CTRADER_SYNC_CLIENT_ID` / `CTRADER_SYNC_CLIENT_SECRET` set, so `newConnectApp()`
resolves to **`sync`** — the SECOND Open API app, which Spotware has not approved. The code's own
comment says its credentials fail while unapproved. **Every new broker-account connect is therefore
being issued under a credential that does not work.** The signal platform is unaffected (it is pinned
to `legacy` explicitly). Unset the two sync vars and redeploy; the fallback to the approved app is
already built and requests the correct scope.

---

## How the code chooses an app

`server/services/brokerAdapters/ctrader.ts`

```ts
export function appCreds(app?: string) {
  if (app === 'sync' && process.env.CTRADER_SYNC_CLIENT_ID && process.env.CTRADER_SYNC_CLIENT_SECRET)
    return { clientId: …CTRADER_SYNC_CLIENT_ID, clientSecret: …CTRADER_SYNC_CLIENT_SECRET };
  return { clientId: …CTRADER_CLIENT_ID, clientSecret: …CTRADER_CLIENT_SECRET };
}

/** While the sync app is still pending Spotware approval its credentials fail — deploy the
 *  cutover only once the portal shows the app Active. */
export function newConnectApp(): 'sync' | 'legacy' {
  return process.env.CTRADER_SYNC_CLIENT_ID && process.env.CTRADER_SYNC_CLIENT_SECRET ? 'sync' : 'legacy';
}
```

| app | env vars | which Open API application |
|---|---|---|
| `legacy` | `CTRADER_CLIENT_ID` / `CTRADER_CLIENT_SECRET` | the **first, APPROVED** app |
| `sync` | `CTRADER_SYNC_CLIENT_ID` / `CTRADER_SYNC_CLIENT_SECRET` | the **second** app — **blocked / not approved** |

**Verified in Coolify 2026-07-27:** all four are set → `newConnectApp()` returns `sync`.
(Each sync var appears twice in the env listing — that is Coolify mirroring into the preview scope,
not a duplicate-config bug.)

## Blast radius — who is actually affected

| call site | app used | affected? |
|---|---|---|
| `routes.ts:3736` `getCTraderAuthUrl(nonce)` | no arg → **sync** | **YES** — new broker-account connects |
| `routes.ts:3896` `exchangeCodeForTokens(code, oauthApp)` | **sync** | **YES** — token exchange for those connects |
| `routes.ts:3771` `getCTraderAuthUrl('signal_platform', 'legacy')` | explicit `legacy` | no |
| `routes.ts:3874` `exchangeCodeForTokens(code, 'legacy')` | explicit `legacy` | no — *"signal platform stays on ITS app"* |
| `refreshAccessToken(creds.refreshToken, creds.app)` | each token's **issuing** app | no — existing legacy tokens keep refreshing |

So the **scanner / signal platform is fine**. The breakage is confined to **new** trade-sync / copy
account connections.

## The fix (no Spotware involvement)

1. Unset (or blank) `CTRADER_SYNC_CLIENT_ID` and `CTRADER_SYNC_CLIENT_SECRET` in Coolify.
2. Redeploy — **setting an env var does not deploy by itself**; it applies on the next deploy.

`newConnectApp()` then returns `legacy` and everything runs on the approved app.

**Before flipping, confirm no account was ever authorised under `sync`.** A refresh token is only
valid with its issuing app's credentials, so any sync-issued account would need re-authorising under
`legacy`. Expected to be an empty set (the app was blocked), but check `copy_accounts` /
`broker_accounts` for tokens whose stored `app` is `sync`.

---

## Why a second app is not needed at all (researched 2026-07-27)

The second app was a cutover, not a requirement. The first app can do **both** jobs — data AND
copy-trading — because of how the Open API is designed:

| Fact | Where |
|---|---|
| **Scope is chosen per-authorisation, in the URL — not fixed at app registration.** `…/grantingaccess/?client_id=…&redirect_uri=…&scope={accounts\|trading}&product=web` | [account-authentication](https://help.ctrader.com/open-api/account-authentication/) |
| `accounts` = view-only, trading impossible. `trading` = full incl. trading operations | same |
| One app authenticates once (`clientId`/`secret`), then **each account** authorises separately with its **own** token. No stated limit on accounts per app | same |
| **Our code already requests `scope: 'trading'`** (`ctrader.ts:112`) — scope was never the problem | this repo |
| Unlimited redirect URIs per app; editable after approval | [api-application](https://help.ctrader.com/open-api/api-application/) |
| Rate limits are **per connection**: 50 req/s non-historical, **5 req/s historical** | [getting started](https://help.ctrader.com/open-api/); staff confirmed 2023-06-28, [thread 41177](https://community.ctrader.com/forum/connect-api-support/41177/) |
| 25 concurrent connections per application | forum staff only — **NOT in current docs**, treat as unverified |
| Access token TTL 2,628,000 s ≈ **30 days** | docs / forum |
| Refresh token has no expiry but is **single-use** — refreshing returns a new one | docs |
| **Refreshing immediately invalidates the previous access token** | docs |
| `ProtoOAAccountsTokenInvalidatedEvent` ends the session for **that one account only**; other accounts on the same connection survive. Fires on: account deleted, cTID deleted, **token refreshed**, token revoked | [messages](https://help.ctrader.com/open-api/messages/) |
| `ProtoOAExecutionEvent` = real-time fill notification (how copy detects a master fill) | same |
| Heartbeat every **10 s** per connection or it is dropped; server never acks | [FAQ](https://help.ctrader.com/open-api/faq/) |

**No documented rule limits apps per domain.** Spotware staff describe approval as permissive
(*"provide some arbitrary Company name and site and we will approve"*), and unlimited redirect URIs
per app cut against a domain being the scarce resource. Approval is assessed on the **description** —
so if the copy-trading use case is added, update the app description rather than let it diverge.

## Design implications (derived from the facts above, for when we return)

- **Partition connections by RATE PROFILE, not by feature.** Historical data is capped at 5 req/s —
  the scarcest budget in the system. Keep candle polling on its own connection so order placement
  never queues behind it.
- **Multiplex many followers onto few connections.** Token invalidation is per-*account*, so
  followers can share a connection safely; the reported 25-connection ceiling makes
  one-connection-per-follower a dead end at ~25 followers.
- **Exactly one token owner per account** (Node is already the source of truth). Refresh tokens are
  single-use and refreshing invalidates the prior access token, so two refreshers race and the loser's
  refresh token is already spent — unrecoverable without re-auth. Single-writer removes the race.
- **Treat `ProtoOAAccountsTokenInvalidatedEvent` as routine control plane, not a crash.** It fires on
  legitimate refresh. Handler: drop that account's session, read the current token from the owner,
  re-send `ProtoOAAccountAuthReq`. This is the defect behind the historical
  `CH_ACCESS_TOKEN_INVALID` crash-loop — a normal lifecycle event treated as fatal.
- **Refresh proactively, never reactively on `CH_ACCESS_TOKEN_INVALID`.** By then the refresh token
  may be spent, and refreshing with a stale token returns the same error — a dead end needing manual
  re-authorisation.
- **Least privilege via per-token scopes:** keep the scanner on `scope=accounts`. A read-only token
  *cannot* place an order, so a scanner bug is physically incapable of trading. This is an argument
  FOR one app — two apps would mean two full-access credentials instead of one read-only + one trading.

## Open questions we can answer OURSELVES (no support ticket)

All measurable with the existing credentials on a **demo** account:

1. **Is the rate limit per connection or per application?** Open two connections on the same
   `clientId`; drive A at ~45 req/s, then B at ~45 req/s. Both sustain → per connection. Combined
   ceiling ~50 with `REQUEST_FREQUENCY_EXCEEDED` → per application.
2. **Real concurrent-connection ceiling.** Open connections until one is refused; the refusal point
   is the limit.
3. **Invalidation blast radius.** Authorise two accounts on one connection, refresh account A's
   token, confirm only A gets `ProtoOAAccountsTokenInvalidatedEvent` while B keeps streaming.

> **SAFETY — test 3 must NOT use the production/shared token.** Refreshing invalidates the previous
> access token immediately; that is exactly what crash-loops the live scanner with
> `CH_ACCESS_TOKEN_INVALID`, and it is why `ct_pull.py` carries a never-refresh rail. Use a throwaway
> demo cTID with its own token pair. Tests 1 and 2 are read-only and safe on any demo account.

## Where we left off

- Diagnosis complete and verified against production env. **No code or env changed.**
- Decision pending: unset the sync vars + redeploy (recommended), or wait on the second app's approval.
- Not yet done: the three self-measurable probes above; confirming no account was issued under `sync`.
