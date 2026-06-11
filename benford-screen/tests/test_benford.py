"""Tests for shared/benford-v1.js — Benford first-digit integrity screen.

Deterministic constructed inputs (no RNG). Pins the expected proportions, the
leading-digit extraction, the Nigrini MAD classes, χ² vs scipy, conformity vs
nonconformity, and the small-n / empty guards.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const B=require('./shared/benford-v1.js');"


def _run(body: str):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_expected_proportions_and_leading_digit():
    o = _run("console.log(JSON.stringify({sum:B.expectedFirstDigit.reduce((a,b)=>a+b,0),"
             "e1:B.expectedFirstDigit[0],fd:[B.firstDigit(0.0234),B.firstDigit(4744),B.firstDigit(-0.86),B.firstDigit(0)]}));")
    assert abs(o["sum"] - 1.0) < 1e-9
    assert abs(o["e1"] - 0.30103) < 1e-4          # P(1) = log10(2)
    assert o["fd"] == [2, 4, 8, None]


def test_nigrini_mad_classes():
    o = _run("console.log(JSON.stringify([B.madClass(0.005),B.madClass(0.01),B.madClass(0.013),B.madClass(0.02)]));")
    assert o == ["Close conformity", "Acceptable conformity", "Marginal conformity", "Nonconformity"]


def test_perfect_benford_is_close_conformity():
    # construct values whose first-digit counts match Benford exactly (N=10000)
    o = _run(
        "const E=B.expectedFirstDigit, vals=[];"
        "for(let d=1;d<=9;d++){const c=Math.round(E[d-1]*10000);for(let i=0;i<c;i++)vals.push(d+0.5);}"
        "const r=B.analyze(vals);"
        "console.log(JSON.stringify({mad:r.mad,cls:r.madClass,anom:r.anomalous,n:r.n}));"
    )
    assert o["mad"] < 0.006 and o["cls"] == "Close conformity"
    assert o["anom"] is False and o["n"] >= 9900


def test_uniform_first_digits_flag_nonconformity():
    # equal counts per digit (a fabrication-like pattern) -> deviates from Benford
    o = _run(
        "const vals=[];for(let d=1;d<=9;d++)for(let i=0;i<100;i++)vals.push(d+0.3);"
        "const r=B.analyze(vals);"
        "console.log(JSON.stringify({mad:r.mad,cls:r.madClass,anom:r.anomalous,chi2:r.chi2,p:r.chi2p}));"
    )
    assert o["mad"] >= 0.015 and o["cls"] == "Nonconformity"
    assert o["anom"] is True and o["p"] < 0.001


def test_chi2_survival_matches_scipy():
    o = _run("console.log(JSON.stringify([B._chi2sf(15.51,8),B._chi2sf(3.0,8),B._chi2sf(50,8)]));")
    for got, x in zip(o, [15.51, 3.0, 50]):
        assert abs(got - float(stats.chi2.sf(x, 8))) < 1e-9


def test_small_n_is_indicative_only_and_empty_guard():
    o = _run("const r=B.analyze([12,34,56,78]);"
             "console.log(JSON.stringify({n:r.n,small:r.verdict.includes('too few'),empty:B.analyze([0,'x',null]).ok}));")
    assert o["n"] == 4 and o["small"] is True
    assert o["empty"] is False
