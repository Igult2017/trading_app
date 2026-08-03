"""
NO SOURCE CITATIONS IN READER-FACING SIGNAL TEXT.

The live cards quoted chapter and page numbers ("the book's Entry-2 situation (p7, diagram p9)").
A page number is noise to someone deciding whether to take a trade, and it puts the method on
display for anyone the card is forwarded to. User's instruction, 2026-08-01: use the book, do not
mention it.

The book stays the source of the LOGIC and stays cited in CODE COMMENTS and the strategy docs —
that is where a citation earns its place, because it tells the next engineer where a rule came from.

This scans the STRING LITERALS of the signal-building modules, not their comments, so the citations
that belong in the code are untouched. It exists because the leak is additive: any new card line can
reintroduce it, and nobody re-reads a card they did not write.
"""
import ast
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, ROOT)

# Modules whose string literals can reach a reader.
#
# THIS LIST IS THE TEST. A module missing from it is not covered, and the test still passes — which
# is exactly what happened: `bx_sd_control.phrase()` shipped `(the book's "tug of war", p81)` onto
# the first line of every entry card while this file reported ALL PASS. The user found it.
#
# The rule for adding one: if any string it returns can end up in `technical_reasons`,
# `smc_factors`, `market_context`, or a Telegram message, it belongs here. Everything the card
# assembles from `setup.confluences` qualifies — that dict is built from bx_sd_control (control
# phrase), bx_sd_entry_type (entry type), bx_sd_confluence (pricing), and bx_sd_strength
# (mitigation note, strength phrase).
TARGETS = [
    "strategies/bx_sd_signal.py",
    "strategies/bx_sd_entry_type.py",
    "strategies/bx_sd_mitigation.py",
    "strategies/bx_sd_reports.py",
    "strategies/bx_sd_control.py",       # control_phrase — the card's FIRST line
    "strategies/bx_sd_strength.py",      # mitigation_note + strength_phrase
    "strategies/bx_sd_confluence.py",    # pricing wording
    "strategies/bx_sd_entry.py",         # trigger method + rejection reasons
    "strategies/bx_sd_setup.py",         # setup reasons (watch/skip messages)
    "strategies/bx_sd_watch.py",         # invalidation + zone-broken messages
    "strategies/vix1_signal.py",
    "strategies/vix1_watch.py",
    "notifications/telegram_cards.py",
    "notifications/telegram_system_formatter.py",
]

# "p29" / "p33-35" / "Ch.6" / "chapter 9" / "the book" / "page 12"
CITE = re.compile(r"(?i)\b(ch\.\s*\d+|chapter\s+\d+|the\s+book|p\.?\s?\d{1,3}(-\d{1,3})?\b|page\s+\d+)")

# "the zone book" is OUR OWN registry, not the reference book — a false positive to skip.
ALLOW = re.compile(r"(?i)zones?\s+on\s+the\s+book|the\s+zone\s+book")

F, N = [], 0
print("Scanning reader-facing string literals for source citations\n")

for rel in TARGETS:
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        continue
    src = open(path, encoding="utf-8").read()
    tree = ast.parse(src)

    # DOCSTRINGS ARE COMMENTS AND KEEP THEIR CITATIONS. Identified structurally — the first
    # statement of a module, function or class, as a bare string expression — rather than by
    # guessing at length. A short docstring is still a docstring, and the first version of this
    # check used a 400-char guard and duly flagged a one-line one.
    doc_ids = set()
    for holder in [tree] + [n for n in ast.walk(tree)
                            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]:
        body = getattr(holder, "body", None)
        if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
                and isinstance(body[0].value.value, str):
            doc_ids.add(id(body[0].value))

    bad = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            if id(node) in doc_ids:
                continue
            text = node.value
            if ALLOW.search(text):
                continue
            m = CITE.search(text)
            if m:
                bad.append((node.lineno, m.group(0), text.strip()[:70]))
    N += 1
    if bad:
        F.append(rel)
        print(f"   FAIL  {rel}")
        for ln, hit, txt in bad[:6]:
            print(f"           L{ln}  matched {hit!r}  in: {txt!r}")
    else:
        print(f"   PASS  {rel}")

# Docstrings are excluded by the length guard above, which is crude. Assert the guard is doing
# something rather than silently passing everything.
print()
if CITE.search("the book's Entry-2 situation (p7, diagram p9)"):
    print("   PASS  TEETH — the detector matches the exact string that was live")
    N += 1
else:
    print("   FAIL  TEETH — detector does not match the known-bad string")
    F.append("TEETH")

print(f"\n{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} files scanned)")
sys.exit(1 if F else 0)
