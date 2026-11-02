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


# --- Nissen & Wolski 2007 rosiglitazone MI (rare-events GLMM) --------------
#
# Replaced 2026-11-02. The former example "Eltrombopag (Stijnen 2010)" was
# unsourced: Stijnen, Hamza & Ozdemir 2010 (Stat Med 29:3046-3067) analyse the
# Niel-Weise catheter data (metadat dat.nielweise2007 / dat.nielweise2008), not
# eltrombopag, and the rows named trials published after 2010 (one of them a
# single-arm extension with no placebo arm). Its anchors were "locked from this
# JS implementation", i.e. self-referential. The example is now metadat
# dat.nissen2007 (myocardial infarction counts) and every number below comes
# from R: hub/shared/tests/fixtures/hero-nissen2007-reference.R -> .out / -rows.json
# (R 4.6.0, metafor 5.2.1, metadat 1.6.0).

FIXTURES = ROOT / "hub" / "shared" / "tests" / "fixtures"
# The app's existing GLMM parity tolerance: Playwright toBeCloseTo(x, 4) in
# hub/shared/tests/rare-events-glmm-parity.spec.mjs, i.e. |diff| < 5e-5.
GLMM_TOL = 5e-5


def _r_glmm_reference() -> dict:
    """Parse hero-nissen2007-reference.out into {(model, drop00): {field: value}}."""
    ref = {}
    text = (FIXTURES / "hero-nissen2007-reference.out").read_text(encoding="utf-8")
    for line in text.splitlines():
        parts = line.split()
        if not parts or parts[0] not in ("UM.FS", "CM.AL"):
            continue
        fields = dict(p.split("=", 1) for p in parts[1:])
        key = (parts[0], fields.pop("drop00"))
        ref[key] = {k: float(v) for k, v in fields.items()}
    assert ("UM.FS", "TRUE") in ref and ("UM.FS", "FALSE") in ref, ref
    return ref


def _metadat_rows() -> list:
    return json.loads((FIXTURES / "hero-nissen2007-rows.json").read_text(encoding="utf-8"))


def _assert_matches_r(app: dict, r: dict) -> None:
    for app_key, r_key in (("theta", "theta"), ("se_theta", "se"), ("OR", "OR"),
                           ("OR_lo", "OR_lo"), ("OR_hi", "OR_hi")):
        assert abs(app[app_key] - r[r_key]) < GLMM_TOL, (
            f"{app_key}: app {app[app_key]!r} vs metafor {r[r_key]!r} "
            f"(diff {app[app_key] - r[r_key]:.3e}, tolerance {GLMM_TOL})")
    assert r["tau2"] == 0.0 and app["tau2"] < 1e-4   # metafor: tau^2 = 0 at the optimum


def test_rare_events_example_is_metadat_nissen2007_row_for_row():
    """The glmm one-click example is metadat::dat.nissen2007 (MI), every row in order."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const H = require({json.dumps(str(ROOT / "shared" / "hero-examples.js"))});
        const key = H.MANIFESTS.glmm[0].key;
        const ds = D.get(key);
        console.log(JSON.stringify({{ key: key, name: ds && ds.name, citation: ds && ds.citation,
          measure: ds && ds.measure, rows: ds && ds.binary_2x2 }}));
    """)
    assert out["key"] == "nissen2007"
    assert out["measure"] == "OR"
    assert "Nissen" in out["name"] and "Nissen" in out["citation"]
    assert "dat.nissen2007" in out["citation"]
    rows = [{k: r[k] for k in ("label", "events_T", "n_T", "events_C", "n_C")} for r in out["rows"]]
    assert rows == _metadat_rows()
    assert len(rows) == 42


def test_nissen2007_glmm_umfs_matches_metafor_on_its_analysis_set():
    """Rewritten 2026-11-02 (was a self-referential CM.AL anchor on the unsourced
    eltrombopag rows). The app's documented default estimator, UM.FS (ML), must equal
    metafor::rma.glmm(measure="OR", model="UM.FS") on the 38 studies metafor fits
    (its default drop00=TRUE removes the 4 studies with no events in either arm)."""
    ref = _r_glmm_reference()[("UM.FS", "TRUE")]
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const G = require({json.dumps(str(ROOT / "shared" / "rare-events-glmm.js"))});
        const rows = D.get("nissen2007").binary_2x2.filter(r => !(r.events_T === 0 && r.events_C === 0));
        const r = G.fitUnconditional(rows);
        console.log(JSON.stringify(r));
    """)
    assert out["ok"] is True
    assert out["model"] == "UM.FS"
    assert out["k"] == int(ref["k"]) == 38
    _assert_matches_r(out, ref)


@pytest.mark.xfail(strict=True, reason=(
    "Known engine defect, reported 2026-11-02, fix needs Mahmood's decision because it changes "
    "served numbers: fitUnconditional keeps studies with no events in either arm and profiles "
    "their baseline only within seed+/-4, so they still pull theta (app 0.35279 vs metafor "
    "0.35535 with or without drop00). The one-click example serves all 42 rows."))
def test_nissen2007_glmm_served_rows_match_metafor():
    """Rewritten 2026-11-02 (was a self-referential UM.FS-vs-CM.AL consistency check).
    What the page serves after the one-click load (all 42 rows, including the 4
    double-zero studies) must equal metafor UM.FS, which gives the same estimate
    whether those studies are dropped or kept (drop00=FALSE, k=42)."""
    ref = _r_glmm_reference()[("UM.FS", "FALSE")]
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const G = require({json.dumps(str(ROOT / "shared" / "rare-events-glmm.js"))});
        const r = G.fitUnconditional(D.get("nissen2007").binary_2x2);
        console.log(JSON.stringify(r));
    """)
    assert out["ok"] is True
    _assert_matches_r(out, ref)


def test_no_unsourced_eltrombopag_example_remains():
    """The unsourced example must not come back as data."""
    for rel in ("shared/canonical-datasets.js", "shared/hero-examples.js"):
        text = (ROOT / rel).read_text(encoding="utf-8").lower()
        assert "eltrombopag" not in text, rel
        assert "tra-100773" not in text, rel


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
    assert "nissen2007" in out["keys"]
    assert "eltrombopag" not in out["keys"]
    assert "bcg" in out["keys"]
    assert "smoking" in out["keys"]


def test_dataset_adapters_emit_parseable_textareas():
    """Each adapter (toForestPlotText, toGlmmTextarea, etc.) produces
    text that the corresponding app's parser can ingest."""
    out = _run_node(f"""
        const D = require({json.dumps(str(ROOT / "shared" / "canonical-datasets.js"))});
        const bcg = D.get("bcg");
        const mi = D.get("nissen2007");
        const seq = D.get("sequential_demo");
        const sg = D.get("subgroup_demo");
        console.log(JSON.stringify({{
          forest: D.toForestPlotText(bcg).split("\\n").length,
          glmm: D.toGlmmTextarea(mi).split("\\n").length,
          xdesign: D.toCrossDesignText(bcg).split("\\n").length,
          xnet: D.toCrossNetworkText(bcg).split("\\n").length,
          seq: D.toSequentialMaText(seq).split("\\n").length,
          pers: D.toPersonalisedTeText(sg).split("\\n").length,
        }}));
    """)
    assert out["forest"] == 13   # BCG: 13 trials
    assert out["glmm"] == 42     # Nissen & Wolski 2007: 42 trials
    assert out["xdesign"] == 13
    assert out["xnet"] == 13
    assert out["seq"] == 5
    assert out["pers"] == 13
