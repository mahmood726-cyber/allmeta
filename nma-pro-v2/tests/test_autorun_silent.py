"""_autoRunSilent (nma-pro-v8.0.html) must not hide errors or refusals.

It runs the post-analysis extras (runPubBias, runCumulative) with showLoading / hideLoading / switchTab /
Toast.show swapped for no-ops so they do not steal focus from the Results tab. Before lane aitems
(2026-11-15) the Toast swap also swallowed every warning and error: both runners report a failure or a
refusal ONLY through Toast.show(msg, "warn") (e.g. 'Publication bias analysis failed: ...',
'Need >=3 studies'), and an exception thrown by a runner went to console.warn only. The user saw an
empty tab and no reason. Info/success toasts may stay silent; warnings, errors and exceptions must reach
the real Toast once the swap is undone.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

PAGE = Path(__file__).resolve().parent.parent / 'nma-pro-v8.0.html'
NODE = shutil.which('node')
pytestmark = pytest.mark.skipif(NODE is None, reason='node not installed')


def _source():
    html = PAGE.read_text(encoding='utf-8')
    # everything from the block's leading comment up to runAutoExtras, so module-level state it uses comes too
    m = re.search(r'// Silenced auto-run:.*?(?=async function runAutoExtras)', html, re.S)
    assert m and 'async function _autoRunSilent(' in m.group(0), '_autoRunSilent not found'
    return m.group(0)


def _run():
    script = """
const shown = [], switched = [];
const window = globalThis;
window.Toast = { show: (m, l) => shown.push([String(m), l || 'info']) };
window.switchTab = (t) => switched.push(t);
window.showLoading = () => {}; window.hideLoading = () => {};
const realToast = window.Toast.show, realSwitch = window.switchTab;
window.refuses = async () => { window.Toast.show('Need =3 studies', 'warn'); };
window.fails = async () => { window.Toast.show('Publication bias analysis failed: boom', 'warn'); };
window.throws = async () => { throw new Error('kaput'); };
window.quiet = async () => { window.Toast.show('done', 'info'); window.switchTab('pubbias'); };
""" + _source() + """
(async () => {
  await _autoRunSilent('quiet'); await _autoRunSilent('refuses'); await _autoRunSilent('fails');
  await _autoRunSilent('throws'); await _autoRunSilent('noSuchRunner');
  console.log(JSON.stringify({ shown, switched, restored: window.Toast.show === realToast && window.switchTab === realSwitch }));
})();
"""
    out = subprocess.run([NODE, '-e', script], capture_output=True, text=True, timeout=60, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout.strip().splitlines()[-1])


R = _run() if NODE else None


def test_focus_side_effects_still_silenced():
    assert R['switched'] == []
    assert R['restored'] is True
    assert not any(m == 'done' for m, _ in R['shown']), 'info toast should stay silent during the auto-run'


def test_refusal_reaches_the_user():
    assert any('Need =3 studies' in m and l == 'warn' for m, l in R['shown']), R['shown']


def test_runner_failure_toast_reaches_the_user():
    assert any('Publication bias analysis failed: boom' in m for m, _ in R['shown']), R['shown']


def test_thrown_exception_reaches_the_user():
    assert any('kaput' in m and l == 'error' for m, l in R['shown']), R['shown']


def test_missing_runner_is_reported():
    assert any('noSuchRunner' in m and l == 'error' for m, l in R['shown']), R['shown']


# ---- agy review of #604 -------------------------------------------------------------------------------------
# (a) Held toasts were replayed as realToast(...h), i.e. with `this` unbound. A Toast whose show() uses `this`
#     then threw on every replay and the held warning ended in console.error, never on screen.
# (b) Overlapping calls: the second call saved the first call's no-ops as the "real" functions. If the first
#     finished first it restored the real ones, and the second then put the no-ops back for good: switchTab,
#     showLoading, hideLoading and Toast.show stayed dead for the rest of the session.
def _run_node(body):
    script = """
const window = globalThis;
const shown = [], switched = [];
window.Toast = { _items: shown, show(m, l) { this._items.push([String(m), l || 'info']); } };
window.switchTab = (t) => switched.push(t);
window.showLoading = () => {}; window.hideLoading = () => {};
const real = { toast: window.Toast.show, sw: window.switchTab, sl: window.showLoading, hl: window.hideLoading };
const restored = () => window.Toast.show === real.toast && window.switchTab === real.sw
  && window.showLoading === real.sl && window.hideLoading === real.hl;
const wait = ms => new Promise(r => setTimeout(r, ms));
""" + _source() + body
    out = subprocess.run([NODE, '-e', script], capture_output=True, text=True, timeout=60, encoding='utf-8')
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_held_toast_replayed_with_toast_as_this():
    r = _run_node("""
window.refuses = async () => { window.Toast.show('Need \\u22653 studies', 'warn'); };
(async () => { await _autoRunSilent('refuses'); console.log(JSON.stringify({ shown, restored: restored() })); })();
""")
    assert r['restored'] is True
    assert ['Need ≥3 studies', 'warn'] in r['shown'], r['shown']


@pytest.mark.parametrize('order', ['first_finishes_first', 'second_finishes_first'])
def test_overlapping_calls_restore_the_real_functions(order):
    a, b = (10, 40) if order == 'first_finishes_first' else (40, 10)
    r = _run_node("""
window.slowA = async () => { await wait(%d); window.Toast.show('A refused', 'warn'); };
window.slowB = async () => { await wait(%d); window.Toast.show('B refused', 'warn'); };
(async () => {
  const pA = _autoRunSilent('slowA'); const pB = _autoRunSilent('slowB');
  await Promise.all([pA, pB]);
  window.switchTab('after');
  console.log(JSON.stringify({ shown, switched, restored: restored() }));
})();
""" % (a, b))
    assert r['restored'] is True, 'a no-op was left installed after both calls finished'
    assert r['switched'] == ['after']
    msgs = [m for m, _ in r['shown']]
    assert 'A refused' in msgs and 'B refused' in msgs, r['shown']
