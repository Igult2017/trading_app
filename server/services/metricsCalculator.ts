import { spawn } from "child_process";
import * as path from "path";

interface MetricsResult {
  success: boolean;
  metrics?: Record<string, any>;
  error?: string;
}

export async function computeMetrics(trades: any[]): Promise<MetricsResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "server", "python", "metrics_calculator.py");

    const child = spawn("python3", [scriptPath], {
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    const input = JSON.stringify(trades);
    child.stdin.write(input);
    child.stdin.end();

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      if (stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          if (!result.success) {
            console.error("[MetricsCalculator] Computation error:", result.error);
          }
          resolve(result);
          return;
        } catch (e) {
          console.error("[MetricsCalculator] Parse error:", stdout);
        }
      }
      if (code !== 0 || stderr.trim()) {
        console.error("[MetricsCalculator] Python error:", stderr);
        resolve({ success: false, error: stderr || "Metrics computation failed" });
        return;
      }
      resolve({ success: false, error: "No output from metrics computation" });
    });

    child.on("error", (err) => {
      console.error("[MetricsCalculator] Spawn error:", err);
      resolve({ success: false, error: err.message });
    });

    setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ success: false, error: "Metrics computation timed out (30s)" });
    }, 30000);
  });
}
