"""Tests for shared/search-completeness-v1.js — registry-vs-literature miss rate.

Runs in Node. Pins the sensitivity / linkage / denominator-factor maths and the
per-trial miss categorisation (found / ghost / published-not-found / no-link).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const S=require('./shared/search-completeness-v1.js');"


def _run(body: str):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])

CASE = (
    "{cohort:['NCT1','NCT2','NCT3','NCT4','NCT5'],searchHits:['P10','P20'],"
    "linkage:{NCT1:['P10'],NCT2:['P20'],NCT3:['P30'],NCT4:[]},ghosts:['NCT5']}"
)


def test_sensitivity_linkage_and_denominator_factor():
    o = _run(f"const r=S.assess({CASE});"
             "console.log(JSON.stringify({n:r.n,found:r.found,missed:r.missed,sens:r.sensitivity,"
             "linkage:r.linkageRate,factor:r.denominatorFactor,bd:r.breakdown}));")
    assert o["n"] == 5 and o["found"] == 2 and o["missed"] == 3
    assert abs(o["sens"] - 0.4) < 1e-12
    assert abs(o["linkage"] - 0.6) < 1e-12          # 3 of 5 have a linked PMID
    assert abs(o["factor"] - 2.5) < 1e-12           # 1/0.4
    assert o["bd"] == {"ghost": 1, "publishedNotFound": 1, "noLink": 1}


def test_per_trial_categories():
    o = _run(f"const r=S.assess({CASE});"
             "console.log(JSON.stringify(Object.fromEntries(r.perTrial.map(t=>[t.nct,t.category]))));")
    assert o == {"NCT1": "found", "NCT2": "found", "NCT3": "published-not-found",
                 "NCT4": "no-link", "NCT5": "ghost"}


def test_all_found_gives_zero_miss():
    o = _run("const r=S.assess({cohort:['A','B'],searchHits:['p1','p2'],linkage:{A:['p1'],B:['p2']}});"
             "console.log(JSON.stringify({missed:r.missed,sens:r.sensitivity,verdict:r.verdict}));")
    assert o["missed"] == 0 and o["sens"] == 1.0
    assert "every registered trial" in o["verdict"]


def test_cohort_deduplicated():
    o = _run("const r=S.assess({cohort:['X','X','Y'],searchHits:[],linkage:{}});"
             "console.log(JSON.stringify({n:r.n}));")
    assert o["n"] == 2


def test_empty_cohort_fails_closed():
    o = _run("console.log(JSON.stringify({ok:S.assess({cohort:[]}).ok}));")
    assert o["ok"] is False
