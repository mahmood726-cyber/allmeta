"""Structural integrity tests for kanban-lab: hub conventions + security baseline."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_has_csp_meta():
    """Every allmeta app ships an inline CSP meta tag (defence-in-depth)."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'http-equiv="Content-Security-Policy"' in html, "CSP meta tag missing"


def test_has_skip_link_or_main_landmark():
    """WCAG 2.4.1 — page should expose a skip-link or a <main> landmark."""
    html = INDEX.read_text(encoding="utf-8")
    has_skip = 'class="skip-link"' in html or 'href="#main"' in html or 'href="#content"' in html
    has_main = "<main" in html.lower()
    assert has_skip or has_main, "no skip-link and no <main> landmark"


def test_back_to_hub_navigation():
    """allmeta apps include a back-to-hub link so users can navigate home."""
    html = INDEX.read_text(encoding="utf-8")
    # Either the dedicated #hub-back element, or a plain href="../"
    has_hub_back = 'id="hub-back"' in html or 'href="../"' in html or 'href="..\\"' in html
    assert has_hub_back, "no back-to-hub navigation found"
