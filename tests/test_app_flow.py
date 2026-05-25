"""Tests for shared/app-flow.js — cross-app deep-link unification."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "app-flow.js"

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


def test_catalog_contains_all_major_apps():
    """Every numerical app the suite ships should be in the flow catalog —
    otherwise its 'Continue with' buttons won't render."""
    out = _run_node(f"""
        const F = require({json.dumps(str(MODULE))});
        const keys = F.list();
        const required = ["forest-plot", "funnel-plot", "heterogeneity",
                          "meta-regression", "bma-tau-priors", "rve-meta",
                          "cross-design", "cross-network", "everything-model",
                          "sequential-ma", "personalised-te",
                          "multi-outcome-ma", "multi-outcome-nma",
                          "nma", "nma-pro-v2", "bayesian-nma",
                          "rare-events-glmm", "webr-validator"];
        const missing = required.filter(k => !keys.includes(k));
        console.log(JSON.stringify({{ n: keys.length, missing: missing }}));
    """)
    assert out["missing"] == [], f"missing apps from flow catalog: {out['missing']}"
    assert out["n"] >= 30


def test_each_entry_has_required_fields():
    out = _run_node(f"""
        const F = require({json.dumps(str(MODULE))});
        const bad = [];
        for (const key of F.list()) {{
          const e = F.get(key);
          if (!e.label || !e.category || !e.path || !e.kind) bad.push(key);
        }}
        console.log(JSON.stringify(bad));
    """)
    assert out == [], f"entries missing required fields: {out}"


def test_byCategory_groups_correctly():
    out = _run_node(f"""
        const F = require({json.dumps(str(MODULE))});
        const pairwise = F.byCategory("Pairwise MA").map(e => e.key);
        const nma = F.byCategory("Network MA").map(e => e.key);
        console.log(JSON.stringify({{ pairwise: pairwise, nma: nma }}));
    """)
    assert "forest-plot" in out["pairwise"]
    assert "rve-meta" in out["pairwise"]
    assert "nma-pro-v2" in out["nma"]
    assert "bucher" in out["nma"]


def test_standard_lists_reference_valid_keys():
    out = _run_node(f"""
        const F = require({json.dumps(str(MODULE))});
        const all = [...F.STANDARD_PAIRWISE, ...F.STANDARD_NMA, ...F.STANDARD_TSA];
        const bad = all.filter(k => !F.get(k));
        console.log(JSON.stringify({{ bad: bad, n: all.length }}));
    """)
    assert out["bad"] == [], f"STANDARD_* lists reference unknown apps: {out['bad']}"
    assert out["n"] >= 10


def test_kind_values_are_canonical():
    """Each entry.kind must be one of the documented vocabulary values."""
    out = _run_node(f"""
        const F = require({json.dumps(str(MODULE))});
        const allowed = new Set(["pairwise", "comparisons", "either", "no-bus"]);
        const bad = [];
        for (const key of F.list()) {{
          const e = F.get(key);
          if (!allowed.has(e.kind)) bad.push({{ key: key, kind: e.kind }});
        }}
        console.log(JSON.stringify(bad));
    """)
    assert out == [], f"non-canonical kind values: {out}"


def test_paths_resolve_to_existing_app_directories():
    """Each path in the catalog should resolve to an app dir that has an index.html."""
    # Read the catalog once, then check each entry's path back to the filesystem.
    out = _run_node(f"""
        const F = require({json.dumps(str(MODULE))});
        const entries = F.list().map(k => ({{ key: k, path: F.get(k).path }}));
        console.log(JSON.stringify(entries));
    """)
    missing = []
    for entry in out:
        # Strip leading "../" and query string.
        p = entry["path"].split("?")[0].replace("../", "")
        candidate = ROOT / p
        if candidate.is_dir():
            if not (candidate / "index.html").is_file():
                missing.append(entry["key"])
        elif candidate.is_file():
            continue   # full path like nma-pro-v2/nma-pro-v8.0.html
        else:
            # Try as index.html directly.
            if not (ROOT / p / "index.html").is_file():
                missing.append(entry["key"])
    assert missing == [], f"catalog paths don't resolve: {missing}"
