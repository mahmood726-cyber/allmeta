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

def test_report_stage_links_paper_studio():
    # Phase 2 shell: the Report stage opens the ported Paper Studio.
    html = INDEX.read_text(encoding="utf-8")
    assert "../paper/" in html and "Paper Studio" in html

def test_links_current_sr_pipeline_apps():
    # The shell opens the live sr-* pipeline apps, not only the legacy ones.
    html = INDEX.read_text(encoding="utf-8")
    for app in ("../design/", "../search/", "../screen/", "../extract/", "../rob/"):
        assert app in html, f"shell missing current pipeline app link: {app}"

def test_live_bus_detection():
    # The shell reads live workspace state from the shared buses and can fold it into the bundle.
    html = INDEX.read_text(encoding="utf-8")
    assert "../shared/ma-pooled-v1.js" in html, "pooled bus reader not loaded"
    assert "sr-records-v1" in html and "sr-project-v1" in html
    assert "function refreshLive" in html and "function captureLive" in html
    assert 'id="btn-refresh"' in html and 'id="btn-capture-all"' in html
