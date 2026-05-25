"""Inject `<script src="../shared/build-info.js"></script>` immediately before
ma-studies-v1.js in every app that includes ma-studies, so AlmBuildInfo is
defined before MaStudies.toTruthCert is called.

Idempotent: any file already including build-info.js is left alone.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MARKER = '<script src="../shared/ma-studies-v1.js">'
NEW = '<script src="../shared/build-info.js"></script>\n  <script src="../shared/ma-studies-v1.js">'


def patch(html: str) -> tuple[str, str]:
    if "shared/build-info.js" in html:
        return html, "already"
    if MARKER not in html:
        return html, "no-ma-studies"
    html = html.replace(MARKER, NEW, 1)
    return html, "wired"


def main() -> int:
    wired = 0
    skipped = 0
    for html_path in ROOT.rglob("index.html"):
        if any(part.startswith(".") or part in {"node_modules", "test-results", "artifacts"}
               for part in html_path.parts):
            continue
        original = html_path.read_text(encoding="utf-8")
        if "ma-studies-v1.js" not in original:
            continue
        new_html, status = patch(original)
        rel = html_path.relative_to(ROOT)
        if status == "wired":
            html_path.write_text(new_html, encoding="utf-8")
            print(f"WIRED: {rel}")
            wired += 1
        elif status == "already":
            print(f"SKIP (already wired): {rel}")
            skipped += 1
        else:
            print(f"OTHER ({status}): {rel}")
    print(f"\nSummary: wired={wired} already={skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
