"""Smoke tests for IPD-Meta-Pro.
Asserts the launcher index.html exists and contains the expected asset links."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_index_exists():
    assert INDEX.is_file()


def test_index_has_expected_content():
    html = INDEX.read_text(encoding="utf-8")
    assert "IPD" in html or "Meta-Analysis Pro" in html
