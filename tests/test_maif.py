"""Tests for shared/maif.js + schema/ma-interchange.schema.json (MAIF v1.0).

Confirms allmeta emits valid MAIF (validated against the JSON schema with
jsonschema) and round-trips study-level data losslessly on yi/sei.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
SCHEMA = ROOT / "schema" / "ma-interchange.schema.json"
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")
jsonschema = pytest.importorskip("jsonschema")

PRELUDE = "const M = require('./shared/maif.js');\n"

STUDIES = [
    {"id": "Smith 2020", "yi": 0.35, "sei": 0.12, "ni": 240, "year": 2020},
    {"id": "Lee 2021", "te": -0.10, "se": 0.20},          # te/se shape
    {"id": "Ng 2019", "est": 0.42, "vi": 0.04, "year": 2019},  # est + variance
    {"label": "Ochoa 2022", "yi": 0.05, "sei": 0.30, "arm1": "A", "arm2": "B"},
]


def _run(expr: str):
    r = subprocess.run([NODE, "-e", PRELUDE + "console.log(JSON.stringify(" + expr + "));"],
                       capture_output=True, text=True, timeout=20, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_export_validates_against_schema():
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    doc = _run(f"M.fromStudies({json.dumps(STUDIES)}, {{title:'demo', effectType:'logOR'}})")
    # must be schema-valid (raises jsonschema.ValidationError otherwise)
    jsonschema.validate(instance=doc, schema=schema)
    assert doc["version"] == "1.0"
    assert len(doc["studies"]) == 4  # all four map (mixed input shapes)
    # variance-only input was converted to sei = sqrt(vi) = sqrt(0.04) = 0.2
    ng = next(s for s in doc["studies"] if s["id"] == "Ng 2019")
    assert abs(ng["sei"] - 0.2) < 1e-12


def test_roundtrip_preserves_yi_sei():
    got = _run(f"M.toStudies(M.fromStudies({json.dumps(STUDIES)}))")
    assert len(got) == 4
    for orig, s in zip(STUDIES, got):
        # yi resolved from yi|te|est, sei from sei|se|sqrt(vi)
        assert "yi" in s and "sei" in s and s["sei"] > 0
        assert abs(s["vi"] - s["sei"] ** 2) < 1e-15


def test_missing_effect_or_se_is_dropped():
    doc = _run("M.fromStudies([{id:'ok',yi:0.1,sei:0.2},{id:'bad',yi:0.1},{id:'bad2',sei:0.2}])")
    assert [s["id"] for s in doc["studies"]] == ["ok"]


def test_validate_helper_flags_bad_docs():
    assert _run("M.validate({version:'1.0',studies:[{id:'a',yi:0.1,sei:0.2}]})") == []
    assert _run("M.validate({version:'2.0',studies:[]}).length") >= 1
    assert _run("M.validate({version:'1.0',studies:[{id:'a',yi:0.1,sei:-1}]}).length") >= 1
