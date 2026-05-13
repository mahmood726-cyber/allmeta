"""Integration smoke tests: results-export and ancillary shared modules in p-curve."""
from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_results_export_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/results-export.js' in html, "results-export script tag missing"
    assert 'id="alm-export-mount"' in html, "results-export mount div missing"


def test_url_state_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/url-state.js' in html, "url-state script tag missing"


def test_reset_undo_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/reset-undo.js' in html, "reset-undo script tag missing"
    assert 'id="alm-undo-mount"' in html, "reset-undo mount div missing"


def test_axis_controls_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/axis-controls.js' in html, "axis-controls script tag missing"
    assert 'id="alm-axis-mount"' in html, "axis-controls mount div missing"


def test_tooltips_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/tooltips.js' in html, "tooltips script tag missing"


def test_results_schema_key_present():
    html = INDEX.read_text(encoding="utf-8")
    assert 'pcurve-results-v1' in html, "_schema key 'pcurve-results-v1' missing from __almResults"


def test_abbr_gloss_markers_in_footer():
    html = INDEX.read_text(encoding="utf-8")
    assert 'data-gloss' in html, "No data-gloss abbr markers found in page"
