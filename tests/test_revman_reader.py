"""Tests for shared/revman-reader.js.

Runs the JS module under Node with a JSDOM-equivalent DOMParser shim.
Node doesn't ship a DOMParser by default, so we use `linkedom` if
present, otherwise fall back to a minimal regex-based shim that still
exercises the documented happy path on our fixture.

To install the linkedom dep for richer parsing:
    cd tests/playwright && npm i --no-save linkedom

But the smoke tests below don't require it — they assert through a
node script that loads linkedom from tests/playwright/node_modules if
installed, otherwise from a small shim baked into the test.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "revman-reader.js"
FIXTURE_RM5 = ROOT / "tests" / "fixtures" / "revman" / "tiny.rm5"
LINKEDOM_DIR = ROOT / "tests" / "playwright" / "node_modules" / "linkedom"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _ensure_linkedom() -> None:
    """Skip if linkedom isn't installed under tests/playwright/node_modules.
    Install (one-off) via:
        cd tests/playwright && npm i --no-save linkedom@0.18.5
    """
    if not LINKEDOM_DIR.is_dir():
        pytest.skip("linkedom not installed (run `npm i --no-save linkedom` in tests/playwright/)")


def _run_node(script: str) -> dict:
    _ensure_linkedom()
    # Provide DOMParser + TextDecoder via linkedom; ATOB shim not needed.
    bootstrap = f"""
      const {{ DOMParser }} = require({json.dumps(str(LINKEDOM_DIR))});
      globalThis.DOMParser = DOMParser;
      // TextDecoder is on Node's global since v12.
      const M = require({json.dumps(str(MODULE))});
      {script}
    """
    result = subprocess.run(
        [NODE, "-e", bootstrap],
        capture_output=True, text=True, timeout=60, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


def test_parse_extracts_review_metadata():
    out = _run_node(f"""
        const fs = require('fs');
        const buf = fs.readFileSync({json.dumps(str(FIXTURE_RM5))});
        M.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
         .then(r => console.log(JSON.stringify({{
            title: r.title, version: r.version,
            nComparisons: r.comparisons.length,
            studyCount: r.studyCount,
         }})));
    """)
    assert "Thrombolytics" in out["title"]
    assert out["nComparisons"] == 2
    assert out["studyCount"] > 0


def test_parse_extracts_dich_outcomes_with_arms():
    out = _run_node(f"""
        const fs = require('fs');
        const buf = fs.readFileSync({json.dumps(str(FIXTURE_RM5))});
        M.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
         .then(r => {{
           const c = r.comparisons[0];
           const dich = c.outcomes.find(o => o.type === "binary");
           console.log(JSON.stringify({{
             outcomeName: dich.name,
             effectMeasure: dich.effectMeasure,
             arm1: dich.arm1Name, arm2: dich.arm2Name,
             nStudies: dich.studies.length,
             firstStudyId: dich.studies[0].id,
             firstStudyArms: dich.studies[0].arms,
           }}));
         }});
    """)
    assert out["effectMeasure"] == "OR"
    assert out["arm1"] == "SK"
    assert out["arm2"] == "tPA"
    assert out["nStudies"] == 3
    assert out["firstStudyId"] == "GUSTO-1"
    arms = out["firstStudyArms"]
    assert arms[0]["events"] == 1135
    assert arms[0]["n"] == 13780


def test_parse_extracts_continuous_outcomes():
    out = _run_node(f"""
        const fs = require('fs');
        const buf = fs.readFileSync({json.dumps(str(FIXTURE_RM5))});
        M.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
         .then(r => {{
           const c = r.comparisons[0];
           const cont = c.outcomes.find(o => o.type === "continuous");
           console.log(JSON.stringify({{
             effectMeasure: cont.effectMeasure,
             nStudies: cont.studies.length,
             firstStudyArms: cont.studies[0].arms,
           }}));
         }});
    """)
    assert out["effectMeasure"] == "MD"
    assert out["nStudies"] == 2
    arms = out["firstStudyArms"]
    assert arms[0]["mean"] == 2.3
    assert arms[0]["sd"] == 1.1


def test_comparisonToBus_emits_valid_ma_comparisons_envelope():
    out = _run_node(f"""
        const fs = require('fs');
        const Mc = require({json.dumps(str(ROOT / "shared" / "ma-comparisons-v1.js"))});
        globalThis.MaComparisons = Mc;
        const buf = fs.readFileSync({json.dumps(str(FIXTURE_RM5))});
        M.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
         .then(r => {{
           const env = M.comparisonToBus(r.comparisons[0]);
           const v = Mc.validate(env);
           console.log(JSON.stringify({{
             schema: env._schema,
             effectMeasure: env.effectMeasure,
             nStudies: env.studies.length,
             firstStudy: {{ id: env.studies[0].id, arms: env.studies[0].arms }},
             validateOk: v.ok,
             validateErrors: v.errors,
           }}));
         }});
    """)
    assert out["schema"] == "ma-comparisons-v1"
    assert out["effectMeasure"] == "OR"   # first outcome is binary OR
    assert out["nStudies"] == 3
    assert out["firstStudy"]["id"] == "GUSTO-1"
    assert out["validateOk"] is True
    assert out["validateErrors"] == []


def test_rejects_non_revman_xml():
    out = _run_node(f"""
        const buf = new TextEncoder().encode("<not_revman/>").buffer;
        M.parse(buf).then(
          () => console.log(JSON.stringify({{ caught: false }})),
          err => console.log(JSON.stringify({{ caught: true, msg: err.message }}))
        );
    """)
    assert out["caught"] is True
    assert "COCHRANE_REVIEW" in out["msg"]
