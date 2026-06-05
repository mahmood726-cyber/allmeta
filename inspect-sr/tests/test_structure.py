"""Structural integrity tests for inspect-sr: hub conventions + security baseline."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_has_csp_meta():
    html = INDEX.read_text(encoding="utf-8")
    assert 'http-equiv="Content-Security-Policy"' in html, "CSP meta tag missing"


def test_has_skip_link_or_main_landmark():
    html = INDEX.read_text(encoding="utf-8")
    has_skip = 'class="skip-link"' in html or 'href="#main"' in html or 'href="#content"' in html
    assert has_skip or "<main" in html.lower(), "no skip-link and no <main> landmark"


def test_back_to_hub_navigation():
    html = INDEX.read_text(encoding="utf-8")
    assert 'id="hub-back"' in html or 'href="../"' in html, "no back-to-hub navigation"


def test_no_external_cdn():
    html = INDEX.read_text(encoding="utf-8")
    assert 'src="http' not in html and 'href="http' not in html, "external CDN resource"
