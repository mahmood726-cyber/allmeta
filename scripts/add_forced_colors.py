#!/usr/bin/env python
"""Inject `shared/forced-colors.css` into every app's <head> for Windows High
Contrast / forced-colors support (WCAG 1.4.1, 1.4.11, V9-A11Y-11).

Per-app pattern: each `index.html` is a self-contained HTML+JS+CSS bundle in
its own subdirectory. We add a `<link rel="stylesheet" href="…/shared/forced-colors.css">`
right after the CSP meta tag (so the policy still gates it) and before any
<style>/<link> the app already ships.

Idempotent: skips files that already reference `shared/forced-colors.css`.
Mirrors the layout of scripts/add_csp.py.

Excludes node_modules, coverage, playwright artifacts, backup folders, the
hub itself (/hub/index.html doesn't exist; root /index.html already has
forced-colors inline via hub/styles.css), and the r-shiny shinylive runtime
dumps (their HTML is generated, not authored).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED_REL = "shared/forced-colors.css"

EXCLUDE_PARTS = {
    "node_modules", "coverage", "artifacts", "html-report", "__pycache__",
    "shinylive",  # generated runtime, not authored
    ".git",
}
EXCLUDE_PATH_RE = re.compile(r"(backup|backup_\d+|lcov-report)", re.I)

# We add forced-colors to *every* HTML file that has a <head>, not just
# index.html — many apps ship multiple HTML entries (e.g. nma-pro-v8.0.html,
# dose-response-pro.html, living-meta-complete.html) that need the same
# accessibility treatment.
INCLUDE_GLOBS = ("**/*.html",)

# Don't touch the hub front door — its styles.css already inlines the rules.
EXCLUDE_PATHS = {Path("index.html")}


CSP_META_RE = re.compile(
    r'<meta\s+http-equiv=["\']Content-Security-Policy["\'][^>]*>',
    re.I,
)
HEAD_OPEN_RE = re.compile(r"<head\b[^>]*>", re.I)
EXISTING_RE = re.compile(r'href=["\'][^"\']*shared/forced-colors\.css["\']', re.I)


def pick_targets() -> list[Path]:
    out: list[Path] = []
    seen: set[Path] = set()
    for pattern in INCLUDE_GLOBS:
        for p in ROOT.glob(pattern):
            if not p.is_file():
                continue
            rel = p.relative_to(ROOT)
            if rel in EXCLUDE_PATHS:
                continue
            parts = set(rel.parts)
            if parts & EXCLUDE_PARTS:
                continue
            if EXCLUDE_PATH_RE.search(str(rel)):
                continue
            # Only files under the shared/, tests/, courses/ etc. that we want
            # to skip — keep app-folder files. Reject anything in /shared/ or
            # /tests/ itself.
            top = rel.parts[0] if rel.parts else ""
            if top in {"shared", "tests", "audit", "triage", "scripts", "docs", ".github"}:
                continue
            if p not in seen:
                seen.add(p)
                out.append(p)
    return sorted(out)


def relative_link(path: Path) -> str:
    """Compute the relative path from `path`'s directory to ROOT/shared/forced-colors.css."""
    depth = len(path.relative_to(ROOT).parts) - 1  # parts beyond the file itself
    prefix = "../" * depth if depth > 0 else "./"
    return f"{prefix}{SHARED_REL}"


def insert_link(path: Path) -> str | None:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return "skip-non-utf8"
    if EXISTING_RE.search(text):
        return None  # already linked
    head_match = HEAD_OPEN_RE.search(text)
    if not head_match:
        return "skip-no-head"
    link_href = relative_link(path)
    link_tag = f'<link rel="stylesheet" href="{link_href}">'

    # Prefer to insert right after the CSP meta tag if present, otherwise
    # right after <head>.
    csp = CSP_META_RE.search(text)
    if csp:
        # find newline + indent after csp tag
        end = csp.end()
        # snap to start of the line after the CSP for indent detection
        line_start = text.rfind("\n", 0, csp.start()) + 1
        indent = text[line_start:csp.start()]
        new = text[:end] + "\n" + indent + link_tag + text[end:]
    else:
        end = head_match.end()
        new = text[:end] + "\n  " + link_tag + text[end:]
    path.write_text(new, encoding="utf-8")
    return "ok"


def main() -> int:
    files = pick_targets()
    print(f"[fc] scanning {len(files)} HTML files under {ROOT}")
    added = skipped = errors = 0
    for p in files:
        try:
            status = insert_link(p)
        except Exception as e:  # pragma: no cover - defensive
            errors += 1
            print(f"  ERROR {p.relative_to(ROOT)}: {e}")
            continue
        if status is None:
            skipped += 1
        elif status == "ok":
            added += 1
            print(f"  + {p.relative_to(ROOT)}")
        else:
            skipped += 1
            print(f"  ? {p.relative_to(ROOT)}: {status}")
    print(f"[fc] done: +{added} added, {skipped} skipped, {errors} errors")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
