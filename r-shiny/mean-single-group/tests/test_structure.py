"""Structural integrity tests for r-shiny/mean-single-group."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_has_charset_meta():
    html = INDEX.read_text(encoding="utf-8")
    assert "charset" in html.lower(), "no charset meta tag"


def test_has_viewport_meta():
    html = INDEX.read_text(encoding="utf-8")
    assert "viewport" in html.lower(), "no viewport meta tag"


def test_loads_shinylive_module():
    html = INDEX.read_text(encoding="utf-8")
    assert 'type="module"' in html, "no ES module script tag for Shinylive loader"
