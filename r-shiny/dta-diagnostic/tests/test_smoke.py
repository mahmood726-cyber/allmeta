"""Smoke tests for r-shiny/dta-diagnostic (Shinylive bundle)."""
from pathlib import Path

APP_DIR = Path(__file__).parent.parent


def test_index_exists():
    assert (APP_DIR / "index.html").is_file()


def test_index_references_shinylive():
    html = (APP_DIR / "index.html").read_text(encoding="utf-8", errors="replace")
    assert "shinylive" in html.lower(), "index.html does not reference shinylive"


def test_app_json_exists():
    assert (APP_DIR / "app.json").is_file(), "Shinylive app.json bundle missing"
