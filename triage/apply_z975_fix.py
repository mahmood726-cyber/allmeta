"""Cycle 7.1 portfolio sweep: replace hardcoded 1.96 with exact qnorm(0.975).

Used by the maintainer once.  Safe to re-run: idempotent — if Z975 is already
defined the constant insertion is skipped; if the 1.96 patterns have already
been replaced, no occurrences are found.

Usage:
  python triage/apply_z975_fix.py --dry-run     # show what would change
  python triage/apply_z975_fix.py                # apply changes

Affects only apps listed in CLEAN_APPS below (math-only 1.96 occurrences,
verified via classification).  Mixed-context apps (forest-plot, tsa,
workbench, etc.) are handled manually because they have 1.96 in prose too.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Apps where every 1.96 occurrence is a CI critical value in a math expression.
# Classified by triage/apply_z975_fix.py inspection on 2026-05-14.
CLEAN_APPS = [
    "bayesian-ma",
    "bayesian-nma",
    "bucher",
    "component-nma",
    "copas",
    "cumulative-subgroup",
    "funnel-plot",
    "hsroc",
    "influence",
    "limit-ma",
    "meta-regression",
    "nma",
    "pet-peese",
    "proportion-ma",
]

Z975_LITERAL = "1.959963984540054"
Z975_DECL = f'    // Cycle 7.1: exact qnorm(0.975) for 95% CIs (was 1.96; ~1.3e-5 drift vs metafor).\n    var Z975 = {Z975_LITERAL};\n\n'

# Patterns to substitute.  Order matters: longer/more-specific patterns first.
# All patterns require math-adjacent context so prose like "converges to 1.96"
# or HTML text "z > 1.96 indicate" is never touched.
SUB_PATTERNS = [
    # 1) Multiplicative: `1.96 * X` or `1.96*X` (most common)
    (re.compile(r'(?<![\.0-9])1\.96\s*\*'), 'Z975 *'),
    # 2) Additive: `+ 1.96` or `- 1.96` (e.g. y(-1.96), array bound)
    (re.compile(r'([+\-]\s*)1\.96\b(?!\.)'), r'\1Z975'),
    # 3) Division: `1.96 / sqrt(...)` (O'Brien-Fleming-style boundaries)
    (re.compile(r'(?<![\.0-9])1\.96\s*/'), 'Z975 /'),
    # 4) Function argument: `f(1.96)` or `f(... , 1.96)` or `f(1.96, ...)`
    (re.compile(r'([\(,]\s*)1\.96(\s*[\),])'), r'\1Z975\2'),
    # 5) Assignment: `var x = 1.96;` or `obj.k = 1.96,` etc.
    (re.compile(r'(=\s*)1\.96(\s*[;,)])'), r'\1Z975\2'),
]


def insert_z975_decl(html: str) -> tuple[str, bool]:
    """Insert Z975 declaration at the start of the first <script> body that
    contains a meaningful function definition.  Returns (new_html, inserted).

    Idempotent: skip if 'Z975' already declared anywhere in the file.
    """
    if re.search(r'\bvar\s+Z975\b|\bconst\s+Z975\b|\blet\s+Z975\b', html):
        return html, False
    # Find a <script> block that has function definitions inside it (not just an inline event handler).
    for m in re.finditer(r'<script(?:\s[^>]*)?>\s*\n', html):
        end = m.end()
        # Look at the next 2000 chars: is this a real engine script (has 'function ' or 'var ')?
        peek = html[end:end + 2000]
        if 'function ' in peek or 'var ' in peek or 'const ' in peek:
            return html[:end] + Z975_DECL + html[end:], True
    return html, False


def process_one(app_dir: Path, dry_run: bool) -> dict:
    idx = app_dir / "index.html"
    if not idx.is_file():
        return {"app": app_dir.name, "skip": "no index.html"}
    html = idx.read_text(encoding="utf-8", errors="replace")
    before = html
    html, inserted = insert_z975_decl(html)
    subs = {}
    for pat, repl in SUB_PATTERNS:
        new_html, n = pat.subn(repl, html)
        if n:
            subs[pat.pattern] = n
        html = new_html
    changed = (html != before)
    if changed and not dry_run:
        idx.write_text(html, encoding="utf-8", newline="\n")
    return {
        "app": app_dir.name,
        "inserted_decl": inserted,
        "substitutions": subs,
        "changed": changed,
        "remaining_1_96": len(re.findall(r'(?<![\.0-9])1\.96(?!\.)', html)),
    }


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apps", nargs="*", default=CLEAN_APPS)
    args = ap.parse_args(argv)

    any_changed = False
    print(f'{"app":24s} {"decl?":>6s} {"subs":>6s} {"left":>6s}  detail')
    for name in args.apps:
        r = process_one(ROOT / name, args.dry_run)
        if "skip" in r:
            print(f'  {name:22s} SKIP {r["skip"]}')
            continue
        total_subs = sum(r["substitutions"].values())
        if r["changed"]:
            any_changed = True
        decl = "yes" if r["inserted_decl"] else "—"
        print(f'  {name:22s} {decl:>6s} {total_subs:>6d} {r["remaining_1_96"]:>6d}  {r["substitutions"]}')
    if args.dry_run:
        print('\n(dry-run — no files written)')
    elif any_changed:
        print('\nDone — re-run R-parity tests now.')
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
