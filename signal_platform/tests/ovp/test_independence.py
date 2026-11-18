"""OVP stays INDEPENDENT and SWITCHED OFF until he says otherwise (docs/strategies/ovp.md).

His rule: strategies never share logic — OVP is a COPY of BX-S/D, so it must never import a `bx_sd` module (a change
to BX-S/D would then silently change OVP). And it must not run before his changes are built: not registered, not
enabled. Its pairs are his: *"It will trade BTCUSD and XAUUSD."*  Run: python tests/ovp/test_independence.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

BAD, TOTAL = [], [0]


def check(name, got, want):
    TOTAL[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


IMPORT_BX = re.compile(r"^\s*(from\s+strategies(\.|\s+import\s+)[^\n]*bx_sd|import\s+strategies\.bx_sd)", re.M)
ovp_files = sorted((ROOT / "strategies").glob("ovp*.py"))
offenders = [f.name for f in ovp_files if IMPORT_BX.search(f.read_text(encoding="utf-8"))]
check(f"no OVP file ({len(ovp_files)}) imports a BX-S/D module", offenders, [])
check("...the check really finds such an import (teeth)",
      bool(IMPORT_BX.search("from strategies.bx_sd_zones import find\n")), True)

init = (ROOT / "strategies" / "__init__.py").read_text(encoding="utf-8")
check("OVP is NOT registered with the scanner", "OVPStrategy" in init or "strategies.ovp" in init, False)

from strategies.ovp import OVPStrategy  # noqa: E402
check("OVP is switched off", OVPStrategy.enabled, False)
check("OVP trades only his two instruments", OVPStrategy.allowed_instruments, ["BTC/USD", "XAU/USD"])

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {TOTAL[0]} FAILED: {BAD}'} ({TOTAL[0]} checks)")
sys.exit(1 if BAD else 0)
