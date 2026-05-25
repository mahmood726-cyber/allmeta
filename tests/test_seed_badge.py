"""Tests for shared/seed-badge.js — deterministic seeding + export embedding."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "seed-badge.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str):
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, text=True, timeout=15, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


def test_deriveFromInputs_is_deterministic():
    out = _run_node(f"""
        const S = require({json.dumps(str(MODULE))});
        const a = S.deriveFromInputs({{x: 1, y: [2, 3], z: "hello"}});
        const b = S.deriveFromInputs({{x: 1, y: [2, 3], z: "hello"}});
        console.log(JSON.stringify({{ a, b, equal: a === b }}));
    """)
    assert out["equal"] is True
    assert isinstance(out["a"], int) and out["a"] > 0


def test_deriveFromInputs_key_order_independent():
    """Key order in the input object must not affect the seed — otherwise the
    same logical inputs would produce different seeds across browsers / JSON
    serialisers."""
    out = _run_node(f"""
        const S = require({json.dumps(str(MODULE))});
        const a = S.deriveFromInputs({{x: 1, y: 2, z: 3}});
        const b = S.deriveFromInputs({{z: 3, y: 2, x: 1}});
        console.log(JSON.stringify({{ a, b, equal: a === b }}));
    """)
    assert out["equal"] is True


def test_deriveFromInputs_differs_for_different_inputs():
    out = _run_node(f"""
        const S = require({json.dumps(str(MODULE))});
        const a = S.deriveFromInputs({{x: 1}});
        const b = S.deriveFromInputs({{x: 2}});
        console.log(JSON.stringify({{ a, b, different: a !== b }}));
    """)
    assert out["different"] is True


def test_deriveFromInputs_never_returns_zero():
    """0 is a problematic seed for some PRNGs (treated as "reseed"). The
    derive function must coerce 0 → 1 to keep behavior consistent."""
    out = _run_node(f"""
        const S = require({json.dumps(str(MODULE))});
        // Find an input that would FNV-1a-hash to 0 if not for the guard.
        // Empty object: hash starts at 0x811c9dc5, never becomes 0 here, but
        // verify that ANY input never returns 0.
        let anyZero = false;
        for (let i = 0; i < 10000; i++) {{
          if (S.deriveFromInputs({{i}}) === 0) {{ anyZero = true; break; }}
        }}
        console.log(JSON.stringify({{ anyZero }}));
    """)
    assert out["anyZero"] is False


def test_embedInExport_adds_seed_and_source():
    out = _run_node(f"""
        const S = require({json.dumps(str(MODULE))});
        const result = {{ effect: 0.42, ci: [0.10, 0.74] }};
        const out = S.embedInExport(result, 12345, 'user');
        console.log(JSON.stringify(out));
    """)
    assert out == {"effect": 0.42, "ci": [0.10, 0.74], "seed": 12345, "seedSource": "user"}


def test_embedInExport_wraps_non_object_results():
    """If the result is an array or primitive, embedInExport wraps it in
    {result: ..., seed, seedSource} rather than trying to mutate it."""
    out = _run_node(f"""
        const S = require({json.dumps(str(MODULE))});
        const o = S.embedInExport([1, 2, 3], 7, 'auto');
        console.log(JSON.stringify(o));
    """)
    assert out["result"] == [1, 2, 3]
    assert out["seed"] == 7
    assert out["seedSource"] == "auto"


def test_embedInExport_handles_null_seed():
    out = _run_node(f"""
        const S = require({json.dumps(str(MODULE))});
        const o = S.embedInExport({{x: 1}}, null, 'auto');
        console.log(JSON.stringify(o));
    """)
    assert out["seed"] is None
    assert out["seedSource"] == "auto"


def test_fnv1a32_known_values():
    """FNV-1a is a well-known hash with stable test vectors; if we drift away
    from the standard, deterministic seeding across deploys breaks."""
    out = _run_node(f"""
        const S = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify({{
          empty: S._fnv1a32(""),
          a: S._fnv1a32("a"),
          foobar: S._fnv1a32("foobar"),
        }}));
    """)
    # Standard FNV-1a 32-bit reference values:
    assert out["empty"] == 0x811c9dc5
    assert out["a"] == 0xe40c292c
    assert out["foobar"] == 0xbf9cf968
