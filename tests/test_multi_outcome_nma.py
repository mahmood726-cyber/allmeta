"""Tests for shared/multi-outcome-nma.js — Achana 2014 §3.2 multi-arm × multi-outcome NMA."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "multi-outcome-nma.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> object:
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, text=True, timeout=60, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


def test_buildStudySigma_2arm_2outcome_kronecker_structure():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const SigmaOut = [[0.04, 0.018], [0.018, 0.025]];   // τ²₁, ρ τ₁τ₂, τ²₂
        const S = M.buildStudySigma(1, 2, SigmaOut);        // 1 contrast × 2 outcomes
        // 2×2: diag = τ²; off-diag = ρ·τ₁·τ₂ (G_arm = [[1]] for 1 contrast)
        console.log(JSON.stringify(S));
    """)
    # 1 contrast × 2 outcomes → 2×2; equals SigmaOut directly (G is 1×1=[[1]]).
    assert out[0][0] == 0.04
    assert out[0][1] == 0.018
    assert out[1][1] == 0.025


def test_buildStudySigma_3arm_2outcome_blocks():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const SigmaOut = [[0.04, 0], [0, 0.025]];   // independent outcomes
        const S = M.buildStudySigma(2, 2, SigmaOut); // 2 contrasts × 2 outcomes = 4×4
        // Block (a, b) is G[a][b] × SigmaOut. G = [[1, 0.5], [0.5, 1]].
        // Off-block (a=0, b=1) at outcome 0: G[0][1] * τ²₁ = 0.5 * 0.04 = 0.02
        console.log(JSON.stringify({{
          shape: S.length,
          diag_00: S[0][0],   // a=0, o=0: G[0][0]*τ²₁ = 0.04
          off_arm_00: S[0][2], // a=0,o=0 vs a=1,o=0: 0.5*0.04 = 0.02
          cross_outcome: S[0][1],  // a=0,o=0 vs a=0,o=1: G[0][0]*0 = 0 (independent)
        }}));
    """)
    assert out["shape"] == 4
    assert abs(out["diag_00"] - 0.04) < 1e-9
    assert abs(out["off_arm_00"] - 0.02) < 1e-9
    assert abs(out["cross_outcome"]) < 1e-9


def test_fit_simple_2treatment_2outcome_network():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const studies = [
          {{ id: "S1", contrasts: [{{ trtA: "A", trtB: "B",
             outcomes: [{{yi: -0.30, sei: 0.10}}, {{yi: -0.35, sei: 0.12}}] }}] }},
          {{ id: "S2", contrasts: [{{ trtA: "A", trtB: "B",
             outcomes: [{{yi: -0.25, sei: 0.11}}, {{yi: -0.32, sei: 0.13}}] }}] }},
          {{ id: "S3", contrasts: [{{ trtA: "A", trtB: "B",
             outcomes: [{{yi: -0.42, sei: 0.15}}, {{yi: -0.50, sei: 0.18}}] }}] }},
          {{ id: "S4", contrasts: [{{ trtA: "A", trtB: "B",
             outcomes: [{{yi: -0.18, sei: 0.09}}, {{yi: -0.22, sei: 0.10}}] }}] }},
        ];
        const fit = M.fit(studies, ["A", "B"], {{ K: 2 }});
        console.log(JSON.stringify({{
          ok: fit.ok,
          K: fit.K,
          eff_B_o0: fit.effects[0].B.estimate,
          eff_B_o1: fit.effects[1].B.estimate,
          se_B_o0: fit.effects[0].B.se,
          n_studies: fit.n_studies,
        }}));
    """)
    assert out["ok"] is True
    assert out["K"] == 2
    assert out["n_studies"] == 4
    # Effects should be in the ballpark of the input means (around -0.3 and -0.35).
    assert -0.45 < out["eff_B_o0"] < -0.15
    assert -0.50 < out["eff_B_o1"] < -0.20
    assert out["se_B_o0"] > 0


def test_fit_3treatment_network_with_2outcomes():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const studies = [
          {{ id: "S1", contrasts: [{{ trtA: "A", trtB: "B",
             outcomes: [{{yi: -0.30, sei: 0.10}}, {{yi: -0.35, sei: 0.12}}] }}] }},
          {{ id: "S2", contrasts: [{{ trtA: "A", trtB: "C",
             outcomes: [{{yi: -0.45, sei: 0.12}}, {{yi: -0.50, sei: 0.15}}] }}] }},
          {{ id: "S3", contrasts: [{{ trtA: "B", trtB: "C",
             outcomes: [{{yi: -0.15, sei: 0.11}}, {{yi: -0.18, sei: 0.13}}] }}] }},
          {{ id: "S4", contrasts: [{{ trtA: "A", trtB: "B",
             outcomes: [{{yi: -0.28, sei: 0.10}}, {{yi: -0.33, sei: 0.11}}] }}] }},
        ];
        const fit = M.fit(studies, ["A", "B", "C"], {{ K: 2 }});
        console.log(JSON.stringify({{
          ok: fit.ok,
          eff_B_o0: fit.effects[0].B.estimate,
          eff_C_o0: fit.effects[0].C.estimate,
          eff_B_o1: fit.effects[1].B.estimate,
          eff_C_o1: fit.effects[1].C.estimate,
        }}));
    """)
    assert out["ok"] is True
    # B vs A and C vs A should both be negative (treatment effects in the example).
    assert out["eff_B_o0"] < 0
    assert out["eff_C_o0"] < 0
    assert out["eff_B_o1"] < 0
    assert out["eff_C_o1"] < 0


def test_fit_handles_missing_outcome_per_study():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const studies = [
          {{ id: "S1", contrasts: [{{ trtA: "A", trtB: "B",
             outcomes: [{{yi: -0.30, sei: 0.10}}, {{yi: -0.35, sei: 0.12}}] }}] }},
          {{ id: "S2", contrasts: [{{ trtA: "A", trtB: "B",
             outcomes: [{{yi: -0.25, sei: 0.11}}, {{yi: NaN, sei: NaN}}] }}] }},  // outcome 2 missing
          {{ id: "S3", contrasts: [{{ trtA: "A", trtB: "B",
             outcomes: [{{yi: -0.42, sei: 0.15}}, {{yi: -0.50, sei: 0.18}}] }}] }},
          {{ id: "S4", contrasts: [{{ trtA: "A", trtB: "B",
             outcomes: [{{yi: -0.18, sei: 0.09}}, {{yi: -0.22, sei: 0.10}}] }}] }},
        ];
        const fit = M.fit(studies, ["A", "B"], {{ K: 2 }});
        console.log(JSON.stringify({{
          ok: fit.ok,
          se_o0: fit.effects[0].B.se,
          se_o1: fit.effects[1].B.se,
          se_o0_finite: isFinite(fit.effects[0].B.se),
          se_o1_finite: isFinite(fit.effects[1].B.se),
        }}));
    """)
    assert out["ok"] is True
    assert out["se_o0_finite"] and out["se_o1_finite"]
    assert out["se_o0"] > 0 and out["se_o1"] > 0
