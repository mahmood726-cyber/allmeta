"""Smoke tests for review-project."""
from pathlib import Path
INDEX = Path(__file__).parent.parent / "index.html"
def test_index_exists():
    assert INDEX.is_file()
def test_title_marker():
    assert "<title>Review project" in INDEX.read_text(encoding="utf-8")
def test_uses_review_bundle():
    html = INDEX.read_text(encoding="utf-8")
    assert "../shared/review-bundle.js" in html and "AlmReviewBundle.sign" in html and "AlmReviewBundle.verify" in html
