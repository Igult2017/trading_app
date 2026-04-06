"""
ai_engine/main.py
Stdin/stdout entry point — spawned by Node.js via child_process.

Protocol (JSON lines):
  stdin:  { "mode": "analysis"|"qa"|"strategy", "trades": [...], "question": "..." }
  stdout: JSON result dict
  stderr: error string (non-zero exit on failure)

Usage:
  echo '{"mode":"analysis","trades":[...]}' | python -m ai_engine.main
"""
from __future__ import annotations
import json
import sys


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"ai_engine: invalid JSON on stdin: {exc}\n")
        sys.exit(1)

    mode     = payload.get("mode", "analysis")
    trades   = payload.get("trades", [])
    question = payload.get("question", "")

    if not isinstance(trades, list):
        sys.stderr.write("ai_engine: 'trades' must be a list\n")
        sys.exit(1)

    if not trades:
        result = {
            "error": "No trades provided. Record at least 5 trades before running analysis.",
            "mode":  mode,
        }
        sys.stdout.write(json.dumps(result))
        return

    # Late import keeps startup fast when called with bad input
    from .core import run

    try:
        result = run(mode=mode, trades=trades, question=question)
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"ai_engine: runtime error: {exc}\n")
        sys.exit(1)

    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
