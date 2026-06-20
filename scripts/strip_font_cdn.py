#!/usr/bin/env python
"""Strip external Google Fonts <link> tags (stylesheet + preconnect + dns-prefetch)
from live allmeta app files so they are fully offline. The font-family stacks all
carry generic fallbacks (e.g. 'Plus Jakarta Sans',...,sans-serif /
'JetBrains Mono',...,monospace), so removing the webfont link degrades gracefully
to system fonts — no downloads, no broken typography, and no CSP connect-src hit.

Idempotent (no font link -> nothing to remove). Frozen _archive/, archive/, and
*.backup-* files are excluded. Dry-run by default.

Usage:
  python scripts/strip_font_cdn.py            # dry-run
  python scripts/strip_font_cdn.py --apply    # write changes
"""
from __future__ import annotations
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# A <link ...> tag (single line) that references a Google Fonts host. Eats the
# surrounding horizontal whitespace and a trailing newline so no blank line is left.
LINK_RE = re.compile(
    r"[ \t]*<link\b[^>]*?(?:fonts\.googleapis|fonts\.gstatic)[^>]*?>[ \t]*\n?",
    re.IGNORECASE,
)


def is_frozen(p: Path) -> bool:
    return "_archive" in p.parts or "archive" in p.parts or ".backup-" in p.name


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    args = ap.parse_args()

    total_files = total_links = 0
    for html in sorted(ROOT.rglob("*.html")):
        if is_frozen(html) or "node_modules" in html.parts:
            continue
        text = html.read_text(encoding="utf-8")
        if "fonts.googleapis" not in text and "fonts.gstatic" not in text:
            continue
        new, n = LINK_RE.subn("", text)
        if n and new != text:
            total_files += 1
            total_links += n
            print(f"  {'STRIP' if args.apply else 'WOULD STRIP'} {html.relative_to(ROOT)}  ({n} link tags)")
            if args.apply:
                html.write_text(new, encoding="utf-8")

    print(f"\n{'Applied' if args.apply else 'Dry-run'}: {total_links} font links across {total_files} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
