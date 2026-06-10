"""Pure-logic tests for shared/sr-collab-v1.js (the Phase-3 team-folder merge).

Runs the module in Node (the same node-subprocess pattern the shared engines
use) so the browser collaboration code is exercised head-on. The File System
Access folder adapter is browser-only and feature-detected; here we only assert
it correctly reports unsupported under Node.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const C = require('./shared/sr-collab-v1.js');\n"

RECORDS = (
    "[{id:'1',doi:'10.1/a',title:'Study A',r1:{d:'',reason:''},r2:{d:'',reason:''},labels:[]},"
    " {id:'2',pmid:'999',title:'Study B',r1:{d:'',reason:''},r2:{d:'',reason:''},labels:[]},"
    " {id:'3',title:'Study C',r1:{d:'',reason:''},r2:{d:'',reason:''},labels:[]},"
    " {id:'4',title:'Study D',dup:true,r1:{d:'',reason:''},r2:{d:'',reason:''},labels:[]}]"
)
R1 = "{_schema:'sr-reviewer-v1',reviewer:'r1',decisions:[{id:'1',d:'include'},{doi:'10.1/A',d:'include'},{pmid:'999',d:'exclude'},{title:'Study C',d:'include'}]}"
R2 = "{_schema:'sr-reviewer-v1',reviewer:'r2',decisions:[{id:'1',d:'include'},{pmid:'999',d:'include'},{title:'Study C',d:'include'}]}"


def _run(script: str) -> dict:
    r = subprocess.run([NODE, "-e", PRELUDE + script], capture_output=True, text=True,
                       timeout=30, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_merge_fills_both_slots_by_id_doi_pmid_title():
    o = _run(
        f"const recs={RECORDS};"
        f"const res=C.mergeReviewerFiles(recs,[{R1},{R2}]);"
        "console.log(JSON.stringify({"
        " slots:res.perReviewer.map(p=>p.slot),"
        " filled:res.perReviewer.map(p=>p.filled),"
        " rec1:[recs[0].r1.d,recs[0].r2.d],"   # id match
        " rec2:[recs[1].r1.d,recs[1].r2.d],"   # pmid match -> conflict
        " rec3:[recs[2].r1.d,recs[2].r2.d]}));" # title match
    )
    assert o["slots"] == ["r1", "r2"]
    assert o["filled"] == [4, 3]
    assert o["rec1"] == ["include", "include"]      # DOI case-insensitive too
    assert o["rec2"] == ["exclude", "include"]      # disagreement
    assert o["rec3"] == ["include", "include"]


def test_summary_counts_conflicts_and_consensus_ignoring_dups():
    o = _run(
        f"const recs={RECORDS};"
        f"C.mergeReviewerFiles(recs,[{R1},{R2}]);"
        "console.log(JSON.stringify(C.summarize(recs)));"
    )
    assert o["n"] == 3                  # the dup record is excluded from the denominator
    assert o["decided"] == 3
    assert o["conflicts"] == 1          # rec2 (exclude vs include, unresolved)
    assert o["consensusIncluded"] == 2  # rec1 + rec3 both-include


def test_undeclared_reviewer_assigned_to_free_slot_deterministically():
    o = _run(
        f"const recs={RECORDS};"
        "const a={_schema:'sr-reviewer-v1',decisions:[{id:'1',d:'include'}]};"
        "const b={_schema:'sr-reviewer-v1',decisions:[{id:'1',d:'exclude'}]};"
        "const res=C.mergeReviewerFiles(recs,[a,b]);"
        "console.log(JSON.stringify(res.perReviewer.map(p=>p.slot)));"
    )
    assert o == ["r1", "r2"]


def test_third_undeclared_file_is_dropped_not_silently_overwriting_r2():
    # The schema has only r1/r2. A 3rd UNDECLARED reviewer file must fail closed
    # (error + dropped), never clobber whoever already holds r2.
    o = _run(
        f"const recs={RECORDS};"
        "const a={_schema:'sr-reviewer-v1',decisions:[{id:'1',d:'include'}]};"
        "const b={_schema:'sr-reviewer-v1',decisions:[{id:'1',d:'exclude'}]};"
        "const c={_schema:'sr-reviewer-v1',decisions:[{id:'1',d:'maybe'}]};"
        "const res=C.mergeReviewerFiles(recs,[a,b,c]);"
        "console.log(JSON.stringify({"
        " slots:res.perReviewer.map(p=>p.slot),"
        " err3:!!res.perReviewer[2].error,"
        " filled3:res.perReviewer[2].filled,"
        " r2:recs[0].r2.d}));"  # must remain b's 'exclude', not c's 'maybe'
    )
    assert o["slots"] == ["r1", "r2", None]
    assert o["err3"] is True and o["filled3"] == 0
    assert o["r2"] == "exclude"   # reviewer 2 was NOT clobbered by the overflow file


def test_declared_resubmission_updates_same_slot():
    # A re-submitted file for the SAME declared reviewer legitimately overwrites
    # that slot (it's an update, not a third reviewer).
    o = _run(
        f"const recs={RECORDS};"
        "const v1={_schema:'sr-reviewer-v1',reviewer:'r1',decisions:[{id:'1',d:'include'}]};"
        "const v2={_schema:'sr-reviewer-v1',reviewer:'r1',decisions:[{id:'1',d:'exclude'}]};"
        "const res=C.mergeReviewerFiles(recs,[v1,v2]);"
        "console.log(JSON.stringify({slots:res.perReviewer.map(p=>p.slot),r1:recs[0].r1.d}));"
    )
    assert o["slots"] == ["r1", "r1"]
    assert o["r1"] == "exclude"   # the update took


def test_bad_payload_reports_error_without_throwing():
    o = _run(
        f"const recs={RECORDS};"
        "const res=C.mergeReviewerFiles(recs,[{_schema:'sr-reviewer-v1'}]);"
        "console.log(JSON.stringify(res.perReviewer[0]));"
    )
    assert "error" in o and o["filled"] == 0


def test_build_reviewer_envelope_roundtrips_decisions():
    o = _run(
        "const recs=[{id:'1',doi:'10.1/a',pmid:'5',title:'A',r1:{d:'include',reason:'rct'},r2:{d:'',reason:''},labels:['key']},"
        " {id:'2',title:'B',dup:true,r1:{d:'exclude',reason:'x'},r2:{d:'',reason:''},labels:[]}];"
        "const env=C.buildReviewerEnvelope('r1',recs,'Proj','2026-01-01T00:00:00Z');"
        "console.log(JSON.stringify({schema:env._schema,who:env.reviewer,count:env.count,first:env.decisions[0]}));"
    )
    assert o["schema"] == "sr-reviewer-v1"
    assert o["who"] == "r1"
    assert o["count"] == 1            # the dup is dropped, the undecided r1 too
    assert o["first"]["d"] == "include"


def test_folder_api_unsupported_under_node():
    o = _run("console.log(JSON.stringify({s:C.supportsFolder()}));")
    assert o["s"] is False
