"""verify_external_pages.py — check GitHub Pages status for the 5 external hub cards.

Usage: python scripts/verify_external_pages.py

Calls `gh api repos/mahmood726-cyber/<repo>/pages` for each candidate repo.
Prints a table of: repo, pages_enabled, built, html_url, final_link_for_hub.
"""
from __future__ import annotations
import json, subprocess, sys

CANDIDATES = [
    ("AdaptSim",        "../AdaptSim/index.html",                         ""),
    ("AlMizan",         "../AlMizan/index.html",                          ""),
    ("CardioOracle",    "../Models/CardioOracle/index.html",              ""),
    ("cardiosynth",     "../cardiosynth/phase0/colchicine-stemi.html",    "phase0/colchicine-stemi.html"),
    ("NICECardiology",  "../NICECardiology/index.html",                   ""),
]


def gh_pages(repo: str) -> dict | None:
    try:
        out = subprocess.run(
            ["gh", "api", f"repos/mahmood726-cyber/{repo}/pages"],
            capture_output=True, text=True, timeout=15,
        )
    except FileNotFoundError:
        print("ERROR: gh CLI not on PATH", file=sys.stderr)
        sys.exit(2)
    if out.returncode != 0:
        return None
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return None


def main() -> int:
    print(f"{'repo':<20} {'enabled':<8} {'status':<10} {'html_url'}")
    print("-" * 90)
    for repo, old_path, suffix in CANDIDATES:
        info = gh_pages(repo)
        if info is None:
            print(f"{repo:<20} {'no':<8} {'-':<10} (404 or auth failure — check)")
            continue
        status = info.get("status", "?")
        url = info.get("html_url", "")
        final = url.rstrip("/") + "/" + suffix if suffix else url
        print(f"{repo:<20} {'yes':<8} {status:<10} {final}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
