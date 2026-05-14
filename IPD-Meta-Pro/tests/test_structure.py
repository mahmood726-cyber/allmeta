"""Structural integrity tests for IPD-Meta-Pro.

IPD-Meta-Pro/index.html is a 47-line launcher page (same pattern as Pairwiseai);
the real app is ipd-meta-pro.html in e156-submission/assets/. Atlas measures the
launcher index, which is intentionally minimal. Skip-link and <main> are not
required for this launcher stub. CSP and hub navigation apply."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_has_csp_meta():
    """Every allmeta app ships an inline CSP meta tag (defence-in-depth)."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'http-equiv="Content-Security-Policy"' in html, "CSP meta tag missing"


def test_has_hub_link():
    """Launcher page links back to hub."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'href="../"' in html or 'id="hub-back"' in html, "no back-to-hub navigation"


def test_has_submission_links():
    """Launcher contains links to submission assets."""
    html = INDEX.read_text(encoding="utf-8")
    assert "e156-submission" in html, "no e156-submission links found"
