"""Smoke tests for cumulative-subgroup."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_index_exists():
    assert INDEX.is_file()


def test_index_has_expected_content():
    html = INDEX.read_text(encoding="utf-8", errors="replace")
    assert "Cumulative" in html
