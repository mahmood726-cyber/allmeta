"""Pytest harness for `shared/ma-studies-v1.js`.

Runs the JS module under Node and asserts the formal contract documented in
`shared/ma-studies-v1.md`. Skipped if Node is not installed.

Covers:
- Envelope validation (good payload, bad _schema, malformed studies)
- Round-trip: read → write → read → equality on canonical fixture
- Poisoned-row drop (NaN, Infinity, non-positive SE)
- fromCI() for ratio + linear scales matches the analytic formula
- parseCSV / toCSV round-trip

The Node script is built inline so the tests directory stays self-contained.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "ma-studies-v1.js"
FIXTURES = ROOT / "tests" / "fixtures" / "ma-studies-v1"

NODE = shutil.which("node")

pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> dict:
    """Execute a Node script that prints a single JSON line to stdout."""
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    # The script may print multiple lines (e.g. console.log debug). The LAST
    # line must be the JSON payload.
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


# --- Validation ---------------------------------------------------------------


def test_validate_accepts_canonical_envelope():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = require({json.dumps(str(FIXTURES / "roundtrip.json"))});
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out == {"ok": True, "errors": []}


def test_validate_rejects_wrong_schema():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = {{ _schema: "wrong-version", _savedAt: "x", studies: [] }};
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out["ok"] is False
    assert any("_schema" in e for e in out["errors"])


def test_validate_flags_negative_se():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = {{
            _schema: "ma-studies-v1",
            _savedAt: new Date().toISOString(),
            studies: [{{ label: "bad", est: 0.1, se: -0.01 }}]
        }};
        console.log(JSON.stringify(M.validate(env)));
    """)
    assert out["ok"] is False
    assert any("se" in e for e in out["errors"])


# --- Poisoned-row drop --------------------------------------------------------


def test_write_drops_nan_and_nonpositive_se():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const env = M.buildEnvelope([
            {{ label: "good", est: 0.1, se: 0.05 }},
            {{ label: "nan-est", est: Number.NaN, se: 0.05 }},
            {{ label: "inf-est", est: Number.POSITIVE_INFINITY, se: 0.05 }},
            {{ label: "zero-se", est: 0.1, se: 0 }},
            {{ label: "neg-se", est: 0.1, se: -1 }},
        ]);
        console.log(JSON.stringify(env));
    """)
    labels = [s["label"] for s in out["studies"]]
    assert labels == ["good"], f"expected only 'good' to survive, got {labels}"


# --- fromCI -------------------------------------------------------------------


def test_fromCI_ratio_matches_log_formula():
    # OR=1.5, CI=[1.1, 2.1] → est=ln(1.5), se=(ln(2.1)-ln(1.1))/(2*1.95996)
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.fromCI(1.5, 1.1, 2.1, "ratio")));
    """)
    import math
    expected_est = math.log(1.5)
    expected_se = (math.log(2.1) - math.log(1.1)) / (2 * 1.959963984540054)
    assert abs(out["est"] - expected_est) < 1e-12
    assert abs(out["se"] - expected_se) < 1e-12


def test_fromCI_linear_identity():
    # MD=0.5, CI=[0.1, 0.9] → est=0.5, se=0.4/(2*1.95996)
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(M.fromCI(0.5, 0.1, 0.9, "linear")));
    """)
    expected_se = 0.8 / (2 * 1.959963984540054)
    assert abs(out["est"] - 0.5) < 1e-12
    assert abs(out["se"] - expected_se) < 1e-12


def test_fromCI_ratio_rejects_nonpositive_point():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify({{ a: M.fromCI(0, 0.1, 1.0, "ratio"),
                                       b: M.fromCI(-1, 0.1, 1.0, "ratio") }}));
    """)
    assert out["a"] is None
    assert out["b"] is None


# --- CSV interop --------------------------------------------------------------


def test_parseCSV_roundtrip_through_toCSV():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const src = [
          "# header comment",
          "Trial A 2018, -0.22, 0.11, 2018",
          "Trial B 2019, -0.31, 0.14, 2019, sglt2",
          "",
          "Trial C 2020, 0.04, 0.19"
        ].join("\\n");
        const parsed = M.parseCSV(src);
        const reser = M.toCSV(parsed);
        const reparsed = M.parseCSV(reser);
        console.log(JSON.stringify({{ first: parsed, second: reparsed }}));
    """)
    first = out["first"]
    second = out["second"]
    assert len(first) == 3
    assert len(second) == 3
    for a, b in zip(first, second):
        assert a["label"] == b["label"]
        assert abs(a["est"] - b["est"]) < 1e-12
        assert abs(a["se"] - b["se"]) < 1e-12


def test_parseCSV_drops_bad_rows():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const src = [
          "good, 0.1, 0.05",
          "bad-se, 0.1, abc",
          "neg-se, 0.1, -0.01",
          "missing-col, 0.1",
          "blank-label, 0.1, 0.05"
        ].join("\\n");
        console.log(JSON.stringify(M.parseCSV(src).map(r => r.label)));
    """)
    # bad-se, neg-se, missing-col dropped; "blank-label" gets the placeholder.
    assert "good" in out
    assert "bad-se" not in out
    assert "neg-se" not in out
    assert "missing-col" not in out


# --- Round-trip ---------------------------------------------------------------


def test_envelope_roundtrip_preserves_canonical_studies():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const seed = require({json.dumps(str(FIXTURES / "roundtrip.json"))});
        const env = M.buildEnvelope(seed.studies);
        console.log(JSON.stringify(env.studies));
    """)
    seed = json.loads((FIXTURES / "roundtrip.json").read_text(encoding="utf-8"))
    seed_studies = seed["studies"]
    assert len(out) == len(seed_studies)
    for a, b in zip(out, seed_studies):
        assert a["label"] == b["label"]
        assert abs(a["est"] - b["est"]) < 1e-12
        assert abs(a["se"] - b["se"]) < 1e-12


# --- Textarea helpers (added 2026-05-24 for moat C-2) -------------------------


def test_studiesFromTextarea_label_est_se_default():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const src = "Trial A, -0.22, 0.11\\nTrial B, -0.31, 0.14, 2019, sglt2";
        console.log(JSON.stringify(M.studiesFromTextarea(src, "label-est-se")));
    """)
    assert len(out) == 2
    assert out[0]["label"] == "Trial A"
    assert abs(out[0]["est"] + 0.22) < 1e-12
    assert out[1]["year"] == 2019
    assert out[1]["group"] == "sglt2"


def test_studiesFromTextarea_est_se_label_inverse_format():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const src = "0.25, 0.08, Smith\\n0.18, 0.10, Jones";
        console.log(JSON.stringify(M.studiesFromTextarea(src, "est-se-label")));
    """)
    assert len(out) == 2
    assert out[0]["label"] == "Smith"
    assert abs(out[0]["est"] - 0.25) < 1e-12
    assert abs(out[0]["se"] - 0.08) < 1e-12


def test_studiesFromTextarea_est_se_label_mod():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const src = "0.25, 0.08, Smith, 45";
        console.log(JSON.stringify(M.studiesFromTextarea(src, "est-se-label-mod")));
    """)
    assert out[0]["moderator"] == 45


def test_studiesFromTextarea_drops_blank_and_comments():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const src = ["# header", "", "Trial A, 0.1, 0.05", "# c", "Trial B, 0.2, 0.07"].join("\\n");
        console.log(JSON.stringify(M.studiesFromTextarea(src, "label-est-se").map(r => r.label)));
    """)
    assert out == ["Trial A", "Trial B"]


def test_textareaFromStudies_roundtrip_est_se_label():
    out = _run_node(f"""
        const M = require({json.dumps(str(MODULE))});
        const seed = [
          {{ label: "Smith", est: 0.25, se: 0.08, moderator: null, group: null, year: null }},
          {{ label: "Jones", est: 0.18, se: 0.10, moderator: null, group: null, year: null }}
        ];
        const text = M.textareaFromStudies(seed, "est-se-label");
        const parsed = M.studiesFromTextarea(text, "est-se-label");
        console.log(JSON.stringify(parsed));
    """)
    assert len(out) == 2
    assert out[0]["label"] == "Smith"
    assert abs(out[0]["est"] - 0.25) < 1e-12
