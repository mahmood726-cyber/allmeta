"""Tests for shared/umbrella-overlap-v1.js — Corrected Covered Area (Pieper 2014).

Runs in Node. Pins the CCA formula (N−r)/(r·c−r), Pieper's groove thresholds,
the shared-study tally, and the ≥2-reviews guard.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const U=require('./shared/umbrella-overlap-v1.js');"


def _run(body: str):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_cca_formula_matches_pieper():
    # R1{s1,s2,s3} R2{s2,s3,s4} R3{s3,s4,s5}: N=9, r=5, c=3, CCA=(9-5)/(5*3-5)=0.40
    o = _run(
        "const r=U.overlap([{label:'R1',study_ids:['s1','s2','s3']},"
        "{label:'R2',study_ids:['s2','s3','s4']},{label:'R3',study_ids:['s3','s4','s5']}]);"
        "console.log(JSON.stringify({cca:r.cca,groove:r.groove,N:r.nTotal,r:r.nUnique,c:r.nReviews,shared:r.sharedCount}));"
    )
    assert abs(o["cca"] - 0.40) < 1e-12
    assert o["groove"] == "Very High"
    assert o["N"] == 9 and o["r"] == 5 and o["c"] == 3 and o["shared"] == 3


def test_groove_thresholds():
    o = _run("console.log(JSON.stringify({a:U.classifyGroove(0.04),b:U.classifyGroove(0.08),"
             "c:U.classifyGroove(0.13),d:U.classifyGroove(0.20)}));")
    assert o == {"a": "Slight", "b": "Moderate", "c": "High", "d": "Very High"}


def test_disjoint_reviews_have_zero_overlap():
    o = _run("const r=U.overlap([{study_ids:['a','b']},{study_ids:['c','d']},{study_ids:['e','f']}]);"
             "console.log(JSON.stringify({cca:r.cca,groove:r.groove,shared:r.sharedCount}));")
    assert o["cca"] == 0 and o["groove"] == "Slight" and o["shared"] == 0


def test_pairwise_matrix_and_most_shared():
    o = _run(
        "const r=U.overlap([{study_ids:['s1','s2','s3']},{study_ids:['s2','s3','s4']},{study_ids:['s3','s4','s5']}]);"
        "console.log(JSON.stringify({diag:[r.matrix[0][0],r.matrix[1][1]],r1r2:r.matrix[0][1],top:r.mostShared[0],topFreq:r.frequency['s3']}));"
    )
    assert o["diag"] == [3, 3]            # each review cites 3 studies
    assert o["r1r2"] == 2                  # R1∩R2 = {s2,s3}
    assert o["top"] == "s3" and o["topFreq"] == 3   # s3 cited by all 3


def test_fails_closed_under_two_reviews():
    o = _run("console.log(JSON.stringify({ok:U.overlap([{study_ids:['a']}]).ok}));")
    assert o["ok"] is False
