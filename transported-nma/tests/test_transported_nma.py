"""Tests for shared/transported-nma-v1.js — population-transported NMA.

Validates Hainmueller entropy balancing (weighted means EXACTLY match the
target, Kish ESS), the reweighted random-effects NMA (reuses the audited
AlmMultiplicativeNMA WLS solver), P-score direction, and that uniform weights
reproduce the source league. Cross-checks the entropy-balancing weights against
an independent numpy Newton solve.
"""
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = (
    "const NMA=require('./shared/multiplicative-nma.js');"
    "const MC=require('./shared/ma-core.js');"
    "globalThis.AlmMultiplicativeNMA=NMA;globalThis.AlmMaCore=MC;"
    "const T=require('./shared/transported-nma-v1.js');"
)


def _run(body: str):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=40, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


# ---- a small 4-study, 3-treatment network with one effect modifier `age` ----
STUDIES = "[{cov:{age:50}},{cov:{age:55}},{cov:{age:70}},{cov:{age:75}}]"
ROWS = (
    "[{trtA:'A',trtB:'B',yi:0.20,sei:0.10,study:0},"
    " {trtA:'A',trtB:'C',yi:0.50,sei:0.12,study:1},"
    " {trtA:'B',trtB:'C',yi:0.28,sei:0.11,study:2},"
    " {trtA:'A',trtB:'C',yi:0.60,sei:0.13,study:3}]"
)
TRTS = "['A','B','C']"


def test_entropy_balancing_matches_target_exactly_and_ess():
    o = _run(
        "const w=T.weights(" + STUDIES + ",{age:60});"
        "console.log(JSON.stringify({ok:w.ok,conv:w.converged,ach:w.achieved.age,sumw:w.weights.reduce((a,b)=>a+b,0),"
        "ess:w.ess,essR:w.essRatio,wts:w.weights}));"
    )
    assert o["ok"] and o["conv"] is True
    assert abs(o["ach"] - 60.0) < 1e-7          # weighted mean age EXACTLY the target
    assert abs(o["sumw"] - 1.0) < 1e-9          # normalised
    # Kish ESS = 1 / sum w^2, in (1, n]
    w = np.array(o["wts"])
    assert abs(o["ess"] - 1.0 / np.sum(w ** 2)) < 1e-9
    assert 1.0 < o["ess"] <= 4.0 + 1e-9 and 0 < o["essR"] <= 1.0 + 1e-9


def test_weights_match_independent_numpy_newton():
    o = _run("const w=T.weights(" + STUDIES + ",{age:62});console.log(JSON.stringify(w.weights));")
    js = np.array(o)
    # independent solve: w_i ∝ exp(λ z_i), z=age-target, choose λ s.t. Σ w_i z_i = 0
    z = np.array([50, 55, 70, 75], float) - 62.0
    lam = 0.0
    for _ in range(200):
        wt = np.exp(lam * z); wt /= wt.sum()
        g = float(np.sum(wt * z))                # gradient
        h = float(np.sum(wt * (z - np.sum(wt * z)) ** 2))  # weighted var
        if abs(g) < 1e-12:
            break
        lam -= g / h
    ref = np.exp(lam * z); ref /= ref.sum()
    assert np.allclose(js, ref, atol=1e-8)


def test_uniform_target_gives_near_uniform_weights():
    # target = the network's own mean -> entropy balancing returns ~uniform, ESS ~ n
    o = _run("const w=T.weights(" + STUDIES + ",{age:62.5});"
             "console.log(JSON.stringify({essR:w.essRatio,max:Math.max(...w.weights),min:Math.min(...w.weights)}));")
    assert o["essR"] > 0.99                       # almost no information lost
    assert abs(o["max"] - o["min"]) < 1e-6


def test_unweighted_fit_reproduces_source_and_pscore_direction():
    o = _run(
        "const f=T.fit(" + ROWS + "," + TRTS + ",null,{higherIsBetter:true});"
        "console.log(JSON.stringify({ok:f.ok,ref:f.effects.A.estimate,"
        "pA:f.pScore.A,pB:f.pScore.B,pC:f.pScore.C,"
        "leagueBA:f.league[1][0].estimate,nC:f.nContrasts}));"
    )
    assert o["ok"]
    assert abs(o["ref"] - 0.0) < 1e-12            # reference effect is exactly 0
    # A,B,C effects vs A are 0, ~+, ~+ (higher=better) so A worst -> lowest P-score
    assert o["pA"] < o["pB"] and o["pA"] < o["pC"]
    assert abs(o["pA"] + o["pB"] + o["pC"] - 1.5) < 0.25   # P-scores average 0.5
    assert o["nC"] == 4


def test_transport_changes_pscore_and_reports_ess():
    o = _run(
        "const r=T.run({studies:" + STUDIES + ",rows:" + ROWS + ",treatments:" + TRTS + ",target:{age:75}});"
        "console.log(JSON.stringify({ok:r.ok,caution:r.caution,essR:r.transport.essRatio,"
        "srcP:r.source.pScore.C,tgtP:r.transported.pScore.C,"
        "shiftsLen:r.shifts.length,hasVerdict:!!r.verdict}));"
    )
    assert o["ok"] and o["shiftsLen"] == 3 and o["hasVerdict"]
    # transporting to the oldest extreme costs ESS (< full information)
    assert o["essR"] < 1.0
    # a transported P-score differs from the source one (reweighting did something)
    assert abs(o["tgtP"] - o["srcP"]) > 1e-6


def test_guards():
    o = _run("console.log(JSON.stringify({"
             "few:T.weights([{cov:{age:1}}],{age:1}).ok,"
             "emptyT:T.weights(" + STUDIES + ",{}).ok,"
             "miss:T.weights([{cov:{age:1}},{cov:{x:2}}],{age:1}).ok,"
             "norows:T.fit([]," + TRTS + ",null).ok}));")
    assert o["few"] is False and o["emptyT"] is False
    assert o["miss"] is False and o["norows"] is False
