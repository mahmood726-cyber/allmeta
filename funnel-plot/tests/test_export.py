from pathlib import Path

INDEX = Path(__file__).parent.parent / "index.html"


def test_results_export_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/results-export.js' in html


def test_url_state_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/url-state.js' in html


def test_reset_undo_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/reset-undo.js' in html


def test_axis_controls_module_is_referenced():
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/axis-controls.js' in html


def test_tooltips_module_is_referenced():
    # Funnel-plot DOES get tooltips.js wired (audit said tooltips were absent;
    # forest-plot had glossary already, funnel-plot did not).
    html = INDEX.read_text(encoding="utf-8")
    assert 'hub/shared/tooltips.js' in html
