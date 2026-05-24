"""Smoke tests for shared/webr-runner.js — module loads, API surface intact.

Does NOT boot WebR (that's ~30 MB and only meaningful in a real browser);
those checks live in tests/playwright/. This file verifies the JS module's
public surface, R-script construction, and structural correctness.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "webr-runner.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> object:
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


def test_module_loads_and_exposes_runMetafor():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify({{
          hasRunMetafor: typeof M.runMetafor === "function",
          hasRunMetaforFromBus: typeof M.runMetaforFromBus === "function",
          hasAttach: typeof M.attachLiveButton === "function",
          hasModal: typeof M.showModal === "function",
        }}));
    """)
    assert out["hasRunMetafor"] is True
    assert out["hasRunMetaforFromBus"] is True
    assert out["hasAttach"] is True
    assert out["hasModal"] is True


def test_runMetafor_requires_at_least_2_studies():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        M.runMetafor({{ studies: [{{ label: "A", est: 0.1, se: 0.05 }}] }})
          .then(r => console.log(JSON.stringify(r)));
    """)
    assert out["ok"] is False
    assert "2 studies" in out["error"]


def test_runMetaforFromBus_when_bus_helper_missing():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        // MaStudies not loaded in Node — should fail closed with a clear msg.
        M.runMetaforFromBus().then(r => console.log(JSON.stringify(r)));
    """)
    assert out["ok"] is False
    assert "ma-studies-v1 helper not loaded" in out["error"]


def test_resolveBaseUrl_includes_self_hosted_or_cdn():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const bases = M._resolveBaseUrl();
        console.log(JSON.stringify({{
          n: bases.length,
          hasCdn: bases.some(b => b.includes("webr.r-wasm.org")),
        }}));
    """)
    # In Node `location` is undefined → only the CDN fallback is present.
    assert out["hasCdn"] is True
    assert out["n"] >= 1
