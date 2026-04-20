"""trim_audit.py — compute transitive asset closure of an HTML entry point.

Usage:
    python trim_audit.py --src "C:/HTML apps/Truthcert1" --entry "index.html"
    python trim_audit.py --src "C:/HTML apps/Truthcert1" --entry "index.html" --apply --dst "C:/Projects/allmeta/Truthcert1"

Walks from the entry HTML, follows src=, href=, import from, fetch("...") references
(two levels deep), returns the set of files needed. Prints a summary table with sizes.
With --apply, copies ONLY those files into --dst (preserving relative structure).
Anything not in the closure is written to stdout as 'EXCLUDED: <path>'.
"""
from __future__ import annotations
import argparse, re, shutil, sys
from pathlib import Path

ASSET_PATTERNS = [
    re.compile(r'''src\s*=\s*["']([^"'#?]+)'''),
    re.compile(r'''href\s*=\s*["']([^"'#?]+)'''),
    re.compile(r'''import\s+[^"']*["']([^"'#?]+)'''),
    re.compile(r'''import\s*\(\s*["']([^"'#?]+)'''),
    re.compile(r'''fetch\s*\(\s*["']([^"'#?]+)'''),
    re.compile(r'''url\s*\(\s*["']?([^"')#?]+)'''),
]

TEXT_SUFFIXES = {".html", ".htm", ".js", ".mjs", ".css", ".json", ".svg"}


def closure(src_root: Path, entry: Path, max_depth: int = 3) -> set[Path]:
    seen: set[Path] = set()
    frontier: list[tuple[Path, int]] = [(entry, 0)]
    while frontier:
        file, depth = frontier.pop()
        if file in seen or not file.exists() or depth > max_depth:
            continue
        seen.add(file)
        if file.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            text = file.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        for pat in ASSET_PATTERNS:
            for m in pat.finditer(text):
                ref = m.group(1)
                if ref.startswith(("http://", "https://", "//", "data:", "mailto:")):
                    continue
                candidate = (file.parent / ref).resolve()
                try:
                    candidate.relative_to(src_root.resolve())
                except ValueError:
                    continue
                frontier.append((candidate, depth + 1))
    return seen


def human(n: int) -> str:
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{u}"
        n /= 1024
    return f"{n:.1f}TB"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--entry", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--dst", default=None)
    args = ap.parse_args()

    src_root = Path(args.src)
    entry = src_root / args.entry
    if not entry.exists():
        print(f"ERROR: entry not found: {entry}", file=sys.stderr)
        return 2

    kept = closure(src_root, entry)
    all_files = {p for p in src_root.rglob("*") if p.is_file()}
    excluded = all_files - kept

    kept_bytes = sum(p.stat().st_size for p in kept if p.is_file())
    excluded_bytes = sum(p.stat().st_size for p in excluded)

    print(f"SOURCE:   {src_root} ({human(kept_bytes + excluded_bytes)} total, {len(all_files)} files)")
    print(f"KEPT:     {len(kept)} files ({human(kept_bytes)})")
    print(f"EXCLUDED: {len(excluded)} files ({human(excluded_bytes)})")
    print()
    if not args.apply:
        for p in sorted(excluded):
            print(f"EXCLUDED: {p.relative_to(src_root)}")
        return 0

    if not args.dst:
        print("ERROR: --apply requires --dst", file=sys.stderr)
        return 2
    dst_root = Path(args.dst)
    dst_root.mkdir(parents=True, exist_ok=True)
    for p in sorted(kept):
        if not p.is_file():
            continue
        rel = p.relative_to(src_root)
        out = dst_root / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, out)
    print(f"COPIED {len(kept)} files to {dst_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
