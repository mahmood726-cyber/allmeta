"""Smoke tests for search-translator.
Asserts the index.html exists and contains a stable title marker."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_index_exists():
    assert INDEX.is_file()


def test_index_has_title():
    html = INDEX.read_text(encoding="utf-8")
    assert "Search Strategy Translator" in html
