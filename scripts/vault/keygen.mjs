// keygen.mjs — make HIS settings-vault key pair. Run once, on his PC:   node scripts/vault/keygen.mjs
//
// The PRIVATE key is written OUTSIDE the repo (default C:\Users\FSD\trading-app-vault-key.txt) and is never printed.
// He copies it into his password manager: lose it and nobody can open the vault. Only the PUBLIC key is printed —
// it goes into Coolify as VAULT_AGE_RECIPIENT, so the server can lock vaults but never open them.
import { existsSync, writeFileSync } from "fs";
import { generateIdentity, identityToRecipient } from "age-encryption";

const out = process.argv[2] || "C:\\Users\\FSD\\trading-app-vault-key.txt";
if (existsSync(out)) {
  console.error(`A key already exists at ${out} — refusing to overwrite it (that would lock you out of every vault made with it).`);
  process.exit(1);
}
const identity = await generateIdentity();
const recipient = await identityToRecipient(identity);
writeFileSync(out, `# settings vault PRIVATE key — created ${new Date().toISOString()}\n# public key: ${recipient}\n${identity}\n`,
              { mode: 0o600 });
console.log(`PRIVATE key written to ${out} — copy this file into your password manager now.`);
console.log(`PUBLIC key (goes into Coolify as VAULT_AGE_RECIPIENT):\n${recipient}`);
