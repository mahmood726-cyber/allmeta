"""Structural tests for reporting-bias cockpit."""
from pathlib import Path
INDEX = Path(__file__).parent.parent / "index.html"
def test_has_csp_meta():
    assert 'http-equiv="Content-Security-Policy"' in INDEX.read_text(encoding="utf-8")
def test_has_main_landmark():
    assert "<main" in INDEX.read_text(encoding="utf-8").lower()
def test_back_to_hub():
    html = INDEX.read_text(encoding="utf-8")
    assert 'id="hub-back"' in html or 'href="../"' in html
def test_no_external_cdn():
    html = INDEX.read_text(encoding="utf-8")
    assert 'src="http' not in html and 'href="http' not in html
