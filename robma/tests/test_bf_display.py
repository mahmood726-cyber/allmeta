"""Bayes-factor display on the RoBMA page (found 2026-11-12 in real Chrome, dat.bcg).

fmt() writes a BF with toFixed(2). For a value >= 1e21 JavaScript's toFixed returns the raw shortest round-trip
string, so the dat.bcg heterogeneity BF was shown as "9.699591366261623e+24". Requirement: a finite BF >= 1e21
is shown in the page's own toExponential(3)-style form, computed from the log BF; the value in the result
object is unchanged; a BF below 1e21 is shown exactly as before (2 dp); a non-finite BF still shows "-".
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

BCG = 'T1, -0.88931133392020545, 0.57060035489295069\nT2, -1.5853886572014306, 0.44111350171825825\nT3, -1.3480731482996933, 0.64449046957109102\nT4, -1.4415511900213054, 0.14145681992130169\nT5, -0.21754732221129558, 0.2262966463950159\nT6, -0.78611558581886398, 0.083100050877895126\nT7, -1.6208982235983918, 0.47224701965424321\nT8, 0.011952333523840508, 0.062941077984236413\nT9, -0.4694176487381494, 0.23755885684025541\nT10, -1.3713448034727844, 0.27023100046632126\nT11, -0.33935882833839059, 0.11141011610962319\nT12, 0.44591340057137874, 0.72972998102048181\nT13, -0.017313948216879815, 0.26721650339001574'

PRELUDE = r"""
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('robma/index.html','utf8');
const els={};
const mk=(id)=>({id,value:'',innerHTML:'',textContent:'',style:{},addEventListener(t,f){this['on'+t]=f},setAttribute(){},getAttribute(){return null},appendChild(){},removeChild(){},click(){}});
const document={getElementById:(id)=>els[id]||(els[id]=mk(id)),querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>mk(''),body:mk('body')};
const sb={document,console,Math,JSON,Number,String,isFinite,parseFloat};
sb.window=sb;vm.createContext(sb);
vm.runInContext(fs.readFileSync('shared/robma.js','utf8'),sb);
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m=>vm.runInContext(m[1],sb));
const $=(id)=>document.getElementById(id);
"""


def page(text, patch=None):
    """Type `text` into the study box the way a user does (input event); `patch` overrides analysis() fields."""
    js = PRELUDE + r"""
const input=%s, patch=%s;
if(patch!==null){ const a=sb.AlmRoBMA.analysis; sb.AlmRoBMA.analysis=function(y,s){ return Object.assign(a(y,s), patch); }; }
$('f-data').value=input; $('f-data').oninput();
const L=sb._almLastRoBMA();
process.stdout.write(JSON.stringify({headline:$('headline').innerHTML, bfHetero:L.bfHetero, logBfHetero:L.logBfHetero, bfEffect:L.bfEffect}));
""" % (json.dumps(text), "null" if patch is None else json.dumps(patch))
    out = subprocess.run([NODE, "-e", js], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def het_bf(h):
    return h.split("Heterogeneity: BF = <strong>")[1].split("</strong>")[0]


def eff_bf(h):
    return h.split("BF<sub>10</sub> = <strong>")[1].split("</strong>")[0]


def test_bcg_heterogeneity_bf_is_formatted_not_raw():
    r = page(BCG)
    assert r["bfHetero"] == pytest.approx(9.699591366261623e24, rel=1e-12)  # the value itself is unchanged
    assert het_bf(r["headline"]) == "9.700e+24"
    assert "e+24</strong>" in r["headline"] and "9.699591366261623" not in r["headline"]


def test_large_effect_bf_uses_the_same_form():
    # 30 precise studies far from 0: BF10 far beyond 1e21
    rows = "\n".join("S%d, %s, 0.05" % (i, 0.8 + 0.01 * (i % 5)) for i in range(30))
    r = page(rows)
    assert r["bfEffect"] >= 1e21
    s = eff_bf(r["headline"])
    assert "e+" in s and len(s.split("e")[0]) == 5, s  # d.ddd mantissa, not the raw 16-digit string


def test_ordinary_bfs_unchanged_two_decimals():
    # default example: R reference BF_effect=6.738859, BF_hetero=2.698955 (robma-parity.spec.mjs)
    ex = "Study A, 0.10, 0.20\nStudy B, 0.30, 0.25\nStudy C, 0.50, 0.18\nStudy D, 0.20, 0.30\nStudy E, 0.90, 0.22\nStudy F, 0.40, 0.28\nStudy G, 1.10, 0.35\nStudy H, 0.05, 0.15"
    r = page(ex)
    assert eff_bf(r["headline"]) == "6.74"
    assert het_bf(r["headline"]) == "2.70"


def test_bf_just_below_1e21_keeps_two_decimals():
    r = page(BCG, {"bfHetero": 9.99e20, "logBfHetero": 48.33})
    assert het_bf(r["headline"]) == (9.99e20).__format__(".2f")


def test_non_finite_bf_still_dash():
    r = page(BCG, {"bfHetero": float("inf"), "logBfHetero": 900.0})
    assert het_bf(r["headline"]) == "\u2014"
