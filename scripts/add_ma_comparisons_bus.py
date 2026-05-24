"""Wire the ma-comparisons-v1 helper into every NMA-shape app.

Companion to scripts/add_ma_studies_bus.py — that one handles single-arm
pairwise apps (ma-studies-v1 bus); this one handles multi-arm contrast
apps (ma-comparisons-v1 bus). Idempotent.

Usage:
    python scripts/add_ma_comparisons_bus.py [--dry-run]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Apps that speak multi-arm contrast data and should expose
# window.MaComparisons. Same-origin path: ../shared/ma-comparisons-v1.js
APPS = [
    "nma",
    "nma-pro-v2",
    "bayesian-nma",
    "component-nma",
    "nma-inconsistency",
    "nma-global-inconsistency",
    "nma-dose-response-app",
    "bucher",
    "mh-peto",
]

INCLUDE_LINE = '  <script src="../shared/ma-comparisons-v1.js"></script>\n'


def patch_file(p: Path) -> bool:
    text = p.read_text(encoding="utf-8")
    if "shared/ma-comparisons-v1.js" in text:
        return False
    if "</head>" not in text:
        return False
    new = text.replace("</head>", INCLUDE_LINE + "</head>", 1)
    p.write_text(new, encoding="utf-8")
    return True


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    root = Path(__file__).resolve().parent.parent
    wired = 0
    for app in APPS:
        # primary entry point
        idx = root / app / "index.html"
        # nma-pro-v2 has the monolith too
        candidates = [idx]
        if app == "nma-pro-v2":
            candidates.append(root / app / "nma-pro-v8.0.html")
        for path in candidates:
            if not path.is_file():
                print(f"MISSING: {path.relative_to(root)}")
                continue
            if "shared/ma-comparisons-v1.js" in path.read_text(encoding="utf-8"):
                print(f"SKIP: {path.relative_to(root)}")
                continue
            if args.dry_run:
                print(f"WOULD WIRE: {path.relative_to(root)}")
            else:
                if patch_file(path):
                    print(f"WIRED: {path.relative_to(root)}")
                    wired += 1
                else:
                    print(f"NO-OP: {path.relative_to(root)}")
    print(f"\nSummary: wired={wired}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
