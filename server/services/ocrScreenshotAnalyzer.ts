import { spawn } from "child_process";
import * as path from "path";

interface AnalysisResult {
  success: boolean;
  fields?: Record<string, any>;
  error?: string;
  method?: string;
}

/**
 * OCR-based screenshot analyzer using Tesseract + OpenCV.
 * Alternative to the Gemini AI analyzer — no API key required.
 * Works offline with local OCR processing.
 *
 * Best suited for:
 *  - TradingView screenshots with visible text overlays
 *  - MT4 / MT5 trade history or open position windows
 *  - Screenshots with legible SL/TP labels, P&L values, and instrument names
 *
 * Limitations vs. Gemini:
 *  - Cannot interpret price action or candlestick patterns visually
 *  - Relies on text being visible and legible in the screenshot
 *  - May miss data in very small fonts or complex chart overlays
 */
export async function analyzeScreenshotWithOCR(base64Image: string): Promise<AnalysisResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "server", "python", "ocr_screenshot_analyzer.py");

    const child = spawn("python3", [scriptPath], {
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdin.write(base64Image);
    child.stdin.end();

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    let settled = false;
    const settle = (result: AnalysisResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    child.on("close", (code) => {
      if (stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          if (result.success && result.fields) {
            result.method = "ocr";
          }
          settle(result);
          return;
        } catch (e) {
          console.error("[OCRAnalyzer] JSON parse error:", stdout.slice(0, 200));
        }
      }
      if (code !== 0 || stderr.trim()) {
        console.error("[OCRAnalyzer] Python error:", stderr.slice(0, 500));
        settle({ success: false, method: "ocr", error: stderr.trim() || "OCR analysis failed" });
        return;
      }
      settle({ success: false, method: "ocr", error: "No output from OCR analyzer" });
    });

    child.on("error", (err) => {
      console.error("[OCRAnalyzer] Spawn error:", err);
      settle({ success: false, method: "ocr", error: `Failed to start OCR process: ${err.message}` });
    });

    // 60s timeout — same as Gemini analyzer
    setTimeout(() => {
      try { child.kill(); } catch {}
      settle({ success: false, method: "ocr", error: "OCR analysis timed out (60s)" });
    }, 60000);
  });
}

/**
 * Check whether Tesseract + Python OCR dependencies are installed and reachable.
 */
export async function isOCRAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const check = spawn("python3", ["-c", [
      "import pytesseract, cv2, numpy",
      "from PIL import Image",
      "import subprocess",
      "r = subprocess.run(['tesseract', '--version'], capture_output=True)",
      "assert r.returncode == 0",
      "print('ok')",
    ].join("; ")]);

    let out = "";
    check.stdout.on("data", (d) => { out += d.toString(); });
    check.on("close", (code) => resolve(code === 0 && out.includes("ok")));
    check.on("error", () => resolve(false));
  });
}
