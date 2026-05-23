/**
 * Resolves the correct Python 3 executable for spawning subprocesses.
 *
 * Priority:
 *   1. PYTHON_BIN environment variable (explicit override — always trusted)
 *   2. .pythonlibs/bin/python3  (Replit uv-managed environment)
 *   3. .venv/bin/python3 / .venv/bin/python  (standard venv)
 *   4. Common absolute paths (/usr/bin/python3, etc.)
 *   5. "python3" / "python" — PATH-based last resort
 *
 * For each candidate the binary must:
 *   a) exist on disk, AND
 *   b) be able to import "cloudscraper" (our key scraping dependency)
 *
 * If no fully-qualified candidate passes the import check the resolver falls
 * back to whichever binary exists, with a loud warning, so the server at
 * least starts.  Set PYTHON_BIN to skip all checks.
 *
 * Hostinger / external VPS deployment:
 *   Run  `pip install -r requirements.txt`  on the server before starting,
 *   then optionally set  PYTHON_BIN=/path/to/python3  in your .env / systemd
 *   service file to pin the exact binary.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

function canImport(bin: string, pkg: string): boolean {
  try {
    execFileSync(bin, ["-c", `import ${pkg}`], { timeout: 8000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function resolve(): string {
  if (process.env.PYTHON_BIN) {
    console.log(`[PythonBin] Using PYTHON_BIN override: ${process.env.PYTHON_BIN}`);
    return process.env.PYTHON_BIN;
  }

  const cwd = process.cwd();

  const candidates = [
    path.join(cwd, ".pythonlibs", "bin", "python3"),  // Replit uv env
    path.join(cwd, ".venv", "bin", "python3"),         // standard venv
    path.join(cwd, ".venv", "bin", "python"),
    "/usr/local/bin/python3",
    "/usr/bin/python3",
    "/usr/bin/python3.12",
    "/usr/bin/python3.11",
    "/usr/bin/python3.10",
    "/usr/bin/python3.9",
    "/usr/local/bin/python",
    "/usr/bin/python",
  ];

  let firstExisting: string | null = null;

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
    } catch {
      continue;
    }

    if (!firstExisting) firstExisting = p;

    if (canImport(p, "cloudscraper")) {
      console.log(`[PythonBin] Selected: ${p}  (cloudscraper ✓)`);
      return p;
    }

    console.warn(`[PythonBin] ${p} exists but missing cloudscraper — skipping`);
  }

  // No binary passed the import check — fall back to first existing binary.
  if (firstExisting) {
    console.warn(
      `[PythonBin] WARNING: No Python with cloudscraper found. ` +
      `Falling back to ${firstExisting}. ` +
      `Run  pip install -r requirements.txt  to fix this.`
    );
    return firstExisting;
  }

  // Nothing found at all.
  console.warn(
    "[PythonBin] No Python binary found at any known path. " +
    "Set PYTHON_BIN env var or install Python and run pip install -r requirements.txt"
  );
  return "python3";
}

export const PYTHON_BIN: string = resolve();
