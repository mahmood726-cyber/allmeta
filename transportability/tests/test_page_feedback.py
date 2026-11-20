"""What the transportability page says about a fit (limitation sweep P58, lane lim8, 2026-11-20).

F08: a target outside the trials' modifier range was transported with no warning, and a non-significant
slope triggered "transport then barely differs from the ordinary pooled effect" -- false: the shift is
slope x (x* - trial mean) and can be large, and no ordinary pooled effect is fitted. Requirement: an
out-of-range target is flagged as extrapolation; the non-significant-slope note says what it means
without claiming the shift is small; the built-in example (in range, significant slope) shows neither.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = r"""
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('transportability/index.html','utf8');
const els={};
const mk=(id)=>({id,value:'',innerHTML:'',textContent:'',checked:false,hidden:false,style:{},addEventListener(){},setAttribute(){},getAttribute(){return null},appendChild(){}});
const document={getElementById:(id)=>els[id]||(els[id]=mk(id)),querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>mk(''),body:mk('body')};
const sb={document,console,Math,JSON,Number,String,isFinite,parseFloat};
sb.window=sb;vm.createContext(sb);
vm.runInContext(fs.readFileSync('shared/ma-core.js','utf8'),sb);
vm.runInContext(fs.readFileSync('shared/transportability-v1.js','utf8'),sb);
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m=>vm.runInContext(m[1],sb));
const $=(id)=>document.getElementById(id);
function go(data,target,log){$('f-data').value=data;$('f-target').value=target;$('f-modname').value='x';$('f-log').checked=!!log;
  const r=sb.window.__almTransport.run();return {ok:!!r,msg:$('result').innerHTML,plot:$('plot').innerHTML};}
"""
EXAMPLE = "\n".join(["STEP-1, -12.4, 0.6, 37.9", "STEP-3, -10.3, 0.9, 38.0", "SURMOUNT-1, -17.8, 0.7, 38.0", "SCALE, -5.4, 0.5, 38.3",
                     "PIONEER, -4.2, 0.6, 32.9", "AWARD, -3.0, 0.7, 33.5", "Pilot, -2.1, 1.0, 30.5", "High-dose, -15.0, 1.1, 41.0"])
# non-significant slope, large shift at a distant target
WEAK = "\n".join(["A, 0.10, 0.30, 10", "B, 0.50, 0.35, 12", "C, -0.20, 0.30, 14", "D, 0.40, 0.40, 16", "E, 0.30, 0.30, 18"])


def page(*calls):
    js = PRELUDE + "console.log(JSON.stringify([" + ",".join("go(%s,%s,%s)" % (json.dumps(d), json.dumps(t), json.dumps(l)) for d, t, l in calls) + "]));"
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, encoding="utf-8", timeout=60, cwd=str(ROOT))
    assert r.returncode == 0, r.stdout + r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_example_shows_no_extrapolation_or_slope_warning():
    o = page((EXAMPLE, "31", False))[0]
    assert o["ok"] and "extrapolation" not in o["msg"] and "not statistically significant" not in o["msg"]


def test_out_of_range_target_is_flagged_as_extrapolation():
    o = page((EXAMPLE, "25", False), (EXAMPLE, "45", False))
    for x in o:
        assert x["ok"] and "outside the trials' modifier range" in x["msg"] and "extrapolation" in x["msg"], x["msg"]


def test_non_significant_slope_does_not_claim_a_small_shift():
    o = page((WEAK, "60", False))[0]
    assert o["ok"], o
    assert "barely differs" not in o["msg"] and "ordinary pooled effect" not in o["msg"], o["msg"]
    assert "not evidence that the shift is small" in o["msg"], o["msg"]


# F12: p-values below the 3-dp resolution printed "p=0.000"; exp() of a large/small log ratio printed
# "Infinity"/"0.000". Requirement: "p<0.001", and an exp-overflow/underflow is shown as exp(log value).
STRONG = "\n".join(["A, 0.0, 0.01, 1", "B, 1.0, 0.01, 2", "C, 2.0, 0.01, 3", "D, 3.0, 0.01, 4", "E, 4.0, 0.01, 5"])
HUGE_LOG = "\n".join(["A, 700, 0.5, 1", "B, 705, 0.5, 2", "C, 712, 0.5, 3", "D, 716, 0.5, 4"])


def test_tiny_p_value_is_shown_as_below_resolution():
    o = page((STRONG, "3", False))[0]
    assert o["ok"] and "(p&lt;0.001)" in o["msg"], o["msg"]
    assert "p=0.000" not in o["msg"], o["msg"]


def test_exp_overflow_is_not_shown_as_infinity():
    o = page((HUGE_LOG, "5", True))[0]
    assert o["ok"], o
    assert "Infinity" not in o["msg"] and "exp(" in o["msg"], o["msg"]


def test_example_p_value_display_unchanged():
    o = page((EXAMPLE, "31", False))[0]
    assert "(p=0.019)" in o["msg"], o["msg"]
