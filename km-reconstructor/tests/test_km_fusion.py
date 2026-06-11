"""Tests for shared/km-fusion-v1.js — NAR fusion (integrated from registry-ipd).

Pure logic in Node: exact registry anchors are authoritative when fused with a
digitized curve, and the input regime maps to the right reliability tier
(per registry-ipd's 42-dataset NAR-fusion benchmark bands).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const F=require('./shared/km-fusion-v1.js');"


def _run(body: str):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_anchors_are_authoritative_in_fusion():
    o = _run(
        "const dig=F.parsePoints('0,1\\n3,0.94\\n6,0.87\\n9,0.83\\n12,0.74');"
        "const anc=F.parsePoints('0,1.00\\n6,0.88\\n12,0.75');"
        "const fz=F.fuseCurve(dig,anc);"
        "console.log(JSON.stringify({n:fz.nFused,a:fz.nAnchors,d:fz.nDigitized,"
        "at6:fz.curve.find(p=>p.t===6),at3:fz.curve.find(p=>p.t===3)}));"
    )
    assert o["a"] == 3 and o["d"] == 5
    assert o["at6"]["src"] == "anchor" and abs(o["at6"]["s"] - 0.88) < 1e-9   # anchor wins, not 0.87
    assert o["at3"]["src"] == "digitized"                                      # between-anchor shape kept


def test_fusion_enforces_monotone_survival():
    o = _run(
        "const fz=F.fuseCurve(F.parsePoints('3,0.97'),F.parsePoints('0,0.95\\n6,0.90'));"
        "console.log(JSON.stringify(fz.curve.map(p=>p.s)));"
    )
    assert all(o[i] <= o[i - 1] + 1e-12 for i in range(1, len(o)))            # non-increasing


def test_anchor_is_never_pulled_below_a_noisy_earlier_digitized_point():
    # a digitized point just below a later anchor must NOT lower the exact anchor
    o = _run(
        "const fz=F.fuseCurve(F.parsePoints('3,0.40'),F.parsePoints('0,1.00\\n4,0.42'));"
        "const at4=fz.curve.find(p=>Math.abs(p.t-4)<1e-9);"
        "const at3=fz.curve.find(p=>Math.abs(p.t-3)<1e-9);"
        "console.log(JSON.stringify({at4s:at4.s,at4src:at4.src,at3s:at3.s,"
        "mono:fz.curve.every((p,i,a)=>i===0||p.s<=a[i-1].s+1e-12)}));"
    )
    assert abs(o["at4s"] - 0.42) < 1e-9 and o["at4src"] == "anchor"   # anchor preserved
    assert o["at3s"] >= 0.42 - 1e-9                                    # digitized clamped UP to the anchor
    assert o["mono"] is True                                          # still monotone


def test_survival_percent_is_normalised():
    o = _run("console.log(JSON.stringify(F.parsePoints('0,100\\n6,88')));")
    assert o[0]["s"] == 1.0 and abs(o[1]["s"] - 0.88) < 1e-9


def test_tier_bands_match_the_benchmark():
    o = _run(
        "console.log(JSON.stringify({"
        "A:F.tier({curveSource:'fusion',hasAtRisk:true}),"
        "B:F.tier({curveSource:'digitized',hasAtRisk:true}),"
        "C1:F.tier({curveSource:'registry',hasAtRisk:false}),"
        "C2:F.tier({curveSource:'digitized',hasAtRisk:false})}));"
    )
    assert o["A"]["tier"] == "A" and o["A"]["severity"] == "ok" and "FUSION" in o["A"]["label"]
    assert o["B"]["tier"] == "B"
    assert o["C1"]["tier"] == "C" and o["C1"]["severity"] == "flag"           # anchor-only: censoring unidentified
    assert "censoring" in o["C1"]["verdict"].lower()
    assert o["C2"]["tier"] == "C" and o["C2"]["severity"] == "warn"
