#!/usr/bin/env python
"""Idempotently add the shared a11y-landmarks.js <script> to every app.

Closes the portfolio-wide axe `region` violation. The risky logic lives in
hub/shared/a11y-landmarks.js (validated separately); this codemod only
inserts ONE identical, presence-checked line per app — the low-risk shape
prescribed by the codemod lessons.

Usage:
  python scripts/add_a11y_landmarks.py            # dry-run (default)
  python scripts/add_a11y_landmarks.py --apply    # write changes

Scans every <dir>/index.html under the repo root (no hardcoded app list),
skipping infra dirs. Inserts before the LAST </body>. Skips any file that
already references a11y-landmarks.js (idempotent). Reports added / skipped
(already-present) / no-body counts so the diff is reviewable.
"""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"hub", "shared", "tests", "scripts", "docs", "node_modules",
             "test-results", "local-install", "r-shiny"}
TAG = '<script src="../hub/shared/a11y-landmarks.js"></script>'
MARKER = "a11y-landmarks.js"


def main() -> int:
    apply = "--apply" in sys.argv
    added, present, nobody = [], [], []

    for idx in sorted(REPO.glob("*/index.html")):
        if idx.parent.name in SKIP_DIRS:
            continue
        app = idx.parent.name
        text = idx.read_text(encoding="utf-8", errors="replace")

        if MARKER in text:                       # idempotent guard
            present.append(app)
            continue

        pos = text.rfind("</body>")
        if pos == -1:
            nobody.append(app)
            continue

        nl = "\r\n" if "\r\n" in text else "\n"
        # Match the indentation of the </body> line for a clean diff.
        line_start = text.rfind("\n", 0, pos) + 1
        indent = text[line_start:pos]
        indent = indent if indent.strip() == "" else "  "
        insertion = f"{indent}{TAG}{nl}"
        new_text = text[:line_start] + insertion + text[line_start:]

        if apply:
            idx.write_text(new_text, encoding="utf-8")
        added.append(app)

    mode = "APPLIED" if apply else "DRY-RUN (no files written)"
    print(f"=== add_a11y_landmarks — {mode} ===")
    print(f"added ({len(added)}): {', '.join(added) or '-'}")
    print(f"already-present / skipped ({len(present)}): "
          f"{', '.join(present) or '-'}")
    if nobody:
        print(f"NO </body> ({len(nobody)}): {', '.join(nobody)}")
    print(f"total apps touched={len(added)} "
          f"unchanged={len(present)} problems={len(nobody)}")
    return 1 if nobody else 0


if __name__ == "__main__":
    raise SystemExit(main())
