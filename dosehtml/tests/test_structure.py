"""Structural integrity tests for dosehtml.

dosehtml/index.html is a launcher page. CSP and hub navigation apply;
skip-link and <main> are not required for a launcher stub."""
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
