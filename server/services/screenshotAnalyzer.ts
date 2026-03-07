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
      if (code !== 0) {
        console.error("[ScreenshotAnalyzer] Python error:", stderr);
        resolve({ success: false, error: stderr || "Analysis failed" });
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        console.error("[ScreenshotAnalyzer] Parse error:", stdout);
        resolve({ success: false, error: "Failed to parse analysis result" });
      }
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
