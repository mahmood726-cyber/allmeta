"""Tests for the vendored registry-ipd engine (shared/vendor/registry-ipd).

Verifies the VENDORED copy loads and reconstructs each richness tier correctly
in Node (Tier A exportable pseudo-IPD; Tier B parametric; Tier C fails closed —
never fabricated). The engine itself is validated upstream (registry-ipd
VALIDATION.md); here we pin that allmeta's vendored copy behaves.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const RIPD=require('./shared/vendor/registry-ipd/engine.js');"

A_TRIAL = (
    "{nct_id:'A',time_unit:'months',arms:["
    "{arm_id:'e',label:'Drug',role:'experimental',N:200,total_events:131,follow_up_max:24,"
    "km_points:[{t:0,S:1},{t:4,S:0.905},{t:8,S:0.81},{t:12,S:0.69},{t:16,S:0.59},{t:20,S:0.505}],"
    "number_at_risk:[{t:0,n:200},{t:8,n:150},{t:16,n:95},{t:24,n:40}]},"
    "{arm_id:'c',label:'Placebo',role:'comparator',N:200,total_events:150,follow_up_max:24,"
    "km_points:[{t:0,S:1},{t:4,S:0.86},{t:8,S:0.71},{t:12,S:0.55},{t:16,S:0.43},{t:20,S:0.33}],"
    "number_at_risk:[{t:0,n:200},{t:8,n:135},{t:16,n:78},{t:24,n:28}]}]}"
)
B_TRIAL = (
    "{nct_id:'B',time_unit:'months',hr:{value:0.62,favors_arm_id:'e'},arms:["
    "{arm_id:'e',label:'Drug',role:'experimental',N:300,total_events:165,follow_up_max:30,median:{value:16}},"
    "{arm_id:'c',label:'Placebo',role:'comparator',N:300,total_events:200,follow_up_max:30,median:{value:11}}]}"
)
C_TRIAL = "{nct_id:'C',hr:{value:0.7},arms:[{arm_id:'e',role:'experimental',N:100},{arm_id:'c',role:'comparator',N:100}]}"


def _run(body: str):
    r = subprocess.run([NODE, "-e", PRELUDE + body], capture_output=True, text=True, timeout=40, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_tier_a_reconstructs_exportable_pseudo_ipd():
    o = _run(
        f"const r=RIPD.reconstruct({A_TRIAL},{{}});"
        "console.log(JSON.stringify({tier:r.tier,exportable:r.exportable,arms:r.arms.length,"
        "ipdE:r.arms[0].ipd.length,method:r.method,badge:r.audit.badge}));"
    )
    assert o["tier"] == "A" and o["exportable"] is True
    assert o["arms"] == 2 and o["ipdE"] == 200          # N reconstructed rows
    assert o["method"] in ("guyot", "anchor-exact", "qp")
    assert o["badge"] in ("gold", "silver", "bronze")


def test_tier_b_is_parametric_and_exportable():
    o = _run(
        f"const r=RIPD.reconstruct({B_TRIAL},{{bootstrap:50}});"
        "console.log(JSON.stringify({tier:r.tier,exportable:r.exportable,arms:r.arms?r.arms.length:0}));"
    )
    assert o["tier"] == "B" and o["exportable"] is True and o["arms"] == 2


def test_tier_c_fails_closed_never_fabricates():
    o = _run(
        f"const r=RIPD.reconstruct({C_TRIAL},{{}});"
        "console.log(JSON.stringify({tier:r.tier,exportable:r.exportable,ipd:r.ipd,verdict:r.verdict}));"
    )
    assert o["tier"] == "C"
    assert o["exportable"] is False and o["ipd"] is None
    assert o["verdict"] == "insufficient_registry_data"


def test_reconstructed_km_tracks_the_registry_anchors():
    # The Tier A reconstruction should reproduce the registry anchors closely.
    # 1-Wasserstein is an area in time units; over a 24-month horizon a good fit
    # is a small fraction of it (here ~2.3 ≈ 10% of 24).
    o = _run(
        f"const r=RIPD.reconstruct({A_TRIAL},{{}});"
        "console.log(JSON.stringify({w:r.wasserstein_to_anchors}));"
    )
    assert o["w"] is not None and o["w"] < 0.15 * 24    # within ~15% of the follow-up horizon
