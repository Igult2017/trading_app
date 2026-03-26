/**
 * Resolves the correct Python 3 executable for spawning subprocesses.
 *
 * Priority:
 *   1. PYTHON_BIN environment variable (explicit override)
 *   2. .venv/bin/python3 inside the project root (uv-managed venv)
 *   3. "python3" (system fallback)
 */

import * as fs from "fs";
import * as path from "path";

function resolve(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;

  const venvPython = path.join(process.cwd(), ".venv", "bin", "python3");
  if (fs.existsSync(venvPython)) return venvPython;

  return "python3";
}

export const PYTHON_BIN: string = resolve();
