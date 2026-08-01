"""Static dead-code audit for signal_platform.

Finds what the delete-dead-files rule forbids: orphaned modules, unused imports, unread constants,
dead branches, and files over the 150-line limit.

RUN THIS AFTER ANY CHANGE THAT REMOVES A CALLER. Deleting one code path has repeatedly orphaned an
entire module without anyone noticing — an orphaned file is unexercised, untested, unreviewed, and
still in the deployed image, which is exactly what makes it worth hiding something in.

    python scripts/audit_dead_code.py

A module is reported ORPHANED only if nothing imports it AND its name appears in no string anywhere
(so dynamic imports, importlib, and subprocess `-m` invocations do not produce false positives).
"""
import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "signal_platform"
SKIP_DIRS = {"tests", ".venv", "__pycache__", "node_modules"}
ENTRYPOINTS = {"__init__", "main", "conftest"}
LINE_LIMIT = 150


def sources():
    for p in ROOT.rglob("*.py"):
        if not SKIP_DIRS & set(p.parts):
            yield p


def reachable_names(tree):
    """Every module name this file makes reachable — for the ORPHAN check.

    `from core import delivery_ledger` imports a MODULE by name, so both `core` and
    `delivery_ledger` count. An earlier version recorded only `core` and reported 28 live modules
    as orphaned."""
    out = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.ImportFrom):
            if n.module:
                out |= set(n.module.split("."))
            for a in n.names:
                out.add(a.name.split(".")[0])
        elif isinstance(n, ast.Import):
            for a in n.names:
                out |= set(a.name.split("."))
    return out


def bound_names(tree):
    """Only the names an import actually BINDS in this file — for the UNUSED-IMPORT check.

    `from pathlib import Path` binds `Path`, not `pathlib`. Conflating this with reachability made
    the first run report 400+ phantom unused imports, which is the same cry-wolf failure the orphan
    check already had. Two questions, two functions."""
    out = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.ImportFrom):
            # `from __future__ import annotations` is a compiler directive, not a binding
            if n.module == "__future__":
                continue
            for a in n.names:
                if a.name != "*":
                    out.add(a.asname or a.name)
        elif isinstance(n, ast.Import):
            for a in n.names:
                # `import os.path` binds `os`; `import os.path as p` binds `p`
                out.add(a.asname or a.name.split(".")[0])
    return out


def main():
    files = list(sources())
    parsed = {}
    for p in files:
        try:
            parsed[p] = (ast.parse(p.read_text(encoding="utf-8")), p.read_text(encoding="utf-8"))
        except SyntaxError as e:
            print(f"SYNTAX ERROR {p}: {e}")
            return 2

    all_src = "\n".join(src for _, src in parsed.values())
    reachable = set()
    for tree, _ in parsed.values():
        reachable |= reachable_names(tree)

    issues = []

    for p, (tree, src) in sorted(parsed.items()):
        rel = p.relative_to(ROOT)
        stem = p.stem

        # ---- orphaned module: nothing imports it, its name is in no string, and it is not a
        # runnable script. A file with `if __name__ == "__main__"` is an ENTRYPOINT — it is meant to
        # be run, not imported, so "nothing imports it" says nothing about whether it is needed.
        # Without this the check would demand deleting every operational tool in the repo.
        runnable = any(
            isinstance(n, ast.If) and isinstance(n.test, ast.Compare)
            and isinstance(n.test.left, ast.Name) and n.test.left.id == "__name__"
            for n in ast.walk(tree))
        if stem not in ENTRYPOINTS and stem not in reachable and not runnable:
            quoted = f'"{stem}"' in all_src or f"'{stem}'" in all_src
            if not quoted:
                issues.append(("ORPHANED MODULE", f"{rel} — nothing imports it; DELETE it"))

        # ---- unused imports (bound names only — `from pathlib import Path` binds `Path`)
        used = set()
        for n in ast.walk(tree):
            if isinstance(n, ast.Name):
                used.add(n.id)
            elif isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name):
                used.add(n.value.id)
        # a re-export in __init__ counts as use; so does a name only referenced in a type string
        if stem != "__init__":
            for d in sorted(bound_names(tree) - used):
                # a name that appears in a string is likely a forward-ref annotation or a getattr
                if f'"{d}"' not in src and f"'{d}'" not in src:
                    issues.append(("UNUSED IMPORT", f"{rel} imports `{d}` and never uses it"))

        # ---- dead branches
        for n in ast.walk(tree):
            if isinstance(n, ast.For) and isinstance(n.iter, (ast.List, ast.Tuple)) and not n.iter.elts:
                issues.append(("DEAD LOOP", f"{rel}:{n.lineno} iterates an empty literal"))
            if isinstance(n, ast.If) and isinstance(n.test, ast.Constant) and not n.test.value:
                issues.append(("DEAD BRANCH", f"{rel}:{n.lineno} `if <falsey constant>`"))

        # ---- 150-line limit
        n_lines = len(src.splitlines())
        if n_lines > LINE_LIMIT:
            issues.append(("OVER LINE LIMIT", f"{rel} = {n_lines} lines (limit {LINE_LIMIT})"))

    # ---- module-level constants nobody reads
    for p, (tree, _) in sorted(parsed.items()):
        for n in tree.body:
            if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name):
                name = n.targets[0].id
                if (name.isupper() or name.startswith("_")) and all_src.count(name) <= 1:
                    issues.append(("UNREAD CONSTANT",
                                   f"{p.relative_to(ROOT)}:{n.lineno} `{name}` assigned, never read"))

    by_kind = {}
    for kind, msg in issues:
        by_kind.setdefault(kind, []).append(msg)

    print(f"{len(files)} files scanned, {len(issues)} finding(s)\n")
    for kind in ("ORPHANED MODULE", "DEAD LOOP", "DEAD BRANCH", "UNUSED IMPORT",
                 "UNREAD CONSTANT", "OVER LINE LIMIT"):
        for msg in by_kind.get(kind, []):
            print(f"  {kind:<16} {msg}")

    # Only the DELETE-able classes fail the run. The line limit is a known, tracked backlog and
    # should not block a bug fix.
    hard = sum(len(by_kind.get(k, []))
               for k in ("ORPHANED MODULE", "DEAD LOOP", "DEAD BRANCH", "UNUSED IMPORT"))
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
