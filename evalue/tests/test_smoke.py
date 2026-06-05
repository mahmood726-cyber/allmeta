"""Smoke tests for evalue — index loads and uses the audited shared module."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_index_exists():
    assert INDEX.is_file()


def test_index_has_title_marker():
    html = INDEX.read_text(encoding="utf-8")
    assert "<title>E-value" in html


def test_uses_shared_evalue_module():
    """Math must come from the R-verified shared/evalue.js, not inline."""
    html = INDEX.read_text(encoding="utf-8")
    assert "../shared/evalue.js" in html
    assert "AlmEValue.eValues" in html
