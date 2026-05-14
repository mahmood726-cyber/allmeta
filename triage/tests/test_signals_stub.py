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


def test_stub_count_strict_uppercase_TODO_only(tmp_path):
    """Cycle 2.5b regression: lowercase 'todo' as UI vocabulary (prisma-checklist's
    'Yes/Partial/No/To do' 4-state, class names like .todo, JS counter counts.todo)
    is NOT a code-stub marker. Only uppercase TODO is conventional code-stub syntax."""
    app = tmp_path / "todo-ui"
    app.mkdir()
    (app / "index.html").write_text(
        '<!doctype html><html><body>'
        '<style>.todo { color: gray; } --todo: #5c6470;</style>'
        '<span class="todo">To do <b id="c-todo">27</b></span>'
        '<script>const counts = { yes: 0, todo: 0 }; counts.todo++;</script>'
        '</body></html>',
        encoding="utf-8",
    )
    from triage.signals import stub_count
    assert stub_count(app) == 0


def test_stub_count_still_catches_uppercase_TODO_in_code(tmp_path):
    """Sanity: real TODO (uppercase) in code IS still caught."""
    app = tmp_path / "real-todo"
    app.mkdir()
    (app / "index.html").write_text(
        '<!doctype html><html><body><script>'
        '// TODO: implement caching\n'
        'function f() { /* FIXME: handle edge case */ }'
        '</script></body></html>',
        encoding="utf-8",
    )
    from triage.signals import stub_count
    # TODO + FIXME = 2
    assert stub_count(app) == 2


def test_stub_count_skips_huge_vendor_bundle(tmp_path):
    """Cycle 2.5b regression: files >500 KB are skipped (vendor bundles, minified
    blobs, generated artifacts). IPD-Meta-Pro's 121k-line ipd-meta-pro.html had
    64 TODOs inside bundled SheetJS/jsPDF — not app stubs."""
    app = tmp_path / "huge-bundle"
    app.mkdir()
    # Small file with a real TODO
    (app / "index.html").write_text(
        '<!doctype html><html><body><script>// TODO: real one</script></body></html>',
        encoding="utf-8",
    )
    # Big vendor bundle with many TODOs (well over 500 KB)
    big = '<!doctype html><html><body><script>' + ('// TODO: vendor\n' * 50000) + '</script></body></html>'
    (app / "vendor-bundle.html").write_text(big, encoding="utf-8")
    from triage.signals import stub_count
    # Only the 1 TODO in index.html should count; the 50000 in vendor-bundle skipped
    assert stub_count(app) == 1
