"""Wire the ma-studies-v1 helper into every numerical-engine app that
doesn't yet load it. Idempotent: skips files already containing the include.

This is part of moat-completion task C-2 (2026-05-24). For apps whose data
shape matches the bus contract (`label, est, se`-style textarea), the
companion patch adds Load-from-bus and Save-to-bus buttons + handlers — that
is per-app and lives in each index.html directly.

Usage:
    python scripts/add_ma_studies_bus.py [--dry-run]
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

# Apps that should participate in the cross-tool bus but don't yet load the helper.
HOLDOUT_APPS = [
    "influence",
    "gosh", "gosh-metareg",
    "pet-peese", "pubbias-tests",
    "proportion-ma", "multilevel-ma",
    "mh-peto", "limit-ma",
    "copas", "bucher",
    "bayesian-nma", "bayesian-mcmc",
    "p-curve", "powerma",
    "median-to-mean", "effect-size-converter",
    "dta-sroc", "hsroc",
    "mcid", "nma",
    "component-nma",
    "nma-dose-response-app",
    "nma-global-inconsistency", "nma-inconsistency",
    "nma-pro-v2",
]

INCLUDE_LINE = '  <script src="../shared/ma-studies-v1.js"></script>\n'


def patch(html: str) -> tuple[str, bool]:
    """Insert the helper include immediately before </head>. Returns
    (new_html, changed)."""
    if "shared/ma-studies-v1.js" in html:
        return html, False
    needle = "</head>"
    if needle not in html:
        return html, False
    return html.replace(needle, INCLUDE_LINE + needle, 1), True


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace") if hasattr(sys.stdout, "buffer") else sys.stdout
    root = Path(__file__).resolve().parent.parent
    changed = 0
    skipped = 0
    missing = 0
    for app in HOLDOUT_APPS:
        idx = root / app / "index.html"
        if not idx.is_file():
            print(f"MISSING: {app}/index.html")
            missing += 1
            continue
        original = idx.read_text(encoding="utf-8")
        patched, did = patch(original)
        if not did:
            print(f"SKIP (already wired or no </head>): {app}")
            skipped += 1
            continue
        if args.dry_run:
            print(f"WOULD WIRE: {app}")
        else:
            idx.write_text(patched, encoding="utf-8")
            print(f"WIRED: {app}")
        changed += 1
    print(f"\nSummary: wired={changed} skipped={skipped} missing={missing}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
