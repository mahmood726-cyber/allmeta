"""Pre-release sanity checks for CITATION.cff ↔ build-info.js ↔ ALLMETA_CITE.

These tests assert the three places where the version + DOI live stay in
sync. Running them before each release catches the common slip of bumping
CITATION.cff but forgetting to regenerate shared/build-info.js (which
TruthCert receipts read at sign time).
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CFF = ROOT / "CITATION.cff"
BUILD_INFO = ROOT / "shared" / "build-info.js"
CITATION_JS = ROOT / "shared" / "citation.js"


def _cff_field(name: str) -> str | None:
    text = CFF.read_text(encoding="utf-8")
    m = re.search(rf'^{re.escape(name)}:\s*"?([^"\s]+)"?\s*$', text, flags=re.MULTILINE)
    return m.group(1) if m else None


def _build_info_field(name: str) -> str | None:
    text = BUILD_INFO.read_text(encoding="utf-8")
    m = re.search(rf'{re.escape(name)}:\s*"([^"]*)"', text)
    return m.group(1) if m else None


def test_citation_cff_and_build_info_versions_match():
    """If you bump CITATION.cff version, you MUST also regen build-info.js
    (otherwise TruthCert receipts will keep stamping the old version)."""
    cff_v = _cff_field("version")
    bi_v = _build_info_field("version")
    assert cff_v is not None, "CITATION.cff has no version: field"
    assert bi_v is not None, "shared/build-info.js has no version field"
    assert cff_v == bi_v, (
        f"version drift: CITATION.cff says {cff_v!r} but build-info.js says {bi_v!r}. "
        f"Run: python scripts/regen_build_info.py"
    )


def test_build_info_has_a_real_git_sha():
    sha = _build_info_field("sha")
    assert sha is not None, "shared/build-info.js has no sha field"
    assert re.fullmatch(r"[0-9a-f]{40}", sha), (
        f"build-info.js sha is not a 40-char hex SHA: {sha!r}. "
        f"Run: python scripts/regen_build_info.py"
    )


def test_build_info_shortSha_matches_full_sha():
    short = _build_info_field("shortSha")
    full = _build_info_field("sha")
    assert short and full, "build-info.js missing shortSha or sha"
    assert full.startswith(short), f"shortSha {short!r} is not a prefix of sha {full!r}"
    assert len(short) == 7, f"shortSha should be 7 chars, got {len(short)}"


def test_build_info_url_matches_citation_cff_url():
    bi_url = _build_info_field("url")
    cff_url = _cff_field("url")
    assert bi_url == cff_url, (
        f"URL drift: CITATION.cff url={cff_url!r} but build-info.js url={bi_url!r}"
    )


def test_citation_js_self_cite_includes_current_version():
    """If a release version is set in CITATION.cff, the ALLMETA_CITE block in
    shared/citation.js should reference it (or the URL, which is version-
    agnostic). Catches forgotten cite-string updates."""
    if not CITATION_JS.exists():
        return  # citation.js is optional
    js = CITATION_JS.read_text(encoding="utf-8")
    cff_v = _cff_field("version")
    cff_url = _cff_field("url")
    # The vancouver string must reference either the current version OR the
    # repo URL (the latter is version-agnostic and survives bumps).
    if cff_v and cff_v not in js and (not cff_url or cff_url not in js):
        raise AssertionError(
            f"shared/citation.js references neither version {cff_v!r} nor URL {cff_url!r}. "
            f"Update ALLMETA_CITE to keep cite-as strings in sync with the release."
        )
