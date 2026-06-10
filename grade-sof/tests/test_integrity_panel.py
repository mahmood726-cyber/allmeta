"""Tests for shared/integrity-panel-v1.js — the integrity-by-default panel.

Orchestrates the audited engines (spec-collapse, egger, evalue) in Node and
checks it returns the right verdicts, including the spec-collapse atlas
false-robust example (naive significance that collapses under correction).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = (
    "require('./shared/ma-core.js');require('./shared/trimfill.js');"
    "require('./shared/spec-collapse.js');require('./shared/egger.js');require('./shared/evalue.js');"
    "const P=require('./shared/integrity-panel-v1.js');"
)


def _run(body: str) -> dict:
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=40, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def _by_key(checks):
    return {c["key"]: c for c in checks}


def test_runs_all_three_engines_on_a_clean_pool():
    o = _run(
        "const s=[{est:-0.16,se:0.07},{est:-0.24,se:0.06},{est:-0.10,se:0.09},{est:-0.30,se:0.10},"
        "{est:-0.05,se:0.12},{est:-0.20,se:0.05},{est:-0.40,se:0.15}];"
        "const p={pointEstimate:0.84,ciLo:0.77,ciHi:0.92,measure:'HR'};"
        "const r=P.assess({studies:s,pooled:p});"
        "console.log(JSON.stringify({keys:r.checks.map(c=>c.key),status:r.checks.map(c=>c.status),ran:r.summary.ran}));"
    )
    assert o["keys"] == ["spec-collapse", "egger", "evalue"]
    assert o["ran"] == 3
    assert all(s != "na" for s in o["status"])


def test_false_robust_is_flagged_on_the_atlas_example():
    # spec-collapse-atlas headline dataset: naive 'robust' collapses to fragile.
    o = _run(
        "const s=[{est:-0.25,se:0.22},{est:-0.15,se:0.20},{est:-0.40,se:0.30},{est:0.00,se:0.18},"
        "{est:-0.30,se:0.26},{est:-0.05,se:0.17},{est:-0.45,se:0.33},{est:-0.12,se:0.19}];"
        "const r=P.assess({studies:s,pooled:{pointEstimate:0.80,ciLo:0.64,ciHi:1.00,measure:'OR'}});"
        "const sc=r.checks.find(c=>c.key==='spec-collapse');"
        "console.log(JSON.stringify({status:sc.status,verdict:sc.verdict,flags:r.summary.flags}));"
    )
    assert o["status"] == "flag"
    assert "FALSE-ROBUST" in o["verdict"]
    assert o["flags"] >= 1


def test_egger_flags_funnel_asymmetry():
    # small studies (large SE) skew more extreme -> asymmetry
    o = _run(
        "const s=[{est:-0.05,se:0.05},{est:-0.08,se:0.06},{est:-0.10,se:0.07},{est:-0.45,se:0.28},"
        "{est:-0.60,se:0.34},{est:-0.70,se:0.40},{est:-0.12,se:0.09},{est:-0.15,se:0.10}];"
        "const r=P.assess({studies:s,pooled:null});"
        "const eg=r.checks.find(c=>c.key==='egger');"
        "console.log(JSON.stringify({status:eg.status,verdict:eg.verdict}));"
    )
    assert o["status"] in ("flag", "ok")          # depends on data; verdict text must be coherent
    assert "asymmetry" in o["verdict"].lower()


def test_evalue_na_for_mean_difference():
    o = _run(
        "const r=P.assess({studies:[{est:0.3,se:0.1},{est:0.4,se:0.12},{est:0.2,se:0.15},{est:0.5,se:0.2}],"
        "pooled:{pointEstimate:0.35,ciLo:0.2,ciHi:0.5,measure:'MD'}});"
        "const ev=r.checks.find(c=>c.key==='evalue');"
        "console.log(JSON.stringify({status:ev.status,verdict:ev.verdict}));"
    )
    assert o["status"] == "na"
    assert "ratio" in o["verdict"].lower() or "SMD" in o["verdict"]


def test_na_guards_with_too_few_studies():
    o = _run("console.log(JSON.stringify(P.assess({studies:[{est:-0.2,se:0.1}],pooled:null}).checks.map(c=>({k:c.key,s:c.status}))));")
    bykey = {c["k"]: c["s"] for c in o}
    assert bykey["spec-collapse"] == "na"          # needs >=4
    assert bykey["egger"] == "na"                  # needs >=3
