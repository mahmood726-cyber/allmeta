"""Accessibility hygiene tests for rob2: WCAG-aligned minimums."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_has_lang_attribute():
    """WCAG 3.1.1 — primary language must be declared on <html>."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'lang="' in html or "lang='" in html, "no lang attribute on <html>"


def test_has_title_or_h1():
    """WCAG 2.4.2 — page has a programmatic title (or an h1 as fallback)."""
    html = INDEX.read_text(encoding="utf-8")
    has_title = "<title>" in html
    has_h1 = "<h1" in html
    assert has_title or has_h1, "no <title> and no <h1>"
