"""A11y tests for reporting-bias cockpit."""
from pathlib import Path
INDEX = Path(__file__).parent.parent / "index.html"
def test_lang():
    assert 'lang="' in INDEX.read_text(encoding="utf-8")
def test_title_h1():
    html = INDEX.read_text(encoding="utf-8")
    assert "<title>" in html and "<h1" in html
def test_forced_colors():
    assert "forced-colors.css" in INDEX.read_text(encoding="utf-8")
