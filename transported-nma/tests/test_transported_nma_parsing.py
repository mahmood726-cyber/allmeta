"""Whole-field number parsing on the transported-nma page (found 2026-11-12, lane rd2, in real Chrome).

parseFloat reads a number prefix, so "0.55oops" (effect), "55x" (covariate) or "age=72abc" (target) were used as
0.55, 55 and 72 without a message. Requirement: a non-empty field that is not a whole decimal number is refused and
named; clean input gives exactly the result it gave before; an empty covariate cell keeps its old behaviour.
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
const html=fs.readFileSync('transported-nma/index.html','utf8');
const els={};
const mk=(id)=>({id,value:'',innerHTML:'',textContent:'',checked:false,hidden:false,style:{},children:[],addEventListener(){},setAttribute(){},getAttribute(){return null},removeAttribute(){},appendChild(c){this.children.push(c)}});
const document={getElementById:(id)=>els[id]||(els[id]=mk(id)),querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>mk(''),body:mk('body')};
const sb={document,console,Math,JSON,Number,String,isFinite,parseFloat,Object,Array};
sb.window=sb;vm.createContext(sb);
for (const f of ['shared/ma-core.js','shared/multiplicative-nma.js','shared/transported-nma-v1.js']) vm.runInContext(fs.readFileSync(f,'utf8'),sb);
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m=>vm.runInContext(m[1],sb));
const $=(id)=>document.getElementById(id);
const C=["S1, A, B, 0.20, 0.10","S2, A, C, 0.55, 0.12","S3, B, C, 0.30, 0.11","S4, A, C, 0.62, 0.13","S5, B, C, 0.18, 0.12","S6, A, B, 0.34, 0.10"].join("\n");
const V=["study, age","S1, 52","S2, 55","S3, 58","S4, 71","S5, 74","S6, 76"].join("\n");
function go(c,v,t){$('f-contrasts').value=c;$('f-cov').value=v;$('f-target').value=t;$('f-higher').checked=true;$('f-ref').value='A';
  const r=sb.window.__almTransportedNMA.run();return {ok:!!r,ess:r?r.transport.ess:null,c:r?r.transported.effects.C.estimate:null,msg:$('result').innerHTML};}
"""


def _run(body):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_clean_input_unchanged_control():
    o = _run("console.log(JSON.stringify([go(C,V,'age=72'),go(C,V,'age = 7.2e1')]));")
    assert o[0]["ok"] and o[1]["ok"] and o[0]["c"] == o[1]["c"] and o[0]["ess"] == o[1]["ess"]


def test_effect_with_trailing_junk_is_refused():
    o = _run("console.log(JSON.stringify(go(C.replace('0.55','0.55oops'),V,'age=72')));")
    assert not o["ok"] and "line 2" in o["msg"]


def test_covariate_with_trailing_junk_is_refused():
    o = _run("console.log(JSON.stringify(go(C,V.replace('S2, 55','S2, 55x'),'age=72')));")
    assert not o["ok"] and "S2" in o["msg"]


def test_target_with_trailing_junk_is_refused():
    o = _run("console.log(JSON.stringify(go(C,V,'age=72abc')));")
    assert not o["ok"]


def test_bad_target_is_not_hidden_by_a_key_named_like_the_error_list():
    # Independent review (Codex, read-only) of the first version: bad keys were collected in t.__bad, a key a user
    # can also type, so 'age=oops;__bad=0;age=72' overwrote the error list and the junk value passed.
    o = _run("console.log(JSON.stringify([go(C,V,'age=oops;__bad=0;age=72'),go(C,V,'__bad=1;age=oops')]));")
    assert not o[0]["ok"] and not o[1]["ok"]
    assert "age" in o[0]["msg"] and "age" in o[1]["msg"]
