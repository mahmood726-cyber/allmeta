"""Static app checks for EvidenceOS."""

from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
INDEX = APP_DIR / "index.html"
APP_JS = APP_DIR / "app.js"
STYLES = APP_DIR / "styles.css"
REPORT = APP_DIR / "data" / "report.json"


def test_app_files_exist():
    assert INDEX.is_file()
    assert APP_JS.is_file()
    assert STYLES.is_file()
    assert REPORT.is_file()


def test_index_has_security_and_dashboard_hooks():
    html = INDEX.read_text(encoding="utf-8")
    assert 'http-equiv="Content-Security-Policy"' in html
    assert 'id="workspace"' in html
    assert "./data/report.json" in html
    assert "./app.js" in html
    assert "<template" in html


def test_dashboard_has_update_gate_and_receipt_surface():
    html = INDEX.read_text(encoding="utf-8")
    assert "Update gate" in html
    assert "TruthCert draft receipt" in html
    assert "Static vs dynamic disclosure" in html
    assert "Trial view" in html
    assert "Publication view" in html
