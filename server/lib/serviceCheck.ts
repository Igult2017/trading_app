import { log } from "../static";

interface ServiceCheck {
  label: string;
  ok: boolean;
  note?: string;
}

export function logServiceStatus(): void {
  const env = process.env;

  const checks: ServiceCheck[] = [
    {
      label: "Database (DATABASE_URL)",
      ok: Boolean(env.DATABASE_URL),
    },
    {
      label: "Admin login (ADMIN_EMAIL + ADMIN_SECRET)",
      ok: Boolean(env.ADMIN_EMAIL && env.ADMIN_SECRET),
    },
    {
      label: "Gemini AI (GOOGLE_API_KEY)",
      ok: Boolean(env.GOOGLE_API_KEY),
      note: "AI chat, signal analysis, and OCR disabled without this",
    },
    {
      label: "Telegram bot (TELEGRAM_BOT_TOKEN)",
      ok: Boolean(env.TELEGRAM_BOT_TOKEN),
      note: "Telegram notifications and signal alerts disabled without this",
    },
    {
      label: "Supabase auth (VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
      ok: Boolean(env.VITE_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
      note: "Falling back to local admin-only login",
    },
    {
      label: "cTrader signal data (CTRADER_CLIENT_ID + ACCESS/REFRESH TOKEN)",
      ok: Boolean(
        env.CTRADER_CLIENT_ID &&
        env.CTRADER_CLIENT_SECRET &&
        env.CTRADER_ACCOUNT_ID &&
        env.CTRADER_ACCESS_TOKEN &&
        env.CTRADER_REFRESH_TOKEN
      ),
      note: "Signal platform will exit(1) at boot — no EUR/USD signals without this",
    },
  ];

  const width = 60;
  const line = "─".repeat(width);

  log(`┌${line}┐`);
  log(`│${"  SERVICE STATUS CHECK".padEnd(width)}│`);
  log(`├${line}┤`);

  for (const { label, ok, note } of checks) {
    const icon = ok ? "✓" : "✗";
    const status = ok ? "OK     " : "MISSING";
    const row = ` ${icon} ${status}  ${label}`;
    log(`│${row.padEnd(width)}│`);
    if (!ok && note) {
      const noteRow = `           → ${note}`;
      log(`│${noteRow.padEnd(width)}│`);
    }
  }

  log(`└${line}┘`);
}
