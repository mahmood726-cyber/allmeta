#!/usr/bin/env python
"""Insert Content-Security-Policy meta tags across all allmeta app pages.

Scans each index.html, detects which external origins it uses, and builds a
tight CSP that allows exactly those origins. Idempotent: skips files that
already carry a CSP meta tag.

Excludes node_modules, coverage, playwright artifacts, and the backup_* / backup folders.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EXCLUDE_PARTS = {"node_modules", "coverage", "artifacts", "html-report", "__pycache__"}
EXCLUDE_PATH_RE = re.compile(r"(backup|backup_\d+|lcov-report)", re.I)

# origin -> which CSP directive it belongs in
ORIGINS = {
    "https://cdn.jsdelivr.net":         ("script-src", "style-src"),
    "https://cdnjs.cloudflare.com":     ("script-src",),
    "https://fonts.googleapis.com":     ("style-src",),
    "https://fonts.gstatic.com":        ("font-src",),
    "https://webr.r-wasm.org":          ("script-src", "connect-src"),
    "https://repo.r-wasm.org":          ("connect-src",),
    "https://docs.r-wasm.org":          ("connect-src",),
    "https://cloud.r-project.org":      ("connect-src",),
    "https://cran.r-project.org":       ("connect-src",),
    "https://stan-dev.r-universe.dev":  ("connect-src",),
    "https://api.openalex.org":         ("connect-src",),
    "https://openalex.org":             ("connect-src",),
    "https://api.github.com":           ("connect-src",),
    "https://raw.githubusercontent.com":("connect-src",),
    "https://doi.org":                  ("connect-src",),
    "https://zenodo.org":               ("connect-src",),
    "https://clinicaltrials.gov":       ("connect-src",),
    "https://www.clinicaltrials.gov":   ("connect-src",),
    "https://www.clinicaltrialsregister.eu": ("connect-src",),
    "https://www.isrctn.com":           ("connect-src",),
    "https://posit.co":                 ("connect-src",),
    "https://quarto.org":               ("connect-src",),
    "https://sourceforge.net":          ("connect-src",),
    "https://ollama.com":               (),  # link target only, not fetched
    "https://mahmood726-cyber.github.io": (), # link target, not fetched
    "https://github.com":               (), # link target, not fetched
}

LOOPBACK = ("http://127.0.0.1:*", "http://localhost:*")


def pick_target_files() -> list[Path]:
    """Find index.html files that are real apps (not vendor/artifact dumps)."""
    out = []
    for p in ROOT.rglob("index.html"):
        rel = p.relative_to(ROOT)
        parts = set(rel.parts)
        if parts & EXCLUDE_PARTS:
            continue
        if EXCLUDE_PATH_RE.search(str(rel)):
            continue
        out.append(p)
    return sorted(out)


_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)


_CSP_META_SCAN_RE = re.compile(
    r'<meta\s+http-equiv=["\']Content-Security-Policy["\'][^>]*>',
    re.I,
)


def _strip_html_comments(text: str) -> str:
    """Drop HTML comments so URLs documented in comments don't widen the CSP."""
    return _COMMENT_RE.sub("", text)


def _strip_existing_csp(text: str) -> str:
    """Drop any existing CSP meta tag before origin scanning, so origins listed INSIDE the
    policy (e.g. a previously-added CDN that's since been removed from code) don't
    re-resurrect themselves on every rerun."""
    return _CSP_META_SCAN_RE.sub("", text)


def _active_text(text: str) -> str:
    return _strip_existing_csp(_strip_html_comments(text))


def extract_origins(text: str) -> set[str]:
    # Comment-blind detection would let `<!-- see https://api.openalex.org -->` land in
    # connect-src even though the code never fetches it. Existing-CSP-blind detection
    # would make a previously-added origin sticky even after the code stopped using it.
    active = _active_text(text)
    hits = set()
    for origin in ORIGINS:
        if origin in active:
            hits.add(origin)
    return hits


def uses_loopback(text: str) -> bool:
    # Any app that fetches a local service — detected by imports of localllm.js
    # or explicit 127.0.0.1/localhost URLs outside HTML comments.
    active = _active_text(text)
    if "localllm.js" in active:
        return True
    # explicit http://127.0.0.1 or http://localhost used in code (not just comments)
    return bool(re.search(r"""(['"`])http://(?:127\.0\.0\.1|localhost)""", active))


def build_csp(origins: set[str], needs_loopback: bool) -> str:
    # Explicit directives for every fetch surface — don't rely on default-src fall-through
    # so a future addition to default-src won't silently widen these.
    buckets: dict[str, list[str]] = {
        "default-src":  ["'self'"],
        "base-uri":     ["'self'"],
        "object-src":   ["'none'"],
        "frame-src":    ["'none'"],
        "frame-ancestors": ["'none'"],
        "form-action":  ["'self'"],
        "script-src":   ["'self'", "'unsafe-inline'"],
        "style-src":    ["'self'", "'unsafe-inline'"],
        "img-src":      ["'self'", "data:", "blob:"],
        "font-src":     ["'self'", "data:"],
        "connect-src":  ["'self'"],
        "worker-src":   ["'self'", "blob:"],
        "media-src":    ["'self'", "blob:"],
        "manifest-src": ["'self'"],
    }
    for o in origins:
        for directive in ORIGINS[o]:
            if o not in buckets[directive]:
                buckets[directive].append(o)
    if needs_loopback:
        for o in LOOPBACK:
            if o not in buckets["connect-src"]:
                buckets["connect-src"].append(o)
    # WebR uses eval in WASM; add 'wasm-unsafe-eval' when webr detected.
    if "https://webr.r-wasm.org" in origins:
        buckets["script-src"].append("'wasm-unsafe-eval'")
    parts = []
    for k in ("default-src","base-uri","object-src","frame-src","frame-ancestors","form-action",
              "script-src","style-src","img-src","font-src","connect-src","worker-src",
              "media-src","manifest-src"):
        parts.append(f"{k} {' '.join(buckets[k])}")
    return "; ".join(parts)


VIEWPORT_RE = re.compile(
    r'(<meta[^>]*name=["\']viewport["\'][^>]*>)',
    re.I,
)


CSP_META_RE = re.compile(
    r'<meta\s+http-equiv=["\']Content-Security-Policy["\'][^>]*>',
    re.I,
)


def insert_csp(path: Path, force: bool = False) -> str | None:
    text = path.read_text(encoding="utf-8")
    origins = extract_origins(text)
    loopback = uses_loopback(text)
    csp = build_csp(origins, loopback)
    meta = f'<meta http-equiv="Content-Security-Policy" content="{csp}">'

    existing = CSP_META_RE.search(text)
    if existing:
        # If existing matches intended output, no-op.
        if existing.group(0) == meta:
            return None
        if not force:
            return "has-old-csp"
        # Replace the existing CSP meta with the new one (force mode)
        new = text[:existing.start()] + meta + text[existing.end():]
        path.write_text(new, encoding="utf-8")
        return "updated"

    m = VIEWPORT_RE.search(text)
    if not m:
        return "skip-no-viewport"
    # insert on the line after viewport, matching its indentation
    start = text.rfind("\n", 0, m.start()) + 1
    indent = text[start:m.start()]
    new = text[:m.end()] + "\n" + indent + meta + text[m.end():]
    path.write_text(new, encoding="utf-8")
    return "ok"


_URL_RE = re.compile(r"https?://[a-zA-Z0-9.-]+")


def scan_unknown_origins(files: list[Path]) -> dict[str, list[Path]]:
    """Find `https://...` URLs in scanned HTML that aren't in the ORIGINS table.

    Helps catch drift: a new CDN silently added in HTML that CSP won't allow.
    Returns {origin: [paths]}.

    Skips non-fetched references: SVG XML namespace, loopback (handled separately),
    and URLs inside <!-- comments --> (stripped before scan).
    """
    IGNORE = {
        "http://www.w3.org",       # SVG namespace declaration, not fetched
        "http://127.0.0.1",        # loopback — handled by uses_loopback()
        "http://localhost",
    }
    unknowns: dict[str, list[Path]] = {}
    for p in files:
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        active = _active_text(text)
        for m in _URL_RE.finditer(active):
            origin = m.group(0).rstrip(".,;:)")
            if origin in ORIGINS or origin in IGNORE:
                continue
            unknowns.setdefault(origin, []).append(p)
    return unknowns


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Replace existing CSP meta tags (default: skip files that already have one)")
    args = ap.parse_args()

    files = pick_target_files()
    print(f"[csp] scanning {len(files)} index.html files under {ROOT} (force={args.force})")
    added = updated = skipped = errors = 0
    for p in files:
        try:
            status = insert_csp(p, force=args.force)
        except Exception as e:
            errors += 1
            print(f"  ERROR {p.relative_to(ROOT)}: {e}")
            continue
        if status is None:
            skipped += 1
        elif status == "ok":
            added += 1
            print(f"  + {p.relative_to(ROOT)}")
        elif status == "updated":
            updated += 1
            print(f"  ~ {p.relative_to(ROOT)}")
        else:
            skipped += 1
            print(f"  ? {p.relative_to(ROOT)}: {status}")
    print(f"[csp] done: +{added} added, ~{updated} updated, {skipped} skipped, {errors} errors")

    unknowns = scan_unknown_origins(files)
    if unknowns:
        # ASCII-only output: Windows cp1252 console can't encode smart arrows.
        print(f"\n[csp] {len(unknowns)} origin(s) found in HTML but not in ORIGINS table -- CSP may block them:")
        for origin, paths in sorted(unknowns.items()):
            example = paths[0].relative_to(ROOT)
            extra = f" (+{len(paths) - 1} more)" if len(paths) > 1 else ""
            print(f"  {origin}  -> {example}{extra}")
        print("  If the app legitimately uses these, add them to ORIGINS with the right directives.")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
