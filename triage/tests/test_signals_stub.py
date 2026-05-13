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


def test_stub_count_ignores_placeholder_as_js_object_key(fixtures_root, tmp_path):
    """Cycle 2.3 regression: `placeholder:` as a JS object key (config / LocalLLM panel)
    is legitimate code, not a stub marker. effect-size-converter hit this."""
    app = tmp_path / "esc-style"
    app.mkdir()
    (app / "index.html").write_text(
        '<!doctype html><html><body><script>'
        'const cfg = { url: "http://localhost", placeholder: "Custom URL" };'
        '</script></body></html>',
        encoding="utf-8",
    )
    from triage.signals import stub_count
    assert stub_count(app) == 0


def test_stub_count_ignores_stub_word_in_markdown_documentation(tmp_path):
    """Cycle 2.3 regression: 'stub' as English text in markdown documentation
    (e.g. RETROFIT_AUDIT.md describing audit findings) is NOT a code stub.
    nma-pro-v2 hit this with 'pandas stub' and 'stub_count' in audit docs."""
    app = tmp_path / "doc-style"
    app.mkdir()
    (app / "index.html").write_text("<!doctype html><html><body>ok</body></html>", encoding="utf-8")
    (app / "RETROFIT_AUDIT.md").write_text(
        "# audit\n\nThe stub detector reported pandas stub fixtures. stub_count was 5.\n",
        encoding="utf-8",
    )
    from triage.signals import stub_count
    assert stub_count(app) == 0


def test_stub_count_ignores_not_implemented_in_methodology_prose(tmp_path):
    """Cycle 2.4 regression: 'not implemented' as part of methodology
    documentation (e.g. p-curve explaining which variant of a test the
    app uses, by contrast with one that is 'not implemented here') is
    NOT a code stub. HTA, Pairwiseai (x2), p-curve all hit this."""
    app = tmp_path / "method-doc"
    app.mkdir()
    (app / "index.html").write_text(
        "<!doctype html><html><body><p>The right-skew test uses Fisher's "
        "combined method, not Simonsohn's 33%-power flatness test, which "
        "is not implemented here.</p></body></html>",
        encoding="utf-8",
    )
    from triage.signals import stub_count
    assert stub_count(app) == 0
