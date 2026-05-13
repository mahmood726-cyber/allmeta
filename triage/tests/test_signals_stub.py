from pathlib import Path
from triage.signals import stub_count
import pytest


@pytest.fixture
def fixtures_root():
    return Path(__file__).parent / "fixtures"


def test_stub_count_detects_markers(fixtures_root):
    assert stub_count(fixtures_root / "stub-app") == 3  # TODO + unimpl + REPLACE_ME


def test_stub_count_zero_on_clean(fixtures_root):
    assert stub_count(fixtures_root / "clean-app") == 0


def test_stub_count_zero_on_missing_folder(tmp_path):
    assert stub_count(tmp_path / "does-not-exist") == 0


def test_stub_count_ignores_html_placeholder_attribute(tmp_path):
    """Regression: placeholder="..." HTML attribute must NOT be counted as a stub marker.
    Anchors (forest-plot, funnel-plot, meta-regression) use <input placeholder="...">
    and <textarea placeholder="..."> which were incorrectly counted as stubs before
    the lookbehind/lookahead guard was added to _STUB_PATTERNS."""
    app_dir = tmp_path / "html-ui-app"
    app_dir.mkdir()
    (app_dir / "index.html").write_text(
        '<!doctype html><html><body>'
        '<textarea placeholder="# Example data"></textarea>'
        '<input type="text" placeholder="e.g. SGLT2i">'
        '</body></html>',
        encoding="utf-8",
    )
    assert stub_count(app_dir) == 0
