#!/usr/bin/env python
"""Sentinel-equivalent pre-merge lint for allmeta's shipped browser assets.

Encodes the repo's shipped-asset invariants (AGENTS.md "HTML apps" rules +
lessons.md): no external CDN resource loads, no hardcoded local paths, no BOM,
no unpopulated template placeholders, and balanced <div> nesting. Runs over
every catalog app's index.html (and shared JS/CSS), fails closed (exit 1) on
any violation with file:line, so it can gate a PR.

Usage:
  python scripts/lint_repo.py            # lint catalog apps + shared assets
  python scripts/lint_repo.py --report   # list findings, exit 0 (triage mode)

Scope: catalog entry points (from hub/projects.js) + authored shared/ JS/CSS,
excluding vendored libraries (shared/vendor/, r-shiny/shinylive/) and
non-catalog variant HTML.

Note on div balance: NOT checked here. Counting <div> vs </div> is confounded
by JS strings/regex (per AGENTS.md it stays a *manual* post-edit check), so it
is too false-positive-prone to gate a PR. This lint covers only the
unambiguous, high-signal invariants.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Dirs never linted (vendored third-party, deps, VCS, build caches, tests).
EXCLUDE_DIRS = {
    "node_modules", ".git", ".github", "__pycache__", ".pytest_cache",
    "vendor", "tests", "test-results", "playwright-report", "courses",
}
# A resource load to an external origin (CDN). <a href> navigation is fine;
# only <script src> and <link href> pull executable/style resources.
CDN_SCRIPT = re.compile(r"""<script\b[^>]*\bsrc\s*=\s*["']https?://""", re.I)
CDN_LINK = re.compile(r"""<link\b[^>]*\bhref\s*=\s*["']https?://""", re.I)
# Hardcoded local filesystem paths that must never ship.
LOCAL_PATH = re.compile(r"""[A-Za-z]:[\\/]Users[\\/]|/home/[a-z]|/Users/[A-Za-z]""")
# Unpopulated template tokens.
PLACEHOLDER = re.compile(r"\{\{[^}]*\}\}|REPLACE_ME|__PLACEHOLDER__|\bTODO_FILL\b")
SCRIPT_OR_STYLE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.I | re.S)

# Accepted baseline (Sentinel-style allowlist): findings here are known and
# tolerated, so the gate blocks only NEW violations. Each entry is
# (relpath, rule-substring, reason). Keep this list shrinking, not growing.
# Currently EMPTY — focus-studio / kanban-lab fonts were vendored to
# shared/fonts/ (2026-06-03), so every catalog app is genuinely CDN-free.
ALLOWLIST = []


def is_allowlisted(finding: str) -> bool:
    for rel, rule, _reason in ALLOWLIST:
        if finding.startswith(rel) and rule in finding:
            return True
    return False


def line_of(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1


def strip_script_style(html: str) -> str:
    # Replace <script>/<style> bodies with blank lines (preserve line numbers)
    # so div-balance + placeholder checks ignore JS strings / regex / CSS.
    def blank(m: re.Match) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))
    return SCRIPT_OR_STYLE.sub(blank, html)


def lint_file(path: Path) -> list[str]:
    findings: list[str] = []
    raw = path.read_bytes()
    rel = path.relative_to(ROOT).as_posix()
    if raw[:3] == b"\xef\xbb\xbf":
        findings.append(f"{rel}:1  BOM at start of shipped asset")
    text = raw.decode("utf-8", errors="replace")
    is_html = path.suffix == ".html"

    for rx, label in ((CDN_SCRIPT, "external CDN <script src>"),
                      (CDN_LINK, "external CDN <link href>")):
        if is_html:
            for m in rx.finditer(text):
                findings.append(f"{rel}:{line_of(text, m.start())}  {label}: {m.group(0)[:60]}")

    for m in LOCAL_PATH.finditer(text):
        findings.append(f"{rel}:{line_of(text, m.start())}  hardcoded local path: {m.group(0)}")

    scan = strip_script_style(text) if is_html else text
    for m in PLACEHOLDER.finditer(scan):
        findings.append(f"{rel}:{line_of(scan, m.start())}  unpopulated placeholder: {m.group(0)[:40]}")

    return findings


def catalog_entry_files() -> list[Path]:
    """Resolve every catalog app's entry point from hub/projects.js `path:`
    fields. A path ending in "/" implies index.html. These are the files
    actually served to users — the shipped surface the invariants protect.
    Vendored runtimes (r-shiny/shinylive, *.bundle) and non-catalog variant
    HTML are intentionally out of scope (third-party / not user-facing)."""
    proj = (ROOT / "hub" / "projects.js").read_text(encoding="utf-8", errors="replace")
    out: list[Path] = []
    for m in re.finditer(r'path:\s*"\./([^"]+)"', proj):
        rel = m.group(1)
        p = ROOT / rel
        if rel.endswith("/"):
            p = p / "index.html"
        if p.is_file():
            out.append(p)
    return out


def iter_assets():
    seen = set()
    # 1. Catalog entry points (the shipped, user-facing surface).
    for p in catalog_entry_files():
        if p not in seen:
            seen.add(p)
            yield p
    # 2. Authored shared modules/styles (loaded by many apps), minus vendored libs.
    for sub in ("shared", "hub/shared"):
        base = ROOT / sub
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            if p.is_dir() or p in seen:
                continue
            parts = p.relative_to(ROOT).parts
            if any(part in EXCLUDE_DIRS for part in parts):
                continue
            if p.suffix in (".js", ".css"):
                seen.add(p)
                yield p


def main() -> int:
    report = "--report" in sys.argv
    raw: list[str] = []
    n_files = 0
    for path in iter_assets():
        n_files += 1
        raw.extend(lint_file(path))
    gating = [f for f in raw if not is_allowlisted(f)]
    allowed = [f for f in raw if is_allowlisted(f)]

    if allowed:
        print(f"lint_repo: {len(allowed)} allowlisted finding(s) (accepted baseline):")
        for f in allowed:
            print("  ~ " + f)
        print()
    if gating:
        print(f"lint_repo: {len(gating)} NEW finding(s) across {n_files} assets:\n")
        for f in gating:
            print("  " + f)
        if report:
            print("\n(--report mode: exit 0)")
            return 0
        print(f"\nFAIL — {len(gating)} shipped-asset invariant violation(s). "
              "Fix, or (if genuinely accepted) add to ALLOWLIST in scripts/lint_repo.py.")
        return 1
    print(f"lint_repo: OK — {n_files} shipped assets clean "
          f"({len(allowed)} allowlisted).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
