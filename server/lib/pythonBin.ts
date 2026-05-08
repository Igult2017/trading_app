/**
 * Resolves the correct Python 3 executable for spawning subprocesses.
 *
 * Priority:
 *   1. PYTHON_BIN environment variable (explicit override)
 *   2. .venv/bin/python3 inside the project root (uv-managed venv)
 *   3. .venv/bin/python
 *   4. Common absolute paths (/usr/bin/python3, /usr/local/bin/python3, etc.)
 *   5. "python3" then "python" — PATH-based last resorts
 */

import * as fs from "fs";
import * as path from "path";

function resolve(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;

  const cwd = process.cwd();

  const candidates = [
    path.join(cwd, ".venv", "bin", "python3"),
    path.join(cwd, ".venv", "bin", "python"),
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python3.12",
    "/usr/bin/python3.11",
    "/usr/bin/python3.10",
    "/usr/bin/python3.9",
    "/usr/local/bin/python",
    "/usr/bin/python",
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        console.log(`[PythonBin] Using Python at: ${p}`);
        return p;
      }
    } catch {}
  }

  // Last resort — let the OS PATH resolve it; spawn will throw ENOENT if missing
  console.warn("[PythonBin] No Python binary found at known paths. Falling back to 'python3'.");
  return "python3";
}

export const PYTHON_BIN: string = resolve();
