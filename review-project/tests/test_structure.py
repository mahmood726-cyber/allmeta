"""Structural tests for review-project."""
from pathlib import Path
INDEX = Path(__file__).parent.parent / "index.html"
def test_csp():
    assert 'http-equiv="Content-Security-Policy"' in INDEX.read_text(encoding="utf-8")
def test_main_landmark():
    assert "<main" in INDEX.read_text(encoding="utf-8").lower()
def test_back_to_hub():
    html = INDEX.read_text(encoding="utf-8")
    assert 'id="hub-back"' in html or 'href="../"' in html
def test_no_external_cdn():
    html = INDEX.read_text(encoding="utf-8")
    assert 'src="http' not in html and 'href="http' not in html
def test_stages_cover_pipeline():
    html = INDEX.read_text(encoding="utf-8")
    for stage in ("protocol", "search", "screening", "extraction", "appraisal", "synthesis", "certainty", "report"):
        assert stage in html, f"pipeline missing stage: {stage}"
    # composes the integrity apps built in Phase 2
    for app in ("inspect-sr", "spec-collapse", "reporting-bias", "grade-sof"):
        assert app in html
