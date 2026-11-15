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
    m = re.search(r'async function _autoRunSilent\(fnName\)\{.*?\n\}\n(?=async function runAutoExtras)', html, re.S)
    assert m, '_autoRunSilent not found'
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
