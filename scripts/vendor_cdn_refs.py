#!/usr/bin/env python
"""Repoint hard external CDN <script src> / document.write refs to the local
shared/vendor/ copies (already present, versions matched), so the Pairwiseai /
dosehtml / nma-dose-response-app apps work fully offline (allmeta core contract).

Idempotent: only CDN URLs are matched; once a file is local it has no CDN URL to
match. Frozen snapshots (_archive/, *.backup-*) are excluded. Dry-run by default.

Usage:
  python scripts/vendor_cdn_refs.py            # dry-run, prints planned edits
  python scripts/vendor_cdn_refs.py --apply    # write changes
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_DIRS = ["Pairwiseai", "dosehtml", "nma-dose-response-app"]

# Exact CDN URL -> local vendor filename (under shared/vendor/). Versions verified
# to match the vendored copies on disk.
URL_TO_LOCAL = {
    "https://cdn.plot.ly/plotly-2.27.0.min.js": "plotly-2.27.0.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.27.0/plotly.min.js": "plotly-2.27.0.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": "xlsx-0.18.5.full.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js": "jspdf-2.5.1.umd.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js": "html2canvas-1.4.1.min.js",
    "https://cdn.jsdelivr.net/npm/docx@7.1.0/build/index.js": "docx-7.1.0.js",
    "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js": "chart-4.4.1.umd.min.js",
    # jsdelivr fallback variants (same versions, used in document.write fallback chains)
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js": "html2canvas-1.4.1.min.js",
    "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js": "jspdf-2.5.1.umd.min.js",
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js": "xlsx-0.18.5.full.min.js",
}


def is_frozen(p: Path) -> bool:
    parts = p.parts
    return "_archive" in parts or "archive" in parts or ".backup-" in p.name


def vendor_prefix(html: Path) -> str:
    """Relative path from the file's directory up to repo root, + shared/vendor/."""
    rel_dir = html.parent.relative_to(ROOT)
    depth = len(rel_dir.parts)
    return "../" * depth + "shared/vendor/"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    args = ap.parse_args()

    # Sanity: every local target must exist.
    missing = [v for v in set(URL_TO_LOCAL.values()) if not (ROOT / "shared" / "vendor" / v).is_file()]
    if missing:
        print(f"ABORT: missing vendor files: {missing}", file=sys.stderr)
        return 2

    total_files = total_edits = 0
    for d in TARGET_DIRS:
        for html in sorted((ROOT / d).rglob("*.html")):
            if is_frozen(html):
                continue
            text = html.read_text(encoding="utf-8")
            if not any(u in text for u in URL_TO_LOCAL):
                continue
            prefix = vendor_prefix(html)
            new = text
            per_file = 0
            for url, local in URL_TO_LOCAL.items():
                n = new.count(url)
                if n:
                    new = new.replace(url, prefix + local)
                    per_file += n
            if per_file and new != text:
                total_files += 1
                total_edits += per_file
                rel = html.relative_to(ROOT)
                print(f"  {'EDIT' if args.apply else 'WOULD EDIT'} {rel}  ({per_file} refs, prefix={prefix})")
                if args.apply:
                    html.write_text(new, encoding="utf-8")

    print(f"\n{'Applied' if args.apply else 'Dry-run'}: {total_edits} refs across {total_files} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
