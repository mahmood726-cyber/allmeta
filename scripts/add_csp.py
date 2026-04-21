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


def extract_origins(text: str) -> set[str]:
    hits = set()
    for origin in ORIGINS:
        if origin in text:
            hits.add(origin)
    return hits


def uses_loopback(text: str) -> bool:
    # Any app that fetches a local service — detected by imports of localllm.js
    # or explicit 127.0.0.1/localhost URLs outside HTML comments.
    if "localllm.js" in text:
        return True
    # explicit http://127.0.0.1 or http://localhost used in code (not just comments)
    return bool(re.search(r"""(['"`])http://(?:127\.0\.0\.1|localhost)""", text))


def build_csp(origins: set[str], needs_loopback: bool) -> str:
    buckets: dict[str, list[str]] = {
        "default-src":  ["'self'"],
        "base-uri":     ["'self'"],
        "object-src":   ["'none'"],
        "frame-ancestors": ["'none'"],
        "form-action":  ["'self'"],
        "script-src":   ["'self'", "'unsafe-inline'"],
        "style-src":    ["'self'", "'unsafe-inline'"],
        "img-src":      ["'self'", "data:", "blob:"],
        "font-src":     ["'self'", "data:"],
        "connect-src":  ["'self'"],
        "worker-src":   ["'self'", "blob:"],
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
    for k in ("default-src","base-uri","object-src","frame-ancestors","form-action",
              "script-src","style-src","img-src","font-src","connect-src","worker-src"):
        parts.append(f"{k} {' '.join(buckets[k])}")
    return "; ".join(parts)


VIEWPORT_RE = re.compile(
    r'(<meta[^>]*name=["\']viewport["\'][^>]*>)',
    re.I,
)


def insert_csp(path: Path) -> str | None:
    text = path.read_text(encoding="utf-8")
    if "Content-Security-Policy" in text:
        return None  # already has one
    origins = extract_origins(text)
    loopback = uses_loopback(text)
    csp = build_csp(origins, loopback)
    meta = f'<meta http-equiv="Content-Security-Policy" content="{csp}">'
    m = VIEWPORT_RE.search(text)
    if not m:
        return "skip-no-viewport"
    # insert on the line after viewport, matching its indentation
    # find start-of-line of viewport
    start = text.rfind("\n", 0, m.start()) + 1
    indent = text[start:m.start()]
    new = text[:m.end()] + "\n" + indent + meta + text[m.end():]
    path.write_text(new, encoding="utf-8")
    return "ok"


def main():
    files = pick_target_files()
    print(f"[csp] scanning {len(files)} index.html files under {ROOT}")
    added = skipped = errors = 0
    for p in files:
        try:
            status = insert_csp(p)
        except Exception as e:
            errors += 1
            print(f"  ERROR {p.relative_to(ROOT)}: {e}")
            continue
        if status is None:
            skipped += 1
        elif status == "ok":
            added += 1
            print(f"  + {p.relative_to(ROOT)}")
        else:
            skipped += 1
            print(f"  ? {p.relative_to(ROOT)}: {status}")
    print(f"[csp] done: +{added} added, {skipped} skipped, {errors} errors")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
