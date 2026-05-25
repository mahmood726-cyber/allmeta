"""Tests for shared/hero-examples.js."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "hero-examples.js"
DATASETS = ROOT / "shared" / "canonical-datasets.js"

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


def test_module_exposes_attachHero_and_manifests():
    out = _run_node(f"""
        const H = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify({{
          hasAttach: typeof H.attachHero === "function",
          manifestKeys: Object.keys(H.MANIFESTS),
          forest: H.MANIFESTS.forest.map(m => m.key),
        }}));
    """)
    assert out["hasAttach"] is True
    for adapter in ["forest", "glmm", "cross-design", "cross-network", "sequential", "personalised"]:
        assert adapter in out["manifestKeys"]
    assert "bcg" in out["forest"]


def test_each_manifest_key_resolves_to_a_real_dataset():
    """Every dataset referenced in a manifest must exist in AlmDatasets."""
    out = _run_node(f"""
        // Order matters: datasets must load first so MANIFESTS can resolve.
        require({json.dumps(str(DATASETS))});
        const H = require({json.dumps(str(MODULE))});
        const D = globalThis.AlmDatasets;
        const bad = [];
        for (const adapter in H.MANIFESTS) {{
          for (const entry of H.MANIFESTS[adapter]) {{
            if (!D.get(entry.key)) bad.push({{ adapter: adapter, key: entry.key }});
          }}
        }}
        console.log(JSON.stringify(bad));
    """)
    assert out == [], f"manifest references missing datasets: {out}"
