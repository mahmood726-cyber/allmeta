"""Module wiring tests for pet-peese retrofit — assert all shared modules are present."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_results_export_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert "hub/shared/results-export.js" in html, "results-export script tag missing"


def test_url_state_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert "hub/shared/url-state.js" in html, "url-state script tag missing"


def test_reset_undo_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert "hub/shared/reset-undo.js" in html, "reset-undo script tag missing"


def test_axis_controls_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert "hub/shared/axis-controls.js" in html, "axis-controls script tag missing"


def test_tooltips_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert "hub/shared/tooltips.js" in html, "tooltips script tag missing"
