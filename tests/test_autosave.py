"""Tests for shared/autosave.js — driven via node with a tiny DOM shim."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "autosave.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> object:
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, text=True, timeout=20, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


# Reusable jsdom-like shim. Just enough to satisfy AlmAutosave._snapshot /
# _restore / _setStored. localStorage is an in-memory Map.
_SHIM = """
const storage = {};
global.localStorage = {
  getItem: k => storage[k] ?? null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: k => { delete storage[k]; },
  clear: () => { for (const k of Object.keys(storage)) delete storage[k]; }
};
function makeEl(tag, opts={}) {
  const el = { tagName: tag.toUpperCase(), dataset: {}, ...opts };
  el.dispatchEvent = () => {};
  return el;
}
global.document = {
  body: { appendChild: () => {} },
  createElement: () => ({ style: {}, addEventListener: () => {}, appendChild: () => {}, remove: () => {} }),
  addEventListener: () => {},
  querySelectorAll: () => [],
};
const A = require(__MODULE_PATH__);
"""


def _shim_script(extra: str) -> str:
    body = _SHIM.replace("__MODULE_PATH__", json.dumps(str(MODULE)))
    return body + "\n" + extra


def test_snapshot_collects_textareas_and_inputs():
    out = _run_node(_shim_script("""
        const els = [
          makeEl('textarea', { id: 't1', value: 'study data' }),
          makeEl('input',    { id: 'alpha', type: 'number', value: '0.05' }),
          makeEl('input',    { id: 'iv',    type: 'checkbox', checked: true }),
          makeEl('select',   { id: 'model', value: 'REML' }),
        ];
        const snap = A._snapshot(els);
        console.log(JSON.stringify(snap));
    """))
    assert out == {"t1": "study data", "alpha": "0.05", "iv": True, "model": "REML"}


def test_passwords_and_files_are_never_persisted():
    out = _run_node(_shim_script("""
        const els = [
          makeEl('input', { id: 'pw',  type: 'password', value: 'secret' }),
          makeEl('input', { id: 'f',   type: 'file',     value: 'C:/data.csv' }),
          makeEl('input', { id: 'ok',  type: 'text',     value: 'keep' }),
        ];
        console.log(JSON.stringify(A._snapshot(els)));
    """))
    assert out == {"ok": "keep"}


def test_oversized_fields_are_skipped():
    out = _run_node(_shim_script("""
        const huge = 'x'.repeat(150_000);
        const els = [
          makeEl('textarea', { id: 'huge',   value: huge }),
          makeEl('textarea', { id: 'normal', value: 'fine' }),
        ];
        console.log(JSON.stringify(A._snapshot(els)));
    """))
    assert "huge" not in out, "Fields over 100 KB must be skipped (use the bus for big data)"
    assert out["normal"] == "fine"


def test_restore_writes_values_back_and_returns_count():
    out = _run_node(_shim_script("""
        const els = [
          makeEl('textarea', { id: 'a', value: '' }),
          makeEl('input',    { id: 'b', type: 'number', value: '' }),
          makeEl('select',   { id: 'c', value: '' }),
        ];
        const n = A._restore(els, { a: 'restored', b: '42', c: 'PM' });
        console.log(JSON.stringify({ n, a: els[0].value, b: els[1].value, c: els[2].value }));
    """))
    assert out == {"n": 3, "a": "restored", "b": "42", "c": "PM"}


def test_peek_returns_null_when_no_draft():
    out = _run_node(_shim_script("""
        console.log(JSON.stringify(A.peek('nope') === null));
    """))
    assert out is True


def test_storage_key_namespaced_per_app():
    out = _run_node(_shim_script("""
        console.log(JSON.stringify({
          forest: A._key('forest-plot'),
          funnel: A._key('funnel-plot'),
        }));
    """))
    assert out["forest"] == "alm-autosave:forest-plot"
    assert out["funnel"] == "alm-autosave:funnel-plot"
    assert out["forest"] != out["funnel"], "keys must be namespaced per app"
