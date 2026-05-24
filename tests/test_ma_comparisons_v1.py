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
