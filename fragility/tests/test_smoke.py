"""Smoke tests for fragility — index loads and uses the audited shared modules."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_index_exists():
    assert INDEX.is_file()


def test_index_has_title_marker():
    html = INDEX.read_text(encoding="utf-8")
    assert "<title>Fragility index" in html


def test_uses_shared_modules():
    """FI must come from the R-verified shared/fragility.js (which pools via ma-core)."""
    html = INDEX.read_text(encoding="utf-8")
    assert "../shared/fragility.js" in html
    assert "../shared/ma-core.js" in html
    assert "AlmFragility.fragility" in html
