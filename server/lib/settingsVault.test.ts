/**
 * settingsVault.test.ts — run with:   npx tsx server/lib/settingsVault.test.ts
 *
 * His settings vault (17 Nov 2026): an encrypted copy of every setting in his PRIVATE GitHub repo. Fake database and
 * fake GitHub — nothing leaves this machine.
 */
import { readFileSync } from "fs";
import { join } from "path";

process.env.DATABASE_URL ||= "postgresql://x/x";
let failed = 0, total = 0;
function check(name: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}${ok ? "" : `, want ${JSON.stringify(want)}`}`);
}
const ROOT = join(import.meta.dirname, "..", "..");

(async () => {
  const V = await import("./settingsVault");
  const { pool } = await import("../db");
  const age = await import("age-encryption");
  console.log("\nSETTINGS VAULT\n");

  // ── what is saved ───────────────────────────────────────────────────────
  const env = V.collectEnv({ PATH: "/bin", HOSTNAME: "x", NODE_VERSION: "20", npm_config_x: "1", COOLIFY_FQDN: "a",
                             DATABASE_URL: "pg://secret", TELEGRAM_BOT_TOKEN: "t", COPY_ENCRYPTION_KEY: "k" } as any);
  check("his settings kept, machine variables dropped", Object.keys(env), ["COPY_ENCRYPTION_KEY", "DATABASE_URL", "TELEGRAM_BOT_TOKEN"]);
  check("tables in restore order: users before every copy table, copy_masters before telegram_signal_sources",
        V.VAULT_TABLES.indexOf("users") < V.VAULT_TABLES.indexOf("copy_accounts")
        && V.VAULT_TABLES.indexOf("copy_accounts") < V.VAULT_TABLES.indexOf("copy_masters")
        && V.VAULT_TABLES.indexOf("copy_masters") < V.VAULT_TABLES.indexOf("copy_followers")
        && V.VAULT_TABLES.indexOf("copy_masters") < V.VAULT_TABLES.indexOf("telegram_signal_sources"), true);
  check("the same settings always hash the same (key order does not matter)",
        V.stable({ b: 1, a: [2, { d: 3, c: 4 }] }) === V.stable({ a: [2, { c: 4, d: 3 }], b: 1 }), true);

  // ── locked to HIS key, opened only by HIS key ───────────────────────────
  const id = await age.generateIdentity(), pub = await age.identityToRecipient(id);
  const locked = await V.encryptTo(pub, JSON.stringify({ env }));
  check("the file does not contain any value in readable form",
        Buffer.from(locked).toString("latin1").includes("pg://secret"), false);
  const d = new age.Decrypter(); d.addIdentity(id);
  check("his private key opens it, exactly", JSON.parse(await d.decrypt(locked, "text")).env, env);
  const other = new age.Decrypter(); other.addIdentity(await age.generateIdentity());
  check("any other key cannot", await other.decrypt(locked, "text").then(() => "opened", () => "refused"), "refused");

  // ── one save, fake database + fake GitHub ───────────────────────────────
  check("off until all three VAULT_* settings exist", (await V.saveVaultOnce()).startsWith("off"), true);
  process.env.VAULT_AGE_RECIPIENT = pub; process.env.VAULT_GITHUB_REPO = "him/trading-app-vault"; process.env.VAULT_GITHUB_TOKEN = "ghp_test";
  (pool as any).query = async (q: string) => ({ rows: q.includes("platform_settings") ? [{ key: "trade_mode", value: "auto" }] : [] });
  const puts: any[] = []; const logs: string[] = [];
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (init?.method === "PUT") { puts.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 201 }; }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const first = await V.saveVaultOnce();
  check("saved to settings.age in HIS private vault repo", puts.map(p => p.url),
        ["https://api.github.com/repos/him/trading-app-vault/contents/settings.age"]);
  const opened = JSON.parse(await d.decrypt(new Uint8Array(Buffer.from(puts[0].body.content, "base64")), "text"));
  check("...it holds the Autotrade switch row", opened.tables.platform_settings, [{ key: "trade_mode", value: "auto" }]);
  check("...the commit message carries counts, never a value", /ghp_test|secret/.test(puts[0].body.message), false);
  check("the result line names counts only", /ghp_test|pg:\/\/|trade_mode.*auto/.test(first), false);
  check("nothing changed -> nothing saved again", [(await V.saveVaultOnce()).startsWith("unchanged"), puts.length], [true, 1]);

  // ── wiring + safety, read from source ───────────────────────────────────
  const routes = readFileSync(join(ROOT, "server", "routes.ts"), "utf8");
  check("TEETH — the restore endpoint is admin-only",
        /app\.post\("\/api\/admin\/vault\/restore-tables", requireAdmin,/.test(routes), true);
  const bg = readFileSync(join(ROOT, "server", "lib", "backgroundServices.ts"), "utf8");
  check("TEETH — the live server starts it (shared background services)", /\n\s+startSettingsVault\(\);/.test(bg), true);
  const src = readFileSync(join(ROOT, "server", "lib", "settingsVault.ts"), "utf8");
  check("no log line prints the settings themselves", /console\.\w+\([^)]*\b(env|tables|file|body)\b[^)]*\)/.test(src), false);
  const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
  check("TEETH — a private key file can never be committed", /trading-app-vault-key/.test(ignore), true);

  console.log(`\n${failed ? `${failed} of ${total} FAILED` : `ALL PASS (${total} checks)`}\n`);
  process.exit(failed ? 1 : 0);
})();
