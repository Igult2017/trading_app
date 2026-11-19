"""Every `trading_signals` column the web app reads must be MADE by `docker-migrate.sql` (19 Nov 2026).

WHY. On the new server the database started empty and the table was created by the Python engine's shorter
definition (`storage/models.py`, 27 columns) — the migration never created it, only added two columns. The web
schema (`shared/schema.ts`, 47 columns) then asked for `interest_rate_diff_score` on every read, got 42703, and the
Assets page showed "no confirmed entries" because every load was a 500. This pins the two files together.

No database, no network: it reads the two source files. Run: python tests/test_signal_columns.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def schema_columns(ts: str) -> list[str]:
    body = ts[ts.index('export const tradingSignals = pgTable("trading_signals"'):]
    body = body[:body.index("\n});")]
    return re.findall(r'^\s+\w+:\s*\w+\("([a-z_0-9]+)"', body, flags=re.M)


def made_columns(sql: str) -> set[str]:
    made = set(re.findall(r"ALTER TABLE trading_signals ADD COLUMN IF NOT EXISTS (\w+)", sql))
    m = re.search(r"CREATE TABLE IF NOT EXISTS trading_signals \((.*?)\n\);", sql, flags=re.S)
    if m:
        made |= {ln.strip().split()[0] for ln in m.group(1).splitlines() if ln.strip()}
    return made


def missing(ts: str, sql: str) -> list[str]:
    return [c for c in schema_columns(ts) if c not in made_columns(sql)]


ts = (ROOT / "shared" / "schema.ts").read_text(encoding="utf-8")
sql = (ROOT / "docker-migrate.sql").read_text(encoding="utf-8")
bad = []
cols = schema_columns(ts)
print(f"   {'PASS' if len(cols) >= 40 else 'FAIL'}  the schema's columns were read ({len(cols)})")
if len(cols) < 40:
    bad.append("read")
gone = missing(ts, sql)
print(f"   {'PASS' if not gone else 'FAIL'}  every schema column is created or added by docker-migrate.sql: missing {gone}")
if gone:
    bad.append("missing")
broken = sql.replace("ADD COLUMN IF NOT EXISTS interest_rate_diff_score", "ADD COLUMN IF NOT EXISTS x_removed")
teeth = "interest_rate_diff_score" in missing(ts, broken)
print(f"   {'PASS' if teeth else 'FAIL'}  TEETH — removing the interest_rate_diff_score line is caught")
if not teeth:
    bad.append("teeth")
print("ALL PASS" if not bad else f"FAILED: {bad}")
sys.exit(1 if bad else 0)
