# Security assessment — Settings page, privacy switches, profile photo (2026-11-15)

Scope: the change set that added the journal's Settings page (leaderboard opt-in, copier listing
switches), the photo framing step, and the new/changed server routes. It also covers whatever the
site-wide checks found while running.

## What was run

| layer | how | result |
|---|---|---|
| Passive scan of the live site | OWASP ZAP 2.16.1, Automation Framework, `C:\Users\FSD\zap-tools\baseline-2026-11-15.yaml`. Spider with form filling and posting OFF, passive rules only, plus direct requests to the public leaderboard routes and `?tab=settings` | 0 high, 2 medium, 1 low, 3 informational |
| **Active / authenticated scan** | **NOT RUN.** There is no staging copy, and active rules fire real attack payloads, which must never point at production | Stated, not skipped silently |
| Library vulnerabilities | `npm audit --omit=dev` | before: 4 critical, 12 high, 13 moderate. After: 2 critical, 0 high, 8 moderate |
| Secrets | scan of the change set for keys, tokens and private keys | none |
| Access control (by hand) | every new or changed route read line by line, then pinned in `server/services/pageAudit.test.ts` | see below |

## Findings and what was done

### Fixed

| severity | finding | exploit scenario | fix |
|---|---|---|---|
| Critical ×2, High ×12 | Known-vulnerable runtime libraries: `proxy-addr`, `shell-quote`, `axios`, `body-parser`, `compression`, `follow-redirects`, `undici`, `sharp`, `nanoid`, `ip-address`, `brace-expansion`, `source-map-js` | Depends on the library. For example, request smuggling or prototype tricks against the Express stack | `npm audit fix` within the same major versions (commit f89238c4) |
| High ×2 | `zod` < 4.6.6: memory exhaustion validating oversized constrained collections. It validates request bodies in 8 routes | A signed-in user posts a huge array to a journal/trade/copier route and the server's memory runs out | zod 4.6.7 + drizzle-zod 0.8.3. All 23 insert schemas probed with the same 22 inputs (full and partial) before and after: **528 cases, 0 differences**. Unused `zod-validation-error` removed |
| Medium (privacy) | The public `/api/leaderboard/session-names` listed the session names of traders an admin had hidden | Anyone, signed in or not, reads a hidden trader's session names | It follows the one public-board rule `ON_PUBLIC_BOARD` |
| Medium (privacy) | Both public boards showed the local part of a trader's email when no name was on file | Anyone harvests the front of users' email addresses from a public page | `publicName()`: a name or "Trader #A1B2", never the email. The public queries no longer read `up.email` (commit 004ef36e) |
| Low → treated as Medium | Production page loaded `https://replit.com/public/js/replit-dev-banner.js`, a leftover from the Replit editor (ZAP: Cross-Domain JavaScript Source File Inclusion) | Any compromise or change of that file on replit.com runs code inside the app with access to the stored sign-in session | Tag removed from `client/index.html`; the built page no longer contains it |
| Low (hardening) | The avatar route accepted any `data:image/*`, including SVG | An SVG document stored as a "photo" | Raster only (PNG/JPEG/WebP) |

### New and changed routes: access check

| route | who | rows it can touch | check |
|---|---|---|---|
| `PATCH /api/me/privacy` | signed in (`requireAuth`) | only `WHERE id = auth.id`. Never the admin's `leaderboard_hidden` | test: own-row only, no request-supplied id, refuses anything but true/false. Live: 401 when not signed in |
| `DELETE /api/me/avatar` | signed in | only `WHERE id = auth.id` | test + live 401 |
| `POST /api/me/avatar` | signed in | own row | raster-only type check, 300,000-character cap kept |
| `GET /api/leaderboard`, `/by-session`, `/session-names` | public | only traders switched on AND not removed | test pins the rule in all three. Sabotage (removing the opt-in condition) makes it fail |
| `GET /api/admin/leaderboard/entries` | admin only (`requireAdmin`, unchanged) | all traders, by design | now also reports `optedIn` |
| `POST /api/broker-accounts/:id/register-as-provider` | unchanged: checks the account belongs to the caller | that account's listing | the Settings page reuses it through `useAccountListing`; no second path |

⚠ The "true/false only" and "own row only" behaviour of `PATCH /api/me/privacy` is proved from the
route's source and by live 401s. **No signed-in live request was made**: there is no test account
whose session could be used here.

## Deferred, with reasons

| severity | finding | why deferred | next step |
|---|---|---|---|
| **Critical ×2** | `request` (SSRF) and `form-data` (weak random boundary), present ONLY through `node-telegram-bot-api` 0.66 | The fix is the library's 2.x rewrite, a few weeks old. The only proof it works is sending real messages to real Telegram subscribers, which is outward-facing, so it is **his decision**. Exposure today is low: the bot only ever calls `api.telegram.org`, never an address a user supplies, and the boundary weakness needs an attacker who can read the server's random numbers | **HE DECIDED, 15 Nov: "Just document it."** Kept as `docs/OPEN.md` C18. (Options were: A, upgrade to 2.4.0; B, replace the library with direct calls to the Telegram Bot API, 6 calls, recommended; C, document.) |
| Medium | No Content-Security-Policy header (11 pages) + a CSP directive without fallback on `/assets` | A wrong policy blocks the app's own scripts, fonts, Supabase or the price feeds on the live site. It needs an inventory of every origin first, then a report-only rollout | Ship `Content-Security-Policy-Report-Only` with the inventoried origins, watch for a week, then enforce |
| Moderate ×8 | remaining `npm audit` moderates (transitive, no same-major fix) | No same-major fix available; none are on a request-handling path touched here | Recheck at the next dependency pass |
| Info | Cache-control on public API answers, "suspicious comments" in the bundle, modern web app | Informational | — |
