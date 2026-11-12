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


# P63 (registry-ipd validation archive, defects D1/D2): both vendored copies of the engine must carry the
# upstream corrections validated there (registry-ipd e032ddd = archive app/fixed, 8093/8093 against R).
VENDORED = ["./shared/vendor/registry-ipd/engine.js", "./shared/survival-reconstruction.js"]


def _run_mod(mod: str, body: str):
    r = subprocess.run([NODE, "-e", f"const RIPD=require('{mod}');" + body],
                       capture_output=True, text=True, timeout=40, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


ROWS = ("const rows=(s)=>s.flatMap(([t,d,c])=>[...Array(d).fill({time:t,status:1}),"
        "...Array(c).fill({time:t,status:0})]);")


@pytest.mark.parametrize("mod", VENDORED)
def test_step_median_on_exact_half_plateau_follows_survfit(mod):
    # survival::survfit: on an exact S = 0.5 plateau the median is the midpoint to the next drop.
    # b: a TERMINAL 0.5 plateau (events at 1, 2; censored at 3, 4) gives 2, the plateau start: this is
    # summary(survfit)$table["median"] (survmean's minmin), the P63 target, checked in R 4.6.0 /
    # survival 3.8-6. quantile.survfit(fit, 0.5) gives 3 there (findq's last-point rule): a different R
    # function, not the one the page is validated against.
    # 13 events at t=1 of n=26 -> S = 0.5 on [1, 12); next drop at 12 -> median 6.5 (R), not 1.
    o = _run_mod(mod, ROWS + "const _=RIPD._;console.log(JSON.stringify({"
                 "a:_.medianFromKM(_.kmFromIPD(rows([[1,13,0],[12,8,5]]))),"
                 "b:_.medianFromKM(_.kmFromIPD(rows([[1,1,0],[2,1,0],[3,0,1],[4,0,1]]))),"
                 "c:_.medianFromKM(_.kmFromIPD(rows([[1,1,0],[2,1,0],[3,1,0]]))),"
                 "i:_.medianFromKM(_.kmFromIPD(rows([[1,13,0],[12,8,5]])),{interpolate:true})}));")
    assert o == {"a": 6.5, "b": 2, "c": 2, "i": 1}


@pytest.mark.parametrize("mod", VENDORED)
def test_step_median_uses_survfit_tolerance_on_both_sides(mod):
    # The parity target is unname(summary(survfit(...))$table["median"]) (P63 R/oracle.R), i.e.
    # survival 3.8-6 survmean()'s minmin(): keep S < 0.5 + sqrt(eps); at the first kept time, if
    # |S - 0.5| < sqrt(eps) and the curve later drops (strictly) below it, take the midpoint to the
    # first such time. Values below are from R 4.6.0 / survival 3.8-6 on the same data.
    # a) 5937 at risk; t=1 one event + one censoring; t=2 2967 events (S = 0.5 + 1.419e-8);
    #    t=12 100 events; 2868 censored at 20 -> survfit median 7 (old engine: 12).
    # b) case-weighted survfit: S = 0.5 on [1,3), 0.5 - 1e-9 from 3, 0.3 from 5 -> median 2
    #    (the drop at 3 is smaller than sqrt(eps) but minmin's test is strict y < y[1]; old engine: 3).
    # r) the review's example, case-weighted survfit S = 0.500000001 then 0.4 at 12 -> 6.5 (old: 12).
    # n) S never below 0.5 but within sqrt(eps) above it at 4 -> survfit reports 4 (old engine: null).
    o = _run_mod(mod, ROWS + "const _=RIPD._;console.log(JSON.stringify({"
                 "a:_.medianFromKM(_.kmFromIPD(rows([[1,1,1],[2,2967,0],[12,100,0],[20,0,2868]]))),"
                 "b:_.medianFromKM([{t:1,S:0.5},{t:2,S:0.5},{t:3,S:0.49999999899999997},"
                 "{t:5,S:0.29999999899999996},{t:6,S:0.29999999899999996}]),"
                 "r:_.medianFromKM([{t:1,S:0.500000001},{t:12,S:0.4}]),"
                 "n:_.medianFromKM([{t:1,S:0.7},{t:4,S:0.500000001}])}));")
    assert o == {"a": 7, "b": 2, "r": 6.5, "n": 4}


@pytest.mark.parametrize("mod", VENDORED)
def test_cox_quasi_separation_does_not_diverge(mod):
    # Both arms have events but are perfectly ordered: the unpenalised Newton fit never converges
    # (beta ~ 30, HR ~ 1e13). The upstream guard retries once with ridge 1 and returns a bounded fit.
    o = _run_mod(mod, "const rows=[1,2,3].map(t=>({time:t,status:1,x:1})).concat([4,5,6].map(t=>({time:t,status:1,x:0})));"
                 "const c=RIPD._.coxLogHR(rows);console.log(JSON.stringify({b:c.beta,p:!!c.penalized,cv:c.converged}));")
    assert abs(o["b"]) < 5 and o["p"] is True and o["cv"] is True
