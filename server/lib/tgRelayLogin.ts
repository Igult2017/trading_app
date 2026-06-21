// Bridge to the Python Telethon login helper (copy_platform/tg_login.py).
// Spawns a short-lived python process per OTP step; sensitive inputs (code/password)
// are sent via STDIN, never argv. Returns the helper's JSON result.
import { spawn } from "child_process";
import path from "path";

export interface TgLoginResult {
  ok: boolean;
  status?: "code_sent" | "password_needed" | "active";
  error?: string;
}

export function runTgLogin(payload: Record<string, unknown>): Promise<TgLoginResult> {
  return new Promise((resolve) => {
    const dir = path.join(process.cwd(), "copy_platform");
    const py = process.env.PYTHON_BIN || "python3";
    let out = "";
    let err = "";
    let done = false;
    const finish = (r: TgLoginResult) => { if (!done) { done = true; resolve(r); } };

    let proc;
    try {
      proc = spawn(py, ["tg_login.py"], { cwd: dir });
    } catch (e: any) {
      return finish({ ok: false, error: `could not start login helper: ${e?.message || e}` });
    }

    // Safety timeout — Telegram round-trips should be quick; never hang the request.
    const timer = setTimeout(() => { try { proc.kill(); } catch {} finish({ ok: false, error: "login helper timed out" }); }, 60_000);

    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", (e) => { clearTimeout(timer); finish({ ok: false, error: `login helper error: ${e.message}` }); });
    proc.on("close", () => {
      clearTimeout(timer);
      const line = out.trim().split("\n").pop() || "";
      try { finish(JSON.parse(line)); }
      catch { finish({ ok: false, error: err.trim() || out.trim() || "login helper produced no result" }); }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}
