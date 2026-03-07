import { spawn } from "child_process";
import * as path from "path";

interface AnalysisResult {
  success: boolean;
  fields?: Record<string, any>;
  error?: string;
}

export async function analyzeScreenshot(base64Image: string): Promise<AnalysisResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "server", "python", "screenshot_analyzer.py");

    const child = spawn("python3", [scriptPath, "--analyze"], {
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdin.write(base64Image);
    child.stdin.end();

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      if (stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          if (!result.success) {
            console.error("[ScreenshotAnalyzer] Analysis error:", result.error);
          }
          resolve(result);
          return;
        } catch (e) {
          console.error("[ScreenshotAnalyzer] Parse error:", stdout);
        }
      }
      if (code !== 0 || stderr.trim()) {
        console.error("[ScreenshotAnalyzer] Python error:", stderr);
        resolve({ success: false, error: stderr || "Analysis failed" });
        return;
      }
      resolve({ success: false, error: "No output from analysis" });
    });

    child.on("error", (err) => {
      console.error("[ScreenshotAnalyzer] Spawn error:", err);
      resolve({ success: false, error: err.message });
    });

    setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ success: false, error: "Analysis timed out (60s)" });
    }, 60000);
  });
}
