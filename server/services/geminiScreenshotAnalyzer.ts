import { spawn } from "child_process";
import * as path from "path";
import { PYTHON_BIN } from "../lib/pythonBin";

export function isGeminiScreenshotAvailable(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY);
}

export async function analyzeScreenshotWithGemini(
  base64Image: string
): Promise<{ success: boolean; fields?: Record<string, any>; method?: string; error?: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(
      process.cwd(), "server", "python", "screenshot_analyzer.py"
    );

    const child = spawn(PYTHON_BIN, [scriptPath, "--analyze"], {
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdin.write(base64Image);
    child.stdin.end();

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    let settled = false;
    const settle = (result: any) => {
      if (!settled) { settled = true; resolve(result); }
    };

    child.on("close", () => {
      if (stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          if (result.success && result.fields) result.method = "gemini";
          settle(result);
          return;
        } catch {
          console.error("[GeminiScreenshot] JSON parse error, stdout:", stdout.slice(0, 300));
        }
      }
      settle({
        success: false, method: "gemini",
        error: stderr.trim() || "Gemini screenshot analysis failed",
      });
    });

    child.on("error", (err) => {
      settle({ success: false, method: "gemini", error: `Spawn error: ${err.message}` });
    });

    setTimeout(() => {
      try { child.kill(); } catch {}
      settle({ success: false, method: "gemini", error: "Gemini analysis timed out (60s)" });
    }, 60_000);
  });
}
