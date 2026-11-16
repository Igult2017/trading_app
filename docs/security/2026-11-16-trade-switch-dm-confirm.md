# Security pass — trading switches and DM Confirm / Reject (16 Nov 2026)

**What was added:** one admin endpoint (`GET` / `PUT /api/admin/trade-mode`) and one new input from
outside: a button press on a Telegram card (`server/services/tradeConfirmPress.ts`). A press can cause a
real order, so it is the part that matters.

## Findings

| # | Severity | What | Status |
|---|---|---|---|
| 1 | — | **Anyone pressing Confirm.** Only the account in `WATCHDOG_CHAT_ID` (his private DM, whose chat number is his Telegram account) is accepted. With it unset, NOBODY can answer. | Built in; tested (`tradeConfirmPress.test.ts`, 10 checks) |
| 2 | — | **Forged button data.** The data must match `tc:[yn]:<uuid>` exactly; anything else is ignored and nothing is written. It is only an id that is looked up — never executed. | Built in; tested |
| 3 | — | **One press becoming two orders** (double press, or two engine passes). The press only moves a `pending` offer; the engine CLAIMS `confirmed → placing` atomically before placing, and a row left `placing` by a crash is never retried. | Built in; tested (`test_dm_confirmation.py`) |
| 4 | — | **A Confirm bypassing the safety checks.** A confirmed signal goes through the normal placer: every guard runs again (demo only, sessions, cut-off, one trade at a time, daily cap, news), plus "entry already reached → refused". | Built in; tested |
| 5 | — | **Switch endpoint without login.** Behind `requireAdmin`; the value is checked against `off/auto/confirm`. | Measured on the live URL after deploy (below) |
| 6 | **Critical ×2 (dependency)** | `request@2.88.2` (redirect SSRF, GHSA-p8p7-x288-28g6) and its `form-data@2.3.3` (unsafe boundary / CRLF). Installed only as an unused companion of the Telegram library — nothing loads it (`@cypress/request-promise/lib/rp.js:11` loads `@cypress/request`). | **FIXED:** `package.json` `overrides.request = npm:@cypress/request@^3.0.10`; 14 packages removed; the bot library still loads. `npm audit`: 0 critical, 0 high |
| 7 | Moderate | `uuid <11.1.1` buffer bounds bug in v3/v5/v6 with a `buf` argument. The Telegram library only calls `v4` (`@cypress/request/lib/auth.js:4`, `lib/multipart.js:3`). | **Deferred — not reachable.** The only offered fix replaces the Telegram library with an unrelated old version |
| 8 | Moderate | `qs` DoS advisories (comma-format arrays, `isBuffer`) under express. | **Deferred** — `npm audit fix` raised express to 4.22.3 but a copy below 6.16.1 remains; this app does not stringify comma-format arrays. Re-check on the next dependency update |

## What was not possible
- **No active OWASP ZAP scan.** There is no staging copy of the app, and an active scan fires real attack
  payloads, so it is not pointed at production. The checks above, the code audit and the tests stand in.
- **Secret scan** of the change (`git diff e9ba97db..HEAD`): nothing found.

## Live check after deploy
- Recorded below once measured.
