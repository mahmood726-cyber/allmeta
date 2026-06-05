"""Accessibility hygiene tests for spec-collapse."""
from pathlib import Path
INDEX = Path(__file__).parent.parent / "index.html"
def test_has_lang_attribute():
    assert 'lang="' in INDEX.read_text(encoding="utf-8")
def test_has_title_and_h1():
    html = INDEX.read_text(encoding="utf-8")
    assert "<title>" in html and "<h1" in html
def test_forced_colors_stylesheet():
    assert "forced-colors.css" in INDEX.read_text(encoding="utf-8")
