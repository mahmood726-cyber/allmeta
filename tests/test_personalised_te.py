"""Tests for shared/personalised-te.js — empirical Bayes subgroup shrinkage."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "personalised-te.js"

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


def test_fit_basic_two_subgroups():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ study: "S1", subgroup: "young", yi: -0.30, vi: 0.020 }},
          {{ study: "S2", subgroup: "young", yi: -0.25, vi: 0.025 }},
          {{ study: "S3", subgroup: "young", yi: -0.40, vi: 0.018 }},
          {{ study: "S1", subgroup: "old",   yi: -0.55, vi: 0.020 }},
          {{ study: "S2", subgroup: "old",   yi: -0.50, vi: 0.025 }},
          {{ study: "S3", subgroup: "old",   yi: -0.60, vi: 0.018 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{
          ok: r.ok,
          n_subgroups: r.n_subgroups,
          overall_mu: r.overall.mu,
          young_raw: r.subgroups.young.yi_pooled,
          young_shrunk: r.subgroups.young.theta_shrunk,
          old_raw: r.subgroups.old.yi_pooled,
          old_shrunk: r.subgroups.old.theta_shrunk,
          sigma2_between: r.sigma2_between,
          shrinkage_w_young: r.subgroups.young.shrinkage_weight,
        }}));
    """)
    assert out["ok"] is True
    assert out["n_subgroups"] == 2
    # Raw young/old should differ in the direction of the data (young ≈ -0.32, old ≈ -0.55).
    assert -0.40 < out["young_raw"] < -0.20
    assert -0.65 < out["old_raw"] < -0.40
    # Shrinkage pulls both subgroup estimates toward the overall mean.
    # Overall is between young (-0.32) and old (-0.55), so:
    #   young_shrunk ≤ young_raw (pulled toward more-negative overall),
    #   old_shrunk   ≥ old_raw   (pulled toward less-negative overall).
    assert out["young_shrunk"] <= out["young_raw"] + 0.01
    assert out["old_shrunk"]   >= out["old_raw"] - 0.01
    # σ² between is > 0 (subgroups differ).
    assert out["sigma2_between"] > 0


def test_no_between_subgroup_variability_shrinks_to_zero_weight():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        // All subgroups have effectively the same pooled effect → σ²_between = 0
        // → shrinkage weight = 0 → all subgroup estimates collapse to the overall.
        const rows = [
          {{ study: "S1", subgroup: "A", yi: -0.30, vi: 0.020 }},
          {{ study: "S2", subgroup: "A", yi: -0.30, vi: 0.025 }},
          {{ study: "S1", subgroup: "B", yi: -0.30, vi: 0.020 }},
          {{ study: "S2", subgroup: "B", yi: -0.30, vi: 0.025 }},
          {{ study: "S1", subgroup: "C", yi: -0.30, vi: 0.020 }},
          {{ study: "S2", subgroup: "C", yi: -0.30, vi: 0.025 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{
          sigma2: r.sigma2_between,
          shrunk_A: r.subgroups.A.theta_shrunk,
          shrunk_B: r.subgroups.B.theta_shrunk,
          shrunk_C: r.subgroups.C.theta_shrunk,
          weight_A: r.subgroups.A.shrinkage_weight,
        }}));
    """)
    # σ² ≈ 0 → all subgroup shrinkage estimates equal the overall.
    assert out["sigma2"] < 0.01
    assert abs(out["shrunk_A"] - out["shrunk_B"]) < 0.05
    assert abs(out["shrunk_A"] - out["shrunk_C"]) < 0.05
    assert out["weight_A"] < 0.5   # heavy shrinkage to overall


def test_predict_for_observed_subgroup():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ study: "S1", subgroup: "young", yi: -0.30, vi: 0.020 }},
          {{ study: "S2", subgroup: "young", yi: -0.32, vi: 0.025 }},
          {{ study: "S1", subgroup: "old",   yi: -0.55, vi: 0.020 }},
          {{ study: "S2", subgroup: "old",   yi: -0.50, vi: 0.025 }},
        ];
        const fit = M.fit(rows);
        const pred = M.predict(fit, "young");
        console.log(JSON.stringify(pred));
    """)
    assert out["basis"] == "subgroup-shrunk"
    assert -0.45 < out["estimate"] < -0.15


def test_predict_for_unobserved_subgroup_falls_back_to_overall():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ study: "S1", subgroup: "young", yi: -0.30, vi: 0.020 }},
          {{ study: "S2", subgroup: "young", yi: -0.32, vi: 0.025 }},
          {{ study: "S1", subgroup: "old",   yi: -0.55, vi: 0.020 }},
        ];
        const fit = M.fit(rows);
        const pred = M.predict(fit, "middle_age");   // not observed
        console.log(JSON.stringify(pred));
    """)
    assert out["basis"] == "overall-fallback"


def test_singleton_subgroup_gets_heavy_shrinkage():
    # A subgroup with only 1 study (high se) should be shrunk strongly
    # toward the overall mean.
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const rows = [
          {{ study: "S1", subgroup: "common", yi: -0.30, vi: 0.005 }},
          {{ study: "S2", subgroup: "common", yi: -0.32, vi: 0.005 }},
          {{ study: "S3", subgroup: "common", yi: -0.28, vi: 0.005 }},
          {{ study: "S4", subgroup: "common", yi: -0.31, vi: 0.005 }},
          {{ study: "S1", subgroup: "rare",   yi:  0.80, vi: 0.40 }},
        ];
        const r = M.fit(rows);
        console.log(JSON.stringify({{
          rare_raw: r.subgroups.rare.yi_pooled,
          rare_shrunk: r.subgroups.rare.theta_shrunk,
          overall_mu: r.overall.mu,
          w_rare: r.subgroups.rare.shrinkage_weight,
        }}));
    """)
    # Rare subgroup raw estimate is +0.80; should be substantially shrunk
    # toward the much-more-precisely-estimated overall (≈ -0.3). With the
    # high vi=0.40 vs the common's vi=0.005, the shrinkage weight w =
    # σ²_between/(σ²_between + se_pool²) is small but not microscopic
    # because σ²_between is large (the rare obs is an outlier). The
    # shrinkage drops it from +0.8 to somewhere below +0.6.
    assert out["rare_raw"] > 0.5
    assert out["rare_shrunk"] < out["rare_raw"] - 0.2
    # Direction check: shrunk is more negative than raw (toward overall < 0).
    assert out["rare_shrunk"] < out["rare_raw"]


def test_fit_rejects_too_few_rows():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.fit([{{ study: "S1", subgroup: "X", yi: 0, vi: 0.01 }}]);
        console.log(JSON.stringify(r));
    """)
    assert out["ok"] is False
