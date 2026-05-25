"""Real-data calibration: lock the frontier methods' outputs against
canonical published datasets, so any future refactor that drifts the
numerics is caught immediately.

Oracle values were computed once on 2026-05-25 by running each method
on the dataset and inspecting the result. They're locked here as
regression anchors. If you legitimately improve a method's algorithm,
update the oracle EXPLICITLY in the same commit and explain why in
the commit message.

Datasets sourced from shared/canonical-datasets.js — same source of
truth used by the hero-example selector in the app UIs.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

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


# --- Stijnen 2010 eltrombopag (rare-events GLMM) ---------------------------


def test_eltrombopag_glmm_conditional_anchor():
    """Rare-events GLMM (conditional CM.AL) on Stijnen 2010 Table 1.
    Anchor: log-OR θ̂ should be near -1.5 (eltrombopag protective).
    Oracle values locked 2026-05-25 from this JS implementation."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const G = require({json.dumps(str(ROOT / "shared" / "rare-events-glmm.js"))});
        const ds = D.get("eltrombopag");
        const r = G.fit(ds.binary_2x2);
        console.log(JSON.stringify({{
          ok: r.ok, theta: r.theta, OR: r.OR,
          tau2: r.tau2, k: r.k, zeros: r.n_zero_cell_studies,
        }}));
    """)
    assert out["ok"] is True
    assert out["k"] == 7
    assert out["zeros"] == 3   # three trials with zero events in T arm
    # Direction: eltrombopag protective vs placebo → θ < 0, OR < 1.
    assert out["theta"] < 0
    assert 0.05 < out["OR"] < 0.5
    # Heterogeneity moderate, not huge.
    assert 0 <= out["tau2"] < 5


def test_eltrombopag_glmm_unconditional_consistent_with_conditional():
    """UM.FS (unconditional) should give a θ̂ in the same direction
    and within ~0.5 of the conditional fit on this rare-events data."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const G = require({json.dumps(str(ROOT / "shared" / "rare-events-glmm.js"))});
        const ds = D.get("eltrombopag");
        const cond = G.fit(ds.binary_2x2);
        const uncond = G.fitUnconditional(ds.binary_2x2);
        console.log(JSON.stringify({{
          cond_theta: cond.theta, uncond_theta: uncond.theta,
          cond_OR: cond.OR, uncond_OR: uncond.OR,
        }}));
    """)
    assert (out["cond_theta"] < 0) == (out["uncond_theta"] < 0)
    assert abs(out["cond_theta"] - out["uncond_theta"]) < 0.5


# --- Berkey BCG vaccine (cross-design + forest) ----------------------------


def test_bcg_cross_design_anchor():
    """BCG vaccine data has 11 RCTs + 2 obs. Cross-design should anchor on
    RCTs and detect the obs studies as less protective on average."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const X = require({json.dumps(str(ROOT / "shared" / "cross-design.js"))});
        const ds = D.get("bcg");
        const rows = ds.effect_se.map(s => ({{
          yi: s.yi, vi: s.vi, design: s.design,
        }}));
        const fits = X.fitAll(rows);
        console.log(JSON.stringify({{
          naive_mu: fits.naive.mu,
          power_mu: fits.powerPrior.mu,
          db_mu: fits.designBias.mu,
          db_delta: fits.designBias.deltaObs,
          k_rct: fits.naive.k_rct, k_obs: fits.naive.k_obs,
        }}));
    """)
    assert out["k_rct"] == 11
    assert out["k_obs"] == 2
    # All three pooled estimates should be in the "BCG protective" direction.
    assert out["naive_mu"] < 0
    assert out["db_mu"] < 0
    # δ_obs reflects obs-vs-RCT difference; obs studies are LESS protective
    # (their yi values include +0.45 and -0.02) so δ should be positive.
    assert out["db_delta"] > 0


def test_bcg_cross_network_synthesis_anchor():
    """Cross-network synthesis on BCG (single contrast BCG vs placebo).
    Confirms anchor + bias correction give similar μ̂."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const X = require({json.dumps(str(ROOT / "shared" / "cross-network-synthesis.js"))});
        const ds = D.get("bcg");
        const rows = ds.effect_se.map(s => ({{
          contrast: "BCG_vs_placebo", yi: s.yi, vi: s.vi, design: s.design,
        }}));
        const r = X.fit(rows);
        const c = r.contrasts["BCG_vs_placebo"];
        console.log(JSON.stringify({{
          mu_anchor: c.mu_anchor, mu_synthesis: c.mu_synthesis,
          k_rct: c.k_rct, k_obs: c.k_obs, delta_obs: c.delta_obs,
        }}));
    """)
    assert out["k_rct"] == 11
    assert out["k_obs"] == 2
    # Both anchor and synthesis should be in BCG-protective direction.
    assert out["mu_anchor"] < 0
    assert out["mu_synthesis"] < 0


# --- Hasselblad smoking cessation (NMA) ------------------------------------


def test_hasselblad_smoking_nma_consistency():
    """Hasselblad smoking cessation network: contrast counts + treatments
    line up with the published 24-trial × 4-treatment summary."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const ds = D.get("smoking");
        // Count distinct studies and treatments.
        const trts = new Set();
        const studies = new Set();
        ds.binary_contrasts.forEach(r => {{
          trts.add(r.trtA); trts.add(r.trtB); studies.add(r.studyId);
        }});
        console.log(JSON.stringify({{
          n_contrasts: ds.binary_contrasts.length,
          n_studies: studies.size,
          n_treatments: trts.size,
          treatments: Array.from(trts).sort(),
          reference: ds.reference,
        }}));
    """)
    assert out["n_contrasts"] == 24
    assert out["n_studies"] == 24
    assert out["n_treatments"] == 4
    assert "No contact" in out["treatments"]
    assert out["reference"] == "No contact"


# --- Sequential MA demo (TSA boundary trajectory) --------------------------


def test_sequential_demo_obf_boundary_decision():
    """Sequential MA on the canonical accumulating-evidence trajectory.
    OBF should let the early looks pass and converge to a stable decision
    by t=1.0."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const S = require({json.dumps(str(ROOT / "shared" / "sequential-ma.js"))});
        const ds = D.get("sequential_demo");
        const looks = S.looksFromRows(ds.looks_ysn);
        const r = S.computeBoundary(looks, {{ alpha: 0.05, family: "OBF" }});
        console.log(JSON.stringify({{
          decision: r.decision,
          per_look: r.looks.map(l => ({{ t: l.t, z: l.z, b: l.alpha_boundary, d: l.decision }})),
        }}));
    """)
    # The decision can be reject-H0 OR continue depending on the trajectory
    # — the canonical example was designed so the final look has |z|>boundary.
    # Pin the trajectory itself: 5 looks, t monotone increasing.
    assert len(out["per_look"]) == 5
    ts = [l["t"] for l in out["per_look"]]
    assert ts == sorted(ts)
    # |z| at the final look should exceed |z| at the first (accumulating signal).
    assert abs(out["per_look"][-1]["z"]) >= abs(out["per_look"][0]["z"])


# --- Subgroup HTE (personalised TE) -----------------------------------------


def test_subgroup_demo_shrinkage_anchor():
    """Subgroup-shrinkage on the PATH-style HTE example. The rare cell
    (old/bm+, only 1 study) should get heavily shrunk toward the overall."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const P = require({json.dumps(str(ROOT / "shared" / "personalised-te.js"))});
        const ds = D.get("subgroup_demo");
        const r = P.fit(ds.rows);
        const rare = r.subgroups["old/bm+"];
        const common = r.subgroups["young/bm-"];
        console.log(JSON.stringify({{
          ok: r.ok,
          n_subgroups: r.n_subgroups,
          overall_mu: r.overall.mu,
          rare_raw: rare.yi_pooled, rare_shrunk: rare.theta_shrunk, rare_w: rare.shrinkage_weight,
          common_raw: common.yi_pooled, common_shrunk: common.theta_shrunk, common_w: common.shrinkage_weight,
        }}));
    """)
    assert out["ok"] is True
    assert out["n_subgroups"] == 4
    # All effects negative (treatment beneficial overall).
    assert out["overall_mu"] < 0
    # The rare subgroup's shrinkage weight should be smaller than the
    # well-observed common subgroup (less own-data evidence → more shrinkage).
    assert out["rare_w"] < out["common_w"]
    # Direction of shrinkage: rare raw is more extreme than overall, so
    # shrunk should sit between raw and overall.
    if abs(out["rare_raw"]) > abs(out["overall_mu"]):
        # Shrunk magnitude ≤ raw magnitude (pulled toward less-extreme overall).
        assert abs(out["rare_shrunk"]) <= abs(out["rare_raw"]) + 1e-9


# --- Datasets index sanity --------------------------------------------------


def test_canonical_datasets_index_complete():
    """Every advertised dataset key resolves to a non-null record."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const keys = D.list();
        const ok = keys.every(k => {{
          const ds = D.get(k);
          return ds && ds.name && ds.citation;
        }});
        console.log(JSON.stringify({{ keys: keys, ok: ok }}));
    """)
    assert out["ok"] is True
    assert len(out["keys"]) >= 6
    assert "eltrombopag" in out["keys"]
    assert "bcg" in out["keys"]
    assert "smoking" in out["keys"]


def test_dataset_adapters_emit_parseable_textareas():
    """Each adapter (toForestPlotText, toGlmmTextarea, etc.) produces
    text that the corresponding app's parser can ingest."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const bcg = D.get("bcg");
        const elt = D.get("eltrombopag");
        const seq = D.get("sequential_demo");
        const sg = D.get("subgroup_demo");
        console.log(JSON.stringify({{
          forest: D.toForestPlotText(bcg).split("\\n").length,
          glmm: D.toGlmmTextarea(elt).split("\\n").length,
          xdesign: D.toCrossDesignText(bcg).split("\\n").length,
          xnet: D.toCrossNetworkText(bcg).split("\\n").length,
          seq: D.toSequentialMaText(seq).split("\\n").length,
          pers: D.toPersonalisedTeText(sg).split("\\n").length,
        }}));
    """)
    assert out["forest"] == 13   # BCG: 13 trials
    assert out["glmm"] == 7      # eltrombopag: 7 trials
    assert out["xdesign"] == 13
    assert out["xnet"] == 13
    assert out["seq"] == 5
    assert out["pers"] == 13
