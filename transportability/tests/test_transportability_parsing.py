"""Whole-field number parsing on the transportability page (found 2026-11-12, lane rd2, in real Chrome).

parseFloat reads a number prefix, so "-0.889oops" in the effect column was used as -0.889 and a target of
"31abc" was used as 31, with no message: a typo changed the analysis silently. Requirement: a field that is not
a whole decimal number is refused with the line named; clean input gives exactly the result it gave before.
(A row whose SE is 0 is still dropped, as before; that behaviour is pinned by the P58 archive probe probe_se0.)
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
const DATA=["A, -0.889, 0.571, 44","B, -1.585, 0.441, 55","C, -1.348, 0.644, 42","D, -1.442, 0.141, 52","E, -0.218, 0.227, 13"].join("\n");
function go(data,target){$('f-data').value=data;$('f-target').value=target;$('f-modname').value='x';$('f-log').checked=false;
  const r=sb.window.__almTransport.run();return {ok:!!r,est:r?r.transported.est:null,k:r?r.k:null,msg:$('result').innerHTML};}
"""


def _run(body):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_clean_input_unchanged_control():
    o = _run("console.log(JSON.stringify([go(DATA,'30'),go(DATA,'3e1'),go(DATA,' 30 ')]));")
    assert o[0]["ok"] and o[0]["k"] == 5
    assert o[1]["est"] == o[0]["est"] and o[2]["est"] == o[0]["est"]


def test_effect_with_trailing_junk_is_refused_naming_the_line():
    o = _run("console.log(JSON.stringify(go(DATA.replace('-1.585','-1.585oops'),'30')));")
    assert not o["ok"]
    assert "line 2" in o["msg"]


def test_target_with_trailing_junk_is_refused():
    o = _run("console.log(JSON.stringify([go(DATA,'31abc'),go(DATA,'')]));")
    assert not o[0]["ok"] and not o[1]["ok"]


def test_se_zero_row_still_dropped_not_refused():
    o = _run("console.log(JSON.stringify(go(DATA.replace('0.571','0'),'30')));")
    assert o["ok"] and o["k"] == 4
