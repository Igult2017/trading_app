#!/usr/bin/env python3
"""
ocr_screenshot_analyzer.py
───────────────────────────
Entry-point wrapper called by server/services/ocrScreenshotAnalyzer.ts.

Delegates to the full v8 modular pipeline (all modules in same directory).
Accepts base64-encoded image on stdin, writes JSON to stdout.
"""

import sys
import os
import json
import traceback

# All pipeline modules live in the same directory as this file (server/python/)
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

try:
    from image_preprocessor import load_from_b64, PreprocessedImage
    from analyzer import analyze
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"OCR v8 pipeline import failed: {e}. "
                 f"Ensure all pipeline modules are in {_HERE} and dependencies are installed.",
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
