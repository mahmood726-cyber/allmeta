"""Behavioural tests for inspect-sr against the published INSPECT-SR rules (guidance v1.1.2).

The page's own inline script is run in a Node vm context (no browser). Rules tested:
- a domain may be judged "no concerns" only after all of its checks are answered (only "serious
  concerns" permits stopping early), so a partly answered domain must not be suggested "no concerns";
- the overall judgement is made after all four domains are judged (or on "serious concerns"), so an
  unjudged domain must not yield an overall "no" or "some";
- the "exclude serious concerns" analysis set contains assessed trials (no/some concerns) only;
- check wording follows the published tool.
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
const html=fs.readFileSync('inspect-sr/index.html','utf8');
const el=()=>({value:'',innerHTML:'',style:{},addEventListener(){},setAttribute(){},getAttribute(){return null}});
const els={};
const document={getElementById:(id)=>els[id]||(els[id]=el()),getElementsByName:()=>[],querySelectorAll:()=>[],createElement:el,body:el()};
const sb={document,console,Math,JSON,localStorage:{getItem(){return null},setItem(){}},confirm(){return false}};
sb.window=sb;vm.createContext(sb);
vm.runInContext(fs.readFileSync('shared/ma-core.js','utf8'),sb);
const inl=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
inl.forEach(c=>vm.runInContext(c,sb));
const T=(o)=>Object.assign({label:'',resp:{},dj:{},overall:'',est:'',se:''},o||{});
"""


def _run(body: str):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_partly_answered_domain_is_not_no_concerns():
    o = _run("console.log(JSON.stringify([sb.suggestDomain(T({resp:{'4.1':'no'}}),4),"
             "sb.suggestDomain(T({resp:{'1.1':'no','1.2':'no'}}),1),"
             "sb.suggestDomain(T({resp:{'1.1':'no','1.2':'no','1.3':'na'}}),1),"
             "sb.suggestDomain(T(),2)]));")
    assert o[0] != "no" and o[1] != "no"
    assert o[2] == "no"          # all checks answered, no problems: no concerns may be suggested
    assert o[3] == "unset"


def test_overall_needs_every_domain_or_serious():
    o = _run("console.log(JSON.stringify([sb.effectiveOverall(T({dj:{1:'no'}})),"
             "sb.effectiveOverall(T({dj:{1:'some',2:'no'}})),"
             "sb.effectiveOverall(T({dj:{1:'serious'}})),"
             "sb.effectiveOverall(T({dj:{1:'no',2:'some',3:'no',4:'no'}}))]));")
    assert o == ["unset", "unset", "serious", "some"]


def test_exclude_serious_set_has_assessed_trials_only():
    o = _run(
        "const full=(j)=>T({dj:{1:j,2:j,3:j,4:j},est:'1',se:'0.1'});"
        "sb.state={trials:[full('no'),full('some'),full('serious'),T({est:'5',se:'0.1'}),T({dj:{1:'no'},est:'7',se:'0.1'})],cur:0};"
        "document.getElementById('scale').value='linear';sb.renderPooled();"
        "const ks=[...document.getElementById('pooled').innerHTML.matchAll(/<\\/td><td>(\\d+)<\\/td>/g)].map(m=>+m[1]);"
        "console.log(JSON.stringify(ks));")
    assert o == [5, 2, 1]        # all trials; no+some; no only


def test_check_wording_follows_guidance_v1_1_2():
    html = (ROOT / "inspect-sr" / "index.html").read_text(encoding="utf-8")
    for q in ("Are there concerns about the plausibility of conducting the study using the reported methods and resources?",
              "Are there inconsistencies in descriptions of methods and results across publications describing the study?",
              "Are numbers of participants allocated to each group implausible given the allocation method?"):
        assert q in html
    assert '"Text and figures"' in html
    assert "Not applicable" in html
    assert "10.1136/bmj-2026-100611" in html


def test_suggestion_labels_follow_answers_without_reload():
    # Found 2026-11-12 on the live page in real Chrome (lane rd2): answering checks 1.1-1.3
    # updated the summary table but the "suggested:" label beside the domain (and the overall
    # label after a domain judgement) kept the value from page load until a reload or a trial
    # switch, because commit() re-rendered the summary and pooled tables only.
    # Requirement: what the form says is suggested equals what suggestDomain/suggestOverall
    # return for the current answers, immediately after each answer.
    o = _run("sb.renderAll();"
             "sb.cur().resp['1.1']='yes'; sb.commit();"
             "const a=document.getElementById('sug-d1').textContent;"
             "sb.cur().resp['1.2']='no'; sb.cur().resp['1.3']='no'; sb.commit();"
             "const b=document.getElementById('sug-d1').textContent;"
             "sb.cur().dj[1]='serious'; sb.commit();"
             "const c=document.getElementById('sug-overall').textContent;"
             "console.log(JSON.stringify([a,b,c]));")
    assert o == ["suggested: Not set", "suggested: Some concerns", "suggested: Serious concerns"]
