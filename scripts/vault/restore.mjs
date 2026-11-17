// restore.mjs — open HIS settings vault and put every setting back. Run on his PC. See docs/MOVING.md.
//
//   node scripts/vault/restore.mjs --check                 open the vault, compare with the live Coolify app (no writes)
//   node scripts/vault/restore.mjs --dry-run --app <uuid>  show what a restore into <uuid> would write
//   node scripts/vault/restore.mjs --app <uuid> --url https://app.dorixe.com    RESTORE (asks to confirm)
//
// Needs: his private key (--key, default C:\Users\FSD\trading-app-vault-key.txt); VAULT_GITHUB_REPO + VAULT_GITHUB_TOKEN
// (or --file <settings.age>); for --check/restore COOLIFY_API_BASE + COOLIFY_API_TOKEN. NO VALUE IS EVER PRINTED —
// only names, counts and match/mismatch.
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { createInterface } from "readline/promises";
import { Decrypter } from "age-encryption";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const has = n => process.argv.includes(n);
const h = v => createHash("sha256").update(String(v)).digest("hex");
const keyPath = arg("--key", "C:\\Users\\FSD\\trading-app-vault-key.txt");
const base = (process.env.COOLIFY_API_BASE || "").replace(/\/$/, ""), ctok = process.env.COOLIFY_API_TOKEN;

async function loadVault() {
  let bytes;
  if (arg("--file")) bytes = readFileSync(arg("--file"));
  else {
    const repo = process.env.VAULT_GITHUB_REPO, token = process.env.VAULT_GITHUB_TOKEN;
    if (!repo || !token) throw new Error("set VAULT_GITHUB_REPO and VAULT_GITHUB_TOKEN, or pass --file");
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/settings.age`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw", "User-Agent": "settings-vault" } });
    if (!r.ok) throw new Error(`GitHub: HTTP ${r.status}`);
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  const identity = readFileSync(keyPath, "utf8").split(/\r?\n/).find(l => l.startsWith("AGE-SECRET-KEY-"));
  if (!identity) throw new Error(`no private key found in ${keyPath}`);
  const d = new Decrypter();
  d.addIdentity(identity);
  return JSON.parse(await d.decrypt(new Uint8Array(bytes), "text"));
}

async function coolifyEnv(app) {
  const r = await fetch(`${base}/api/v1/applications/${app}/envs`, { headers: { Authorization: `Bearer ${ctok}` } });
  if (!r.ok) throw new Error(`Coolify: HTTP ${r.status}`);
  return Object.fromEntries((await r.json()).filter(e => !e.is_preview).map(e => [e.key, e.value]));
}

function compare(vaultEnv, live) {
  const names = Object.keys(live);
  const missing = names.filter(k => !(k in vaultEnv));
  const differ = names.filter(k => k in vaultEnv && h(vaultEnv[k]) !== h(live[k]));
  console.log(`Coolify has ${names.length} settings: ${names.length - missing.length - differ.length} identical in the vault, ` +
              `${missing.length} missing, ${differ.length} different.`);
  if (missing.length) console.log(`  missing from the vault: ${missing.join(", ")}`);
  if (differ.length) console.log(`  different from the vault: ${differ.join(", ")}`);
  return { missing, differ };
}

const v = await loadVault();
console.log(`Vault saved ${v.saved_at}: ${Object.keys(v.env).length} settings; tables: ` +
            Object.entries(v.tables).map(([t, rows]) => `${t} ${rows.length}`).join(", "));
const app = arg("--app", process.env.COOLIFY_APP_UUID_TARGET);
if (has("--check")) { compare(v.env, await coolifyEnv(arg("--app", "dm96yia8e3dmg5lhjc2bu2de"))); process.exit(0); }
if (!app) { console.log("No --app given: nothing written."); process.exit(0); }
if (has("--dry-run")) {
  console.log(`DRY RUN — would write ${Object.keys(v.env).length} settings into Coolify app ${app} and send ` +
              `${Object.values(v.tables).reduce((n, r) => n + r.length, 0)} table rows to ${arg("--url", "(no --url)")}.`);
  process.exit(0);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
if ((await rl.question(`Write ${Object.keys(v.env).length} settings into Coolify app ${app}? (yes/no) `)).trim() !== "yes") process.exit(0);
rl.close();
const data = Object.entries(v.env).map(([key, value]) => ({ key, value, is_preview: false, is_literal: false }));
const w = await fetch(`${base}/api/v1/applications/${app}/envs/bulk`, {
  method: "PATCH", headers: { Authorization: `Bearer ${ctok}`, "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
console.log(`Coolify write: HTTP ${w.status}`);
const { missing, differ } = compare(v.env, await coolifyEnv(app));   // READ EVERY ONE BACK
if (missing.length || differ.length) { console.log("⚠ Read-back does not match — fix before deploying."); process.exit(1); }
const url = arg("--url");
if (url) {
  const r = await fetch(`${url.replace(/\/$/, "")}/api/admin/vault/restore-tables`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Secret": v.env.ADMIN_SECRET || "" },
    body: JSON.stringify({ tables: v.tables }) });
  console.log(`Tables restore: HTTP ${r.status} ${JSON.stringify((await r.json().catch(() => ({}))).restored ?? "")}`);
} else console.log("No --url: tables not sent. Deploy the app, then re-run with --url to restore the tables.");
