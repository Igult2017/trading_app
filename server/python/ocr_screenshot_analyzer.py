#!/usr/bin/env python3
"""
ocr_screenshot_analyzer.py
───────────────────────────
Entry-point wrapper called by server/services/ocrScreenshotAnalyzer.ts.

Delegates to the full v8 modular pipeline (trading_ocr_v8/analyzer.py).
Accepts base64-encoded image on stdin, writes JSON to stdout.

The v8 pipeline returns:
  {
    "success": bool,
    "fields":  { ... all extracted fields ... },
    "confidence": "high"|"medium"|"low",
    "validation": { "passed": bool, "summary": str, "issues": [...] },
    "aiExtractedRaw": { "method": "ocr_v8_jforex", "debug": {...}, ... }
  }

This wrapper passes the result straight through, adding
  "method": "ocr"
so the TypeScript service recognises it as an OCR result.
"""

import sys
import os
import json
import traceback

# Add trading_ocr_v8 to path so its modules are importable
_HERE = os.path.dirname(os.path.abspath(__file__))
_V8   = os.path.join(os.path.dirname(_HERE), "trading_ocr_v8")
if os.path.isdir(_V8):
    sys.path.insert(0, _V8)
else:
    # Fallback: try sibling directory (different deployment layouts)
    _V8 = os.path.join(_HERE, "..", "trading_ocr_v8")
    sys.path.insert(0, os.path.abspath(_V8))

try:
    from image_preprocessor import load_from_b64, PreprocessedImage
    from analyzer import analyze
except ImportError as e:
    # Report dependency problem as structured JSON so the TS service
    # can show a clean error instead of a raw Python traceback
    print(json.dumps({
        "success": False,
        "error": f"OCR v8 pipeline import failed: {e}. "
                 f"Ensure trading_ocr_v8/ is at {_V8} and all dependencies are installed.",
        "method": "ocr",
    }))
    sys.exit(1)


def main():
    b64 = sys.stdin.read().strip()
    if not b64:
        print(json.dumps({
            "success": False,
            "error": "No image data received on stdin",
            "method": "ocr",
        }))
        return

    try:
        result = analyze(b64)
        # Ensure the method tag is present for the TS service
        result["method"] = "ocr"
        print(json.dumps(result, indent=2, default=str))
    except Exception as exc:
        print(json.dumps({
            "success":   False,
            "error":     str(exc),
            "traceback": traceback.format_exc(),
            "method":    "ocr",
        }))


if __name__ == "__main__":
    main()
