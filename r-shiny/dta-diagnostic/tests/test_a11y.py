"""Accessibility hygiene tests for r-shiny/dta-diagnostic."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_has_lang_attribute():
    """WCAG 3.1.1 — primary language must be declared on <html>."""
    html = INDEX.read_text(encoding="utf-8")
    assert 'lang="' in html or "lang='" in html, "no lang attribute on <html>"


def test_has_title():
    """WCAG 2.4.2 — page has a programmatic title."""
    html = INDEX.read_text(encoding="utf-8")
    assert "<title>" in html, "no <title> element"


def test_has_doctype():
    """Well-formed HTML requires a DOCTYPE declaration."""
    html = INDEX.read_text(encoding="utf-8")
    assert "<!doctype html>" in html.lower(), "no DOCTYPE declaration"
