"""One-shot codemod: inject a `← allmeta` back-link partial into every
inner-app `index.html` so users aren't stranded after clicking "Open App".

Idempotent: skips files that already contain the marker `id="hub-back"`.
Inserts a self-styled fixed-position anchor right after the opening
`<body...>` tag. The marker is also a Sentinel-friendly id so the codemod
detects its own prior runs.

Run from repo root:
    python scripts/inject_hub_back_link.py [--dry-run]

Targets every `*/index.html` exactly one level deep under the repo root,
skipping the hub itself and known non-app directories.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Skip these top-level directories — they are infra, docs, tests, archives,
# the hub itself, or non-app fixtures.
SKIP_DIRS = {
    ".git", ".github", ".pytest_cache", "_site",
    "docs", "hub", "node_modules", "scripts", "tests",
}

MARKER_ID = 'id="hub-back"'

# The injected partial. Inline styles + ARIA so the partial is self-sufficient
# regardless of the host app's CSS.
PARTIAL = '''<a id="hub-back" href="../" aria-label="Back to allmeta hub" \
style="position:fixed;top:12px;left:12px;z-index:99999;\
padding:6px 12px;background:rgba(28,31,35,0.85);color:#fff;\
text-decoration:none;border-radius:14px;font:600 12px/1 system-ui,sans-serif;\
letter-spacing:.04em;box-shadow:0 2px 8px rgba(0,0,0,0.18);\
transition:opacity .15s ease;opacity:.85" \
onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.85'">\
← allmeta</a>'''

# Capture <body...> opening tag (single-line or with attributes).
BODY_OPEN_RE = re.compile(r"(<body\b[^>]*>)", re.IGNORECASE)


def find_targets() -> list[Path]:
    targets: list[Path] = []
    for child in sorted(ROOT.iterdir()):
        if not child.is_dir():
            continue
        if child.name in SKIP_DIRS or child.name.startswith("."):
            continue
        # Only top-level index.html — not nested e156-submission/, dev/, etc.
        idx = child / "index.html"
        if idx.is_file():
            targets.append(idx)
    return targets


def inject(path: Path) -> tuple[bool, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return False, "non-utf8 (skipped)"

    if MARKER_ID in text:
        return False, "already has hub-back link"

    match = BODY_OPEN_RE.search(text)
    if not match:
        return False, "no <body> tag found"

    insertion_point = match.end()
    new_text = text[:insertion_point] + "\n" + PARTIAL + text[insertion_point:]
    path.write_text(new_text, encoding="utf-8")
    return True, "injected"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report only, do not write")
    args = ap.parse_args()

    targets = find_targets()
    print(f"Found {len(targets)} candidate inner-app index.html files.\n")

    injected = 0
    skipped = 0
    failed = 0
    for path in targets:
        rel = path.relative_to(ROOT)
        if args.dry_run:
            text = path.read_text(encoding="utf-8", errors="replace")
            if MARKER_ID in text:
                print(f"  SKIP   {rel} (already has hub-back link)")
                skipped += 1
            elif not BODY_OPEN_RE.search(text):
                print(f"  FAIL   {rel} (no <body>)")
                failed += 1
            else:
                print(f"  WOULD  {rel}")
                injected += 1
        else:
            did, msg = inject(path)
            tag = "OK    " if did else "SKIP  "
            print(f"  {tag} {rel}: {msg}")
            if did:
                injected += 1
            elif "already" in msg:
                skipped += 1
            else:
                failed += 1

    print(f"\n{'Would inject' if args.dry_run else 'Injected'}: {injected}, "
          f"already-present: {skipped}, failed: {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
