import { spawn } from "child_process";
import * as path from "path";

interface AnalysisResult {
  success: boolean;
  fields?: Record<string, any>;
  confidence?: string;
  validation?: {
    passed: boolean;
    summary: string;
    issues: Array<{ field: string; severity: string; message: string }>;
  };
  error?: string;
  method?: string;
  aiExtractedRaw?: Record<string, any>;
}

/**
 * OCR-based screenshot analyzer using the v8 modular pipeline.
 *
 * Pipeline: image_preprocessor → layout_detector → object_detector
 *           → candle_detector → ocr_engine → trade_parser
 *           → price_axis_reader (coordinate mapping)
 *           → trade_logic_engine → validation_engine
 *
 * Calibrated for JForex replay-mode dark-theme screenshots.
 * Works offline — no API key required.
 */
export async function analyzeScreenshotWithOCR(
  base64Image: string
): Promise<AnalysisResult> {
  return new Promise((resolve) => {
    // All pipeline modules live in server/python/ocr/
    const scriptPath = path.join(
      process.cwd(),
      "server",
      "python",
      "ocr",
      "ocr_screenshot_analyzer.py"
    );

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
          console.error("[OCRAnalyzer v8] JSON parse error. stdout length:", stdout.length);
          console.error("[OCRAnalyzer v8] stdout (first 500 chars):", stdout.slice(0, 500));
        }
      }
      if (code !== 0 || stderr.trim()) {
        console.error("[OCRAnalyzer v8] Python error (exit code", code, "):", stderr);
        settle({
          success: false,
          method: "ocr",
          error: stderr.trim() || "OCR v8 analysis failed",
        });
        return;
      }
      settle({
        success: false,
        method: "ocr",
        error: "No output from OCR v8 analyzer",
      });
    });

    child.on("error", (err) => {
      console.error("[OCRAnalyzer v8] Spawn error:", err);
      settle({
        success: false,
        method: "ocr",
        error: `Failed to start OCR process: ${err.message}`,
      });
    });

    // 90s timeout — v8 pipeline includes Hough + calibration which takes ~30s
    setTimeout(() => {
      try { child.kill(); } catch {}
      settle({
        success: false,
        method: "ocr",
        error: "OCR v8 analysis timed out (90s)",
      });
    }, 90_000);
  });
}

/**
 * Check whether the v8 OCR pipeline and its dependencies are available.
 * All modules live in server/python/ocr/ so we just check imports from there.
 */
export async function isOCRAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const scriptDir = path.join(process.cwd(), "server", "python", "ocr");

    const check = spawn("python3", [
      "-c",
      [
        "import sys, os",
        // Point directly at server/python/ocr/ where all modules live
        `sys.path.insert(0, ${JSON.stringify(scriptDir)})`,
        "import pytesseract, cv2, numpy, scipy",
        "import subprocess",
        "r = subprocess.run(['tesseract', '--version'], capture_output=True)",
        "assert r.returncode == 0",
        "print('ok')",
      ].join("; "),
    ]);

    let out = "";
    check.stdout.on("data", (d) => { out += d.toString(); });
    check.on("close", (code) => resolve(code === 0 && out.includes("ok")));
    check.on("error", () => resolve(false));
  });
}
