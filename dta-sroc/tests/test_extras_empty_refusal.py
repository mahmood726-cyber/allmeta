"""Extras panel with no data (found 2026-11-12 in real Chrome by another lane, reproduced here).

On a fresh page, "Check current extras in live R" printed "FAIL: Each row must contain TP,FN,FP,TN,x": the
empty study box reached the row parser and the adapter's run() prefixes every thrown message with "FAIL:",
so an empty panel read as a failed validation. Requirement: with no data the panel reads as a refusal
("Refused: load or enter data first") and does not say FAIL; a malformed non-empty row keeps its message; a
real failure is still reported as FAIL.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = r"""
const fs=require('fs'),vm=require('vm');
const els={};
const mk=(id)=>({id,value:'',innerHTML:'',textContent:'',disabled:false,options:[],style:{},append(){},replaceChildren(){},addEventListener(t,f){(this.L=this.L||{})[t]=f},setAttribute(){},getAttribute(){return null}});
const document={getElementById:(id)=>els[id]||(els[id]=mk(id)),createElement:()=>mk('')};
const sb={document,console,Math,JSON,Number,String,Error,Object,Array,Promise,setTimeout,fetch:async()=>{throw Error('offline')},AlmDTAPlusPins:{files:[{path:'x',sha256:'x'}]}};
sb.globalThis=sb;vm.createContext(sb);
for(const f of ['plus-bivariate.js','plus.js','plus-ui.js','validate/plus-adapter.js'])vm.runInContext(fs.readFileSync('dta-sroc/'+f,'utf8'),sb);
const $=(id)=>document.getElementById('plus-'+id);
const tick=()=>new Promise(r=>setTimeout(r,20));
"""


def run(body):
    js = PRELUDE + "(async()=>{" + body + "})().catch(e=>{console.error(e);process.exit(1)});"
    out = subprocess.run([NODE, "-e", js], cwd=ROOT.parent, capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_live_check_on_empty_panel_is_a_refusal_not_fail():
    r = run("await tick(); $('live').onclick(); await tick(); process.stdout.write(JSON.stringify({v:$('validation').textContent}));")
    assert r["v"] == "Refused: load or enter data first"
    assert "FAIL" not in r["v"]


def test_fit_on_empty_panel_is_a_refusal():
    r = run("$('fit').onclick(); process.stdout.write(JSON.stringify({e:$('error').textContent}));")
    assert r["e"] == "Refused: load or enter data first"


def test_malformed_row_keeps_its_message():
    r = run("await tick(); $('data').value='1,2,3'; $('fit').onclick(); process.stdout.write(JSON.stringify({e:$('error').textContent}));")
    assert r["e"] == "Each row must contain TP,FN,FP,TN,x"


def test_a_real_live_failure_is_still_fail():
    # valid rows from the pinned corpus; live R is not available here, so the check genuinely cannot complete
    r = run("await tick(); const c=JSON.parse(fs.readFileSync('dta-sroc/validate/corpus/plus-reference.json','utf8'));"
            "const k=c.cases.find(x=>x.ok); $('data').value=k.rows.map(x=>[x.TP,x.FN,x.FP,x.TN,x.x].join(',')).join(String.fromCharCode(10));"
            "$('live').onclick(); await tick(); process.stdout.write(JSON.stringify({v:$('validation').textContent}));")
    assert r["v"].startswith("FAIL: ")
    assert "Each row" not in r["v"] and "Refused" not in r["v"]
