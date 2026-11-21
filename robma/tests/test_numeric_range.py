"""Numerical range of the RoBMA page (limitation sweep P56 F07, lane lim8, 2026-11-20).

A finite SE whose square is not a finite positive double (1e-200 -> 0, 1e200 -> Inf) gave NaN results
labelled "favours null", or hung the tab: with v = Inf every tau-integrand value is -Inf, the shift
M = -Inf makes exp(g - M) = NaN, and adaptive Simpson never meets its tolerance on NaN, recursing to
depth 50 per panel. Requirement: such inputs are refused before analysis, a non-finite result is never
shown or labelled, the engine returns instead of hanging, and a refusal clears an earlier result.
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
const html=fs.readFileSync('robma/index.html','utf8');
const els={};
// textContent and innerHTML share one store, as in a real DOM (setting textContent replaces the markup).
const mk=(id)=>({id,value:'',_h:'',get innerHTML(){return this._h},set innerHTML(v){this._h=String(v)},get textContent(){return this._h.replace(/<[^>]*>/g,'')},set textContent(v){this._h=String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;')},style:{},addEventListener(t,f){this['on'+t]=f},setAttribute(){},getAttribute(){return null},appendChild(){},removeChild(){},click(){}});
const document={getElementById:(id)=>els[id]||(els[id]=mk(id)),querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>mk(''),body:mk('body')};
const sb={document,console,Math,JSON,Number,String,isFinite,parseFloat};
sb.window=sb;vm.createContext(sb);
vm.runInContext(fs.readFileSync('shared/robma.js','utf8'),sb);
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m=>vm.runInContext(m[1],sb));
const $=(id)=>document.getElementById(id);
"""

EXAMPLE = ("Study A, 0.10, 0.20\nStudy B, 0.30, 0.25\nStudy C, 0.50, 0.18\nStudy D, 0.20, 0.30\n"
           "Study E, 0.90, 0.22\nStudy F, 0.40, 0.28\nStudy G, 1.10, 0.35\nStudy H, 0.05, 0.15")


def type_in(*texts):
    """Type each text into the study box in turn (input event); report the page state after the last."""
    js = PRELUDE + r"""
const texts=%s;
for (const t of texts) { $('f-data').value=t; $('f-data').oninput(); }
const c=sb.__almRCheckInputs();
process.stdout.write(JSON.stringify({head:$('headline').innerHTML, body:$('model-body').innerHTML,
  last:sb._almLastRoBMA(), yi:c&&c.yi, sei:c&&c.sei}));
""" % json.dumps(list(texts))
    out = subprocess.run([NODE, "-e", js], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def refused(r, *words):
    assert r["last"] is None and r["yi"] is None, r
    assert r["body"] == "", r
    assert "BF" not in r["head"] and "favours" not in r["head"], r
    for w in words:
        assert w in r["head"], (w, r["head"])


@pytest.mark.parametrize("se", ["1e-200", "1e200", "1e-160", "2e154"])
def test_se_outside_supported_range_refuses(se):
    r = type_in("a, 0.1, %s\nb, 0.3, %s" % (se, se))
    refused(r, "line 1")


def test_refusal_clears_an_earlier_result():
    r = type_in(EXAMPLE, "a, 0.1, 1e-200\nb, 0.3, 1e-200")
    refused(r)


def test_engine_returns_for_overflowing_variance_instead_of_hanging():
    js = ("const R=require('./shared/robma.js');const o=R.analysis([0.1,0.3],[1e200,1e200]);"
          "console.log(JSON.stringify({l:o.logMarginal.H0RE===-Infinity, p:isFinite(o.pInclEffect)}));")
    out = subprocess.run([NODE, "-e", js], cwd=ROOT, capture_output=True, text=True, timeout=30)
    assert out.returncode == 0, out.stderr
    assert json.loads(out.stdout) == {"l": True, "p": False}


def test_non_finite_result_is_refused_not_labelled():
    # Defence in depth: whatever the cause, a non-finite result is never shown or labelled "favours null".
    js = PRELUDE + r"""
const a=sb.AlmRoBMA.analysis; sb.AlmRoBMA.analysis=function(y,s){ return Object.assign(a(y,s), {pInclEffect:NaN}); };
$('f-data').value=%s; $('f-data').oninput();
process.stdout.write(JSON.stringify({head:$('headline').innerHTML, last:sb._almLastRoBMA()}));
""" % json.dumps(EXAMPLE)
    out = subprocess.run([NODE, "-e", js], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert out.returncode == 0, out.stderr
    r = json.loads(out.stdout)
    assert r["last"] is None and "favours" not in r["head"] and "BF" not in r["head"], r
