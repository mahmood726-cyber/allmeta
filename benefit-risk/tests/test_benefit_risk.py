"""Tests for shared/benefit-risk-v1.js — MCDA + SMAA + EVPI.

Hand-verifiable value functions + Monte-Carlo invariants (P(best) and each
treatment's rank-acceptability sum to 1; EVPI ≥ 0; seeded determinism), run in
Node.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const BR=require('./shared/benefit-risk-v1.js');"


def _run(body: str):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=40, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_partial_value_benefit_and_harm_orientation():
    o = _run(
        "console.log(JSON.stringify({"
        "benefit:BR.partialValue(8,0,10),"          # higher better -> 0.8
        "harm:BR.partialValue(2,10,0),"             # lower better (best=0) -> 0.8
        "clampHi:BR.partialValue(15,0,10),"         # >1 -> 1
        "clampLo:BR.partialValue(-3,0,10)}));"      # <0 -> 0
    )
    assert abs(o["benefit"] - 0.8) < 1e-12
    assert abs(o["harm"] - 0.8) < 1e-12
    assert o["clampHi"] == 1.0 and o["clampLo"] == 0.0


def test_deterministic_mcda_matches_hand_computation():
    # 2 criteria, explicit ranges, weights 0.5/0.5.
    # A: benefit b=10 (v=1), harm h=2 (best=0 -> v=0.8) -> 0.9 ; B: b=0 (0), h=10 (0) -> 0
    o = _run(
        "const crit=[{id:'b',type:'benefit',weight:0.5,worst:0,best:10},{id:'h',type:'harm',weight:0.5,worst:10,best:0}];"
        "const tx=[{id:'A',perf:{b:{mean:10},h:{mean:2}}},{id:'B',perf:{b:{mean:0},h:{mean:10}}}];"
        "const r=BR.analyze({crit,treatments:tx,criteria:crit,iterations:2000,seed:1});"
        "console.log(JSON.stringify(r.deterministic));"
    )
    by = {d["id"]: d for d in o}
    assert abs(by["A"]["value"] - 0.9) < 1e-9 and by["A"]["rank"] == 1
    assert abs(by["B"]["value"] - 0.0) < 1e-9 and by["B"]["rank"] == 2


def test_smaa_probabilities_and_ranks_sum_to_one():
    o = _run(
        "const crit=[{id:'wl',type:'benefit',weight:0.6},{id:'na',type:'harm',weight:0.4}];"
        "const tx=[{id:'t1',perf:{wl:{mean:17,se:1},na:{mean:24,se:2}}},"
        "{id:'t2',perf:{wl:{mean:12,se:1},na:{mean:20,se:2}}},"
        "{id:'t3',perf:{wl:{mean:5,se:1},na:{mean:18,se:2}}}];"
        "const r=BR.analyze({criteria:crit,treatments:tx,iterations:20000,seed:7});"
        "const sumP=r.smaa.reduce((a,s)=>a+s.pBest,0);"
        "const rankSums=r.smaa.map(s=>s.rankAcceptability.reduce((a,b)=>a+b,0));"
        "console.log(JSON.stringify({sumP:sumP,rankSums:rankSums,evpi:r.evpi}));"
    )
    assert abs(o["sumP"] - 1.0) < 1e-9
    for rs in o["rankSums"]:
        assert abs(rs - 1.0) < 1e-9
    assert o["evpi"] >= 0


def test_seeded_runs_are_identical():
    o = _run(
        "const crit=[{id:'b',type:'benefit',weight:1}];"
        "const tx=[{id:'A',perf:{b:{mean:1,se:1}}},{id:'B',perf:{b:{mean:0,se:1}}}];"
        "const a=BR.analyze({criteria:crit,treatments:tx,iterations:5000,seed:99});"
        "const b=BR.analyze({criteria:crit,treatments:tx,iterations:5000,seed:99});"
        "console.log(JSON.stringify({same:a.smaa[0].pBest===b.smaa[0].pBest && a.evpi===b.evpi}));"
    )
    assert o["same"] is True


def test_no_uncertainty_gives_zero_evpi():
    # no SEs -> deterministic -> perfect info adds nothing -> EVPI 0, pBest 1 for the winner
    o = _run(
        "const crit=[{id:'b',type:'benefit',weight:1,worst:0,best:10}];"
        "const tx=[{id:'A',perf:{b:{mean:8}}},{id:'B',perf:{b:{mean:2}}}];"
        "const r=BR.analyze({criteria:crit,treatments:tx,iterations:3000,seed:3});"
        "console.log(JSON.stringify({evpi:r.evpi,top:r.smaa[0].id,pBest:r.smaa[0].pBest}));"
    )
    assert o["evpi"] < 1e-9 and o["top"] == "A" and abs(o["pBest"] - 1.0) < 1e-9


def test_fail_closed_guards():
    o = _run(
        "console.log(JSON.stringify({"
        "few:BR.analyze({criteria:[{id:'b',weight:1}],treatments:[{id:'A',perf:{b:{mean:1}}}]}).ok,"
        "noCrit:BR.analyze({criteria:[],treatments:[{id:'A',perf:{}},{id:'B',perf:{}}]}).ok}));"
    )
    assert o["few"] is False and o["noCrit"] is False
