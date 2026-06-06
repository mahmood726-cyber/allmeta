"""Smoke tests for reporting-bias cockpit."""
from pathlib import Path
INDEX = Path(__file__).parent.parent / "index.html"
def test_index_exists():
    assert INDEX.is_file()
def test_title_marker():
    assert "missing-evidence cockpit" in INDEX.read_text(encoding="utf-8")
def test_uses_shared_egger():
    html = INDEX.read_text(encoding="utf-8")
    assert "../shared/egger.js" in html and "AlmEgger.eggerTest" in html
