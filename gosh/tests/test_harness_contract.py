"""Every Node harness that stubs window.alm.urlState must provide every urlState
method the page calls.

Why: 75375a19 made gosh/index.html call window.alm.urlState.isSuspended() and
added it to hub/shared/url-state.js, but only input-harness.cjs got the stub.
The other four harnesses then died with "isSuspended is not a function" before
reaching a single assertion (1-2 failed + 89 errors), so the metafor oracle,
the numeric matrix and the page regressions silently stopped measuring the page.
"""
import re
from pathlib import Path

HERE = Path(__file__).parent
PAGE = HERE.parent / 'index.html'
REAL = HERE.parent.parent / 'hub' / 'shared' / 'url-state.js'


def page_methods():
    found = set(re.findall(r'alm\.urlState\.(\w+)\s*\(', PAGE.read_text(encoding='utf-8')))
    assert found, 'page no longer calls window.alm.urlState.*; update this contract'
    return found


def test_page_calls_only_methods_the_real_module_defines():
    real = REAL.read_text(encoding='utf-8')
    for name in page_methods():
        assert re.search(r'\binit\.' + name + r'\s*=', real), f'url-state.js does not define {name}'


def test_every_harness_stub_defines_every_called_method():
    harnesses = [p for p in sorted(HERE.glob('*.cjs')) if 'urlState' in p.read_text(encoding='utf-8')]
    assert len(harnesses) >= 5, [p.name for p in harnesses]
    missing = []
    for path in harnesses:
        text = path.read_text(encoding='utf-8')
        stub = re.search(r'urlState\s*:\s*Object\.assign\([^{]*\{([^}]*)\}', text)
        assert stub, f'{path.name}: urlState stub not found'
        for name in page_methods():
            if not re.search(r'\b' + name + r'\s*:', stub.group(1)):
                missing.append(f'{path.name}: {name}')
    assert not missing, missing


def test_every_harness_write_stub_reports_success_like_the_real_module():
    # url-state.js write() returns true when the state fits in the link (always, for
    # these small fixtures). A stub returning undefined sends the page down its
    # "data too long for a link" branch (4cf68e32), which calls document.createElement
    # and #analysis-status.before() -- neither exists in any harness.
    bad = []
    for path in sorted(HERE.glob('*.cjs')):
        text = path.read_text(encoding='utf-8')
        stub = re.search(r'urlState\s*:\s*Object\.assign\([^{]*\{([^}]*)\}', text)
        if stub and not re.search(r'\bwrite\s*:\s*\(\)\s*=>\s*true\b', stub.group(1)):
            bad.append(path.name)
    assert not bad, bad


def test_strict_harnesses_allow_nodes_the_page_creates_at_run_time():
    # 4cf68e32 made every run call getElementById('share-data-note'), a node the page
    # creates itself; a browser returns null until then. The strict harnesses refused
    # it ("Unexpected DOM node: share-data-note") and every metafor-oracle and
    # page-regression case errored before its first assertion.
    page = PAGE.read_text(encoding='utf-8')
    created = set(re.findall(r"\.id = '([^']+)'", page))
    assert 'share-data-note' in created
    for path in sorted(HERE.glob('*.cjs')):
        text = path.read_text(encoding='utf-8')
        if 'Unexpected DOM node' not in text:
            continue
        assert 'runtimeIds.has(id)) return null' in text, path.name
        assert ".id = '([^']+)'" in text, path.name
