"""
ai_engine/qa_worker.py
Long-running QA worker. Reads newline-delimited JSON requests on stdin and
writes newline-delimited JSON responses on stdout. One process is spawned
once and reused across many chat messages — eliminates the 2-4s Python
startup cost on every request.

Request shape:
  {
    "id": "<correlation id>",
    "trades": [...],
    "question": "...",
    "messages": [{"role": "user|model", "content": "..."}, ...],
    "metrics_context": {...}    (optional)
  }

Response shape:
  {"id": "...", "ok": true,  "answer": "..."}
  {"id": "...", "ok": false, "error": "..."}
"""
from __future__ import annotations
import json
import sys
import traceback

from ._utils import remap_trade
from .core import run_qa


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    # Eagerly import the heavy modules so the first real request is fast.
    sys.stderr.write("qa_worker: ready\n")
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            _emit({"id": None, "ok": False, "error": f"invalid JSON: {exc}"})
            continue

        req_id = req.get("id")
        try:
            trades = req.get("trades", []) or []
            trades = [remap_trade(t) if isinstance(t, dict) else t for t in trades]
            question = req.get("question", "") or ""
            messages = req.get("messages") or []
            metrics_context = req.get("metrics_context")

            answer = run_qa(
                trades=trades,
                question=question,
                messages=messages,
                metrics_context=metrics_context,
            )
            _emit({"id": req_id, "ok": True, "answer": answer})
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"qa_worker error: {exc}\n{traceback.format_exc()}\n")
            sys.stderr.flush()
            _emit({"id": req_id, "ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()
