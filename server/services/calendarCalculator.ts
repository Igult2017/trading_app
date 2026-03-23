import { spawn } from "child_process";
import * as path from "path";
import { PYTHON_BIN } from "../lib/pythonBin";

interface CalendarResult {
  success: boolean;
  calendarData?: Record<string, Record<string, { pnl: number; trades: number; winRate: number }>>;
  availableMonths?: string[];
  error?: string;
}

export async function computeCalendar(trades: any[]): Promise<CalendarResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "server", "python", "calendar_calculator.py");

    const child = spawn(PYTHON_BIN, [scriptPath], {
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdin.write(JSON.stringify(trades));
    child.stdin.end();

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      if (stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
          return;
        } catch (e) {
          console.error("[CalendarCalculator] Parse error:", stdout);
        }
      }
      if (code !== 0 || stderr.trim()) {
        console.error("[CalendarCalculator] Python error:", stderr);
        resolve({ success: false, error: stderr || "Calendar computation failed" });
        return;
      }
      resolve({ success: false, error: "No output from calendar computation" });
    });

    child.on("error", (err) => {
      console.error("[CalendarCalculator] Spawn error:", err);
      resolve({ success: false, error: err.message });
    });

    setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ success: false, error: "Calendar computation timed out (15s)" });
    }, 15000);
  });
}
