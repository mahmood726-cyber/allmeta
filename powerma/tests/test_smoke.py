"""Smoke tests for powerma — verifies the index loads with the expected title."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_index_exists():
    assert INDEX.is_file()


def test_index_has_title_marker():
    html = INDEX.read_text(encoding="utf-8")
    assert "PowerMA / RIS" in html
