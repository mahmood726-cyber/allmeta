"""Offline-compliance guard for the live allmeta suite.

allmeta's core contract is "fully offline — no external CDN". This test fails if
any LIVE app HTML loads a resource (script/img/iframe src, or a <link> stylesheet/
preconnect/dns-prefetch/icon) from an external http(s) host. It locks in the
CDN->shared/vendor repoint and the Google-Fonts strip so neither can silently
regress.

Frozen snapshots are intentionally out of scope: _archive/ and archive/ dirs,
*.backup-* files, node_modules, and shared/vendor (local libs only). External
<a href> navigation links (e.g. GitHub source links in footers) are allowed —
they are not resource loads.
"""
from __future__ import annotations
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

EXCLUDE_DIR_PARTS = {"_archive", "archive", "node_modules", ".git", ".pytest_cache", "__pycache__"}

# Resource-loading external refs only: src="http..." (script/img/iframe/...) and
# <link ... href="http..."> (stylesheet/preconnect/dns-prefetch/icon). Deliberately
# NOT <a href> (navigation) or content="http..." (OG/meta) or xmlns (namespaces).
SRC_RE = re.compile(r"""\ssrc\s*=\s*["']https?://""", re.IGNORECASE)
LINK_HREF_RE = re.compile(r"""<link\b[^>]*\bhref\s*=\s*["']https?://""", re.IGNORECASE)


def _is_frozen(p: Path) -> bool:
    return (
        any(part in EXCLUDE_DIR_PARTS for part in p.parts)
        or ".backup-" in p.name
        or p.relative_to(ROOT).parts[:2] == ("shared", "vendor")
    )


def _live_html_files() -> list[Path]:
    return [p for p in ROOT.rglob("*.html") if not _is_frozen(p)]


def _violations(text: str) -> list[str]:
    out = []
    for m in SRC_RE.finditer(text):
        out.append(text[m.start(): m.start() + 80].strip())
    for m in LINK_HREF_RE.finditer(text):
        out.append(text[m.start(): m.start() + 80].strip())
    return out


def test_some_live_html_discovered():
    # Guard against the walker silently matching nothing (which would make the
    # offline assertion vacuously pass).
    assert len(_live_html_files()) > 50


def test_no_external_resource_refs_in_live_html():
    offenders: dict[str, list[str]] = {}
    for f in _live_html_files():
        v = _violations(f.read_text(encoding="utf-8", errors="replace"))
        if v:
            offenders[str(f.relative_to(ROOT))] = v[:5]
    assert not offenders, (
        "Live HTML must not load external resources (offline contract). "
        "Vendor the lib into shared/vendor/ and repoint, or strip the ref:\n"
        + "\n".join(f"  {k}: {vs}" for k, vs in sorted(offenders.items()))
    )
