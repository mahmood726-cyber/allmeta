"""Pytest harness for `shared/ma-comparisons-v1.js`.

Runs the JS module under Node and asserts the contract documented in
`shared/ma-comparisons-v1.md`. Mirrors test_ma_studies_v1.py patterns.

Covers:
- Envelope validation (good payload, bad _schema, wrong effectMeasure)
- Per-arm validation by effectMeasure (binary needs events+n; continuous needs mean+sd)
- Multi-arm detection via shared study id
- buildEnvelope drops studies with <2 arms or arms missing required fields
- fromBinaryTriplets groups rows by name → multi-arm studies
- Round-trip: fromBinaryTriplets → toNmaProStudies → fromBinaryTriplets stable
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "ma-comparisons-v1.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> dict:
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


# --- Validation ---------------------------------------------------------------


def test_validate_accepts_good_binary_envelope():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "T1", arms: [
            {{ treatment: "A", events: 10, n: 100 }},
            {{ treatment: "B", events: 22, n: 100 }}
          ]}}
        ], "OR");
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out == {"ok": True, "errors": []}


def test_validate_rejects_wrong_schema():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = {{ _schema: "wrong", _savedAt: "x", effectMeasure: "OR", studies: [] }};
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out["ok"] is False
    assert any("_schema" in e for e in out["errors"])


def test_validate_rejects_mixed_or_bad_effect_measure():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "T1", arms: [{{ treatment: "A", events: 1, n: 10 }}, {{ treatment: "B", events: 2, n: 10 }}] }}
        ], "NotARealMeasure");
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out["ok"] is False
    assert any("effectMeasure" in e for e in out["errors"])


# --- Per-arm validation -------------------------------------------------------


def test_binary_arm_needs_events_and_n():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = {{
          _schema: "ma-comparisons-v1", _savedAt: new Date().toISOString(),
          effectMeasure: "OR",
          studies: [{{ id: "T", arms: [
            {{ treatment: "A", events: 5 }},               // missing n
            {{ treatment: "B", events: 7, n: 50 }}
          ]}}]
        }};
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out["ok"] is False
    assert any("n" in e for e in out["errors"])


def test_continuous_arm_needs_mean_and_sd():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = {{
          _schema: "ma-comparisons-v1", _savedAt: new Date().toISOString(),
          effectMeasure: "SMD",
          studies: [{{ id: "T", arms: [
            {{ treatment: "A", mean: 1.0, sd: 0.5 }},
            {{ treatment: "B", mean: 0.7 }}                // missing sd
          ]}}]
        }};
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out["ok"] is False
    assert any("sd" in e for e in out["errors"])


def test_arm_with_events_exceeding_n_is_flagged():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = {{
          _schema: "ma-comparisons-v1", _savedAt: new Date().toISOString(),
          effectMeasure: "OR",
          studies: [{{ id: "T", arms: [
            {{ treatment: "A", events: 200, n: 100 }},
            {{ treatment: "B", events: 5, n: 100 }}
          ]}}]
        }};
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out["ok"] is False
    assert any("events" in e and "n" in e for e in out["errors"])


# --- buildEnvelope drops invalid studies --------------------------------------


def test_buildEnvelope_drops_studies_with_fewer_than_2_arms():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "good", arms: [
            {{ treatment: "A", events: 5, n: 50 }},
            {{ treatment: "B", events: 8, n: 50 }}
          ]}},
          {{ id: "lonely", arms: [{{ treatment: "X", events: 3, n: 30 }}] }},
        ], "OR");
        console.log(JSON.stringify(env.studies.map(s => s.id)));
    """)
    assert out == ["good"]


def test_buildEnvelope_drops_arms_with_nan_or_nonpositive_n():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "T", arms: [
            {{ treatment: "A", events: 5, n: 50 }},
            {{ treatment: "B", events: 3, n: 0 }},   // dropped (n <= 0)
            {{ treatment: "C", events: Number.NaN, n: 30 }}, // dropped
            {{ treatment: "D", events: 9, n: 60 }}
          ]}}
        ], "OR");
        console.log(JSON.stringify(env.studies[0].arms.map(a => a.treatment)));
    """)
    assert out == ["A", "D"]


# --- fromBinaryTriplets multi-arm detection -----------------------------------


def test_fromBinaryTriplets_groups_rows_by_name_into_multi_arm_study():
    # Three rows with the SAME name => one 3-arm study.
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.fromBinaryTriplets([
          {{ name: "GUSTO-1", treatment1: "SK", events1: 1135, n1: 13780,
                              treatment2: "tPA", events2: 1021, n2: 13746, year: 1993 }},
          {{ name: "GUSTO-1", treatment1: "SK", events1: 1135, n1: 13780,
                              treatment2: "rPA", events2: 50, n2: 1000 }},
          {{ name: "ASSENT-2", treatment1: "TNK", events1: 749, n1: 8461,
                               treatment2: "tPA", events2: 753, n2: 8488, year: 1999 }}
        ], "OR");
        console.log(JSON.stringify({{
          ids: env.studies.map(s => s.id),
          gusto_arms: env.studies.find(s => s.id === "GUSTO-1").arms.map(a => a.treatment),
          assent_arms: env.studies.find(s => s.id === "ASSENT-2").arms.map(a => a.treatment),
          year: env.studies.find(s => s.id === "GUSTO-1").year,
        }}));
    """)
    assert sorted(out["ids"]) == ["ASSENT-2", "GUSTO-1"]
    # GUSTO-1 has SK (dedup'd), tPA, rPA
    assert sorted(out["gusto_arms"]) == ["SK", "rPA", "tPA"]
    assert sorted(out["assent_arms"]) == ["TNK", "tPA"]
    assert out["year"] == 1993


def test_fromBinaryTriplets_dedups_arms_within_study():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        // Same name + same treatment in both pair rows: arm should appear once.
        const env = M.fromBinaryTriplets([
          {{ name: "T1", treatment1: "Drug", events1: 10, n1: 100,
                          treatment2: "Placebo", events2: 5, n2: 100 }},
          {{ name: "T1", treatment1: "Drug", events1: 10, n1: 100,
                          treatment2: "Active", events2: 7, n2: 100 }}
        ], "OR");
        console.log(JSON.stringify(env.studies[0].arms.map(a => a.treatment)));
    """)
    # First row adds Drug + Placebo; second row's Drug is a dup, Active is new.
    assert sorted(out) == ["Active", "Drug", "Placebo"]


# --- toNmaProStudies round-trip -----------------------------------------------


def test_toNmaProStudies_round_trip_preserves_pairs():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env1 = M.fromBinaryTriplets([
          {{ name: "T1", treatment1: "A", events1: 10, n1: 100,
                          treatment2: "B", events2: 12, n2: 100 }},
          {{ name: "T2", treatment1: "A", events1: 8, n1: 100,
                          treatment2: "C", events2: 14, n2: 100 }}
        ], "OR");
        const rows = M.toNmaProStudies(env1);
        const env2 = M.fromBinaryTriplets(rows, "OR");
        console.log(JSON.stringify({{
          rowsLen: rows.length,
          ids: env2.studies.map(s => s.id).sort(),
        }}));
    """)
    assert out["rowsLen"] == 2
    assert out["ids"] == ["T1", "T2"]


def test_toNmaProStudies_emits_all_pairs_for_multi_arm():
    # 3-arm trial => C(3,2) = 3 pairs.
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.fromBinaryTriplets([
          {{ name: "M", treatment1: "A", events1: 10, n1: 100,
                         treatment2: "B", events2: 12, n2: 100 }},
          {{ name: "M", treatment1: "A", events1: 10, n1: 100,
                         treatment2: "C", events2: 14, n2: 100 }}
        ], "OR");
        const rows = M.toNmaProStudies(env);
        console.log(JSON.stringify(rows.map(r => r.treatment1 + "_vs_" + r.treatment2).sort()));
    """)
    # 3 arms (A, B, C) => 3 pairs.
    assert len(out) == 3


# --- merge --------------------------------------------------------------------


def test_buildEnvelope_attaches_effectMeasure():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "T", arms: [
            {{ treatment: "A", events: 5, n: 50 }},
            {{ treatment: "B", events: 8, n: 50 }}
          ]}}
        ], "RR");
        console.log(JSON.stringify({{ em: env.effectMeasure, schema: env._schema }}));
    """)
    assert out["em"] == "RR"
    assert out["schema"] == "ma-comparisons-v1"


# --- toContrasts (arm-level -> pairwise contrast rows) ------------------------
# Added 2026-06-02 for the NMA-reader bus integration. Expected te/se derived
# independently in Python (see commit message).

import math as _math


def test_toContrasts_or_two_arm_no_zero():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "GUSTO", arms: [
            {{ treatment: "SK",  events: 1135, n: 13780 }},
            {{ treatment: "tPA", events: 1021, n: 13746 }}
          ]}}
        ], "OR");
        console.log(JSON.stringify(M.toContrasts(env)));
    """)
    assert len(out) == 1
    r = out[0]
    assert r["treatment1"] == "SK" and r["treatment2"] == "tPA"
    assert r["study"] == "GUSTO"
    assert abs(r["te"] - 0.112157) < 1e-5
    assert abs(r["se"] - 0.044924) < 1e-5


def test_toContrasts_rr_scale():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "S", arms: [
            {{ treatment: "A", events: 1135, n: 13780 }},
            {{ treatment: "B", events: 1021, n: 13746 }}
          ]}}
        ], "RR");
        console.log(JSON.stringify(M.toContrasts(env)));
    """)
    assert abs(out[0]["te"] - 0.10338) < 1e-5
    assert abs(out[0]["se"] - 0.041415) < 1e-5


def test_toContrasts_md_not_derivable_from_bus():
    # The arm contract carries n for BINARY arms only, so a mean-difference SE
    # cannot be reconstructed from a continuous envelope -> [].
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "S", arms: [
            {{ treatment: "A", mean: 5.0, sd: 2.0, n: 50 }},
            {{ treatment: "B", mean: 4.2, sd: 2.5, n: 48 }}
          ]}}
        ], "MD");
        console.log(JSON.stringify(M.toContrasts(env)));
    """)
    assert out == []


def test_toContrasts_zero_cell_applies_half_correction():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "Z", arms: [
            {{ treatment: "A", events: 0,  n: 100 }},
            {{ treatment: "B", events: 10, n: 100 }}
          ]}}
        ], "OR");
        console.log(JSON.stringify(M.toContrasts(env)));
    """)
    # cc=0.5 applied because arm A has a zero event cell.
    assert len(out) == 1
    assert abs(out[0]["te"] - (-3.14933)) < 1e-4
    assert abs(out[0]["se"] - 1.45473) < 1e-4


def test_toContrasts_multiarm_emits_all_pairs_same_study():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "Tri", arms: [
            {{ treatment: "A", events: 10, n: 100 }},
            {{ treatment: "B", events: 20, n: 100 }},
            {{ treatment: "C", events: 30, n: 100 }}
          ]}}
        ], "OR");
        console.log(JSON.stringify(M.toContrasts(env)));
    """)
    # 3 arms -> 3 pairwise contrasts, all tagged with study "Tri".
    assert len(out) == 3
    assert all(r["study"] == "Tri" for r in out)
    pairs = {(r["treatment1"], r["treatment2"]) for r in out}
    assert pairs == {("A", "B"), ("A", "C"), ("B", "C")}
    # design-by-treatment grouping: all three share the study's full arm-set,
    # NOT per-pair tags (which would wrongly split the multi-arm trial).
    assert {r["design"] for r in out} == {"A:B:C"}


def test_toContrasts_two_arm_design_is_sorted_armset():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "S", arms: [
            {{ treatment: "control", events: 20, n: 100 }},
            {{ treatment: "drug",    events: 10, n: 100 }}
          ]}}
        ], "OR");
        console.log(JSON.stringify(M.toContrasts(env)));
    """)
    # Multi-char treatment names: design uses a ":" separator (no collision),
    # sorted so it is canonical regardless of arm input order.
    assert out[0]["design"] == "control:drug"


def test_toContrasts_skips_underivable_measures():
    # HR / SMD / RD cannot be derived from raw arm counts here -> [].
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "S", arms: [
            {{ treatment: "A", events: 10, n: 100 }},
            {{ treatment: "B", events: 20, n: 100 }}
          ]}}
        ], "HR");
        console.log(JSON.stringify(M.toContrasts(env)));
    """)
    assert out == []


# --- toDoseResponse (arm-level -> per-arm dose-response rows) -----------------
# Added 2026-06-02. Reference = lowest-dose arm (effect 0, se null anchor);
# other arms = log-effect vs reference + se. OR/RR only; every arm needs a dose.


def test_toDoseResponse_emits_anchor_plus_dose_arms():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "S1", arms: [
            {{ treatment: "control", events: 20, n: 100, dose: 0 }},
            {{ treatment: "drugLo",  events: 30, n: 100, dose: 10 }},
            {{ treatment: "drugHi",  events: 45, n: 100, dose: 20 }}
          ]}}
        ], "OR");
        console.log(JSON.stringify(M.toDoseResponse(env)));
    """)
    assert len(out) == 3
    byT = {r["treatment"]: r for r in out}
    # Anchor: reference (lowest dose) at effect 0, se null.
    assert byT["control"]["dose"] == 0
    assert byT["control"]["effect"] == 0
    assert byT["control"]["se"] is None
    # Dose arms: log-OR vs reference.
    assert byT["drugLo"]["dose"] == 10
    assert abs(byT["drugLo"]["effect"] - 0.538997) < 1e-5
    assert abs(byT["drugLo"]["se"] - 0.331842) < 1e-5
    assert byT["drugHi"]["dose"] == 20
    assert abs(byT["drugHi"]["effect"] - 1.185624) < 1e-5
    assert abs(byT["drugHi"]["se"] - 0.320787) < 1e-5


def test_toDoseResponse_skips_studies_without_dose_on_all_arms():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "noDose", arms: [
            {{ treatment: "control", events: 20, n: 100 }},
            {{ treatment: "drug",    events: 30, n: 100 }}
          ]}},
          {{ id: "dosed", arms: [
            {{ treatment: "control", events: 20, n: 100, dose: 0 }},
            {{ treatment: "drug",    events: 30, n: 100, dose: 5 }}
          ]}}
        ], "OR");
        console.log(JSON.stringify(M.toDoseResponse(env)));
    """)
    studies = {r["study"] for r in out}
    assert studies == {"dosed"}   # noDose study skipped entirely


def test_toDoseResponse_non_binary_returns_empty():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
          {{ id: "S", arms: [
            {{ treatment: "A", mean: 1.0, sd: 0.5, n: 30 }},
            {{ treatment: "B", mean: 2.0, sd: 0.6, n: 30 }}
          ]}}
        ], "MD");
        console.log(JSON.stringify(M.toDoseResponse(env)));
    """)
    assert out == []
