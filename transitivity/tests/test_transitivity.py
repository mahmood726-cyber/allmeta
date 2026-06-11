"""Tests for shared/transitivity-v1.js — transitivity screen + representativeness.

Runs in Node. Transitivity flags modifiers whose node-mean distribution spreads
beyond the relative-spread (CV) threshold; representativeness flags modifiers
where the trial population differs from the target by > the standardised-diff cut.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const T=require('./shared/transitivity-v1.js');"


def _run(body: str):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_transitivity_flags_an_imbalanced_modifier():
    # BMI balanced across nodes; HbA1c clearly higher at one node (obesity vs T2D mix)
    o = _run(
        "const trials=[{node:'a',mods:{bmi:38,hba1c:5.7}},{node:'a',mods:{bmi:38,hba1c:5.8}},"
        "{node:'b',mods:{bmi:38,hba1c:5.8}},{node:'c',mods:{bmi:38,hba1c:8.0}},{node:'c',mods:{bmi:38,hba1c:7.8}}];"
        "const mods=[{id:'bmi',name:'BMI'},{id:'hba1c',name:'HbA1c'}];"
        "const r=T.assessTransitivity({trials,modifiers:mods});"
        "const by={};r.modifiers.forEach(m=>by[m.id]=m);"
        "console.log(JSON.stringify({bmi:by.bmi.status,hba1c:by.hba1c.status,flags:r.flags,nNodes:r.nNodes,"
        "hba1cRange:by.hba1c.range}));"
    )
    assert o["bmi"] == "ok"               # identical across nodes
    assert o["hba1c"] == "flag"           # 5.75 vs 5.8 vs 7.9 → CV over threshold
    assert o["flags"] == 1 and o["nNodes"] == 3
    assert abs(o["hba1cRange"] - 2.15) < 1e-9


def test_transitivity_na_when_under_two_nodes_have_data():
    o = _run(
        "const r=T.assessTransitivity({trials:[{node:'a',mods:{x:1}}],modifiers:[{id:'x',name:'X'}]});"
        "console.log(JSON.stringify({status:r.modifiers[0].status,assessed:r.assessed}));"
    )
    assert o["status"] == "na" and o["assessed"] == 0


def test_representativeness_standardised_diff_and_direction():
    o = _run(
        "const mods=[{id:'bmi',name:'BMI'},{id:'age',name:'Age'}];"
        "const r=T.assessRepresentativeness({modifiers:mods,"
        "trial:{bmi:{mean:37},age:{mean:55}},"
        "target:{bmi:{mean:36,sd:5},age:{mean:49,sd:10}}});"
        "const by={};r.modifiers.forEach(m=>by[m.id]=m);"
        "console.log(JSON.stringify({bmiStd:by.bmi.stdDiff,bmiDir:by.bmi.direction,bmiStatus:by.bmi.status,"
        "ageStd:by.age.stdDiff,ageStatus:by.age.status,flags:r.flags}));"
    )
    assert abs(o["bmiStd"] - 0.2) < 1e-9 and o["bmiDir"] == "over" and o["bmiStatus"] == "ok"
    assert abs(o["ageStd"] - 0.6) < 1e-9 and o["ageStatus"] == "flag"   # |0.6| > 0.5
    assert o["flags"] == 1


def test_representativeness_relative_diff_when_no_sd():
    o = _run(
        "const r=T.assessRepresentativeness({modifiers:[{id:'w',name:'Weight'}],"
        "trial:{w:{mean:120}},target:{w:{mean:100}}});"   # +20% relative diff, no SD
        "console.log(JSON.stringify(r.modifiers[0]));"
    )
    assert o["stdDiff"] is None
    assert abs(o["relDiff"] - 0.2) < 1e-9 and o["status"] == "flag"     # 0.2 > 0.15


def test_helpers():
    o = _run("console.log(JSON.stringify({m:T._mean([2,4,6]),s:Math.round(T._sd([2,4,6])*1e6)/1e6}));")
    assert o["m"] == 4.0 and abs(o["s"] - 2.0) < 1e-6
