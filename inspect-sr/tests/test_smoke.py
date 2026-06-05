"""Smoke tests for inspect-sr — index loads and uses the audited shared module."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_index_exists():
    assert INDEX.is_file()


def test_index_has_title_marker():
    html = INDEX.read_text(encoding="utf-8")
    assert "<title>INSPECT-SR" in html


def test_repool_uses_shared_ma_core():
    """The 'would-this-survive' re-pool must use the R-verified shared/ma-core.js."""
    html = INDEX.read_text(encoding="utf-8")
    assert "../shared/ma-core.js" in html
    assert "AlmMaCore.pool" in html
