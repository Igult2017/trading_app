# Moving the app to a new server — without losing any setting

Built 17 Nov 2026 after the move to Hostinger lost every setting. His goal: *"I just set apis and it starts working
immediately."*

## What keeps your settings safe
- **The settings vault** — one encrypted file, `settings.age`, in your **private** GitHub repo `trading-app-vault`.
  The app saves a fresh copy by itself 5 minutes after it starts and every 6 hours (only when something changed).
- **What is inside:** every server setting the app runs with (API keys, bot tokens, the encryption key…) and the
  database tables that are settings: the Autotrade switch, the cTrader login, broker accounts, your admin role, the
  copy-trading setup, Telegram links. **Not** your trades, journal or signals — your choice.
- **Who can open it:** only someone holding your **private key** — the file `C:\Users\FSD\trading-app-vault-key.txt`,
  which must also be in your password manager. The server holds only the public key: it can lock a copy, never open
  one. ⚠ **Lose the private key and nobody can open the vault — not even me.**

## The move, step by step
1. **New server:** install Coolify; create a PostgreSQL database and an application from the same GitHub code repo
   (public repository).
2. **Put the settings back** (from your PC, in the `trading_app` folder):
   ```
   node scripts/vault/restore.mjs --dry-run --app <new app uuid>     # shows what it will write, writes nothing
   node scripts/vault/restore.mjs --app <new app uuid>                # writes every setting, then reads each one back
   ```
   It needs: your private key file, and these four on your PC: `VAULT_GITHUB_REPO`, `VAULT_GITHUB_TOKEN`,
   `COOLIFY_API_BASE` + `COOLIFY_API_TOKEN` of the NEW Coolify.
3. **Change the few settings that belong to the new server** — at minimum `DATABASE_URL` (the new database's address).
   Everything else (API keys, tokens, the encryption key) carries over unchanged.
4. **Deploy** the app once.
5. **Put the settings tables back:**
   ```
   node scripts/vault/restore.mjs --app <new app uuid> --url https://<new address>
   ```
   The Autotrade switch, cTrader login, broker accounts, admin role and copy setup come back. The app reconnects to
   cTrader with the saved login — no logging in again, unless that login expired while the app was off.
6. **Point the domain** (`app.dorixe.com`) at the new server.

## Checking the vault any time
```
node scripts/vault/restore.mjs --check
```
Opens the latest vault with your key and compares it with the live Coolify app — names and match/mismatch only,
never a value.
