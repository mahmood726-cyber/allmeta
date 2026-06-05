"""Smoke tests for spec-collapse — index loads and uses the shared engine."""
from pathlib import Path
INDEX = Path(__file__).parent.parent / "index.html"
def test_index_exists():
    assert INDEX.is_file()
def test_index_has_title_marker():
    assert "<title>Spec-collapse" in INDEX.read_text(encoding="utf-8")
def test_uses_shared_engine_and_core():
    html = INDEX.read_text(encoding="utf-8")
    assert "../shared/spec-collapse.js" in html
    assert "../shared/ma-core.js" in html and "../shared/trimfill.js" in html
    assert "AlmSpecCollapse.analyze" in html
