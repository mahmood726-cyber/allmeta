"""Smoke tests for living-meta.
Asserts the index.html stub exists and contains the redirect target."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_index_exists():
    assert INDEX.is_file()


def test_index_has_redirect():
    html = INDEX.read_text(encoding="utf-8")
    assert "living-meta-complete.html" in html
