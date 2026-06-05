"""Accessibility hygiene tests for evalue: WCAG-aligned minimums."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_has_lang_attribute():
    html = INDEX.read_text(encoding="utf-8")
    assert 'lang="' in html or "lang='" in html, "no lang attribute on <html>"


def test_has_title_and_h1():
    html = INDEX.read_text(encoding="utf-8")
    assert "<title>" in html and "<h1" in html


def test_forced_colors_stylesheet():
    html = INDEX.read_text(encoding="utf-8")
    assert "forced-colors.css" in html, "Windows High Contrast support stylesheet missing"
