"""Tests for shared/nmi.js — Network Meta-Interpolation (Harari et al. 2023).

Numerical baseline for the frontier module (v13). Every anchor was computed LIVE
with R 4.6.0 (metafor / netmeta) and is pinned here; the reference NMI algorithm
values come from a faithful port of the paper's NMI_Functions.R.

Reductions locked:
  (a) single-EM two-subgroup interpolation (cov="independent")
      == metafor::rma(yi, vi, mods=~EM) predicted at x*   (point AND SE).
  (b) no-EM-variation network  == plain anchored FE NMA / Bucher indirect
      (cross-checked vs netmeta and shared/nma-multiarm-v1.js).
  (c) faithfulness: BLUP design + cov="minnorm" reproduces the reference
      NMI_Functions.R interpolated TE*/SE* on the paper's 2-EM example.
  (d) end-to-end fit() (BLUP+minnorm+FE NMA) == netmeta FE NMA on the
      interpolated contrasts, for the paper's 6-study network.
"""
import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = "const NMI = require('./shared/nmi.js');\n"


def _run(body: str):
    r = subprocess.run(
        [NODE, "-e", PRELUDE + body],
        capture_output=True, text=True, timeout=30, cwd=str(ROOT),
    )
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


# ------------------------------------------------------------------ gate (a)
def test_single_em_two_subgroup_reduces_to_metaregression():
    """cov='independent', 2 subgroup points -> metafor::rma(~EM) at x*.

    metafor anchor (FE, saturated), predict at x*=0.675 for
    yi=(0.5,1.8) at EM=(0,1), se=(0.32,0.24):  pred=1.377500000000, se=0.192509740013.
    """
    out = _run(
        "const r=NMI.interpolateStudy({X:[[0],[1]],TE:[0.5,1.8],se:[0.32,0.24]},"
        "[0.675],{cov:'independent'});console.log(JSON.stringify([r.TE,r.se]));"
    )
    assert math.isclose(out[0], 1.377500000000, abs_tol=1e-9)
    assert math.isclose(out[1], 0.192509740013, abs_tol=1e-9)


def test_single_em_point_matches_metaregression_various_targets():
    """The interpolated point is the exact saturated line for any target x*."""
    y0, y1, s0, s1 = 0.5, 1.8, 0.32, 0.24
    for xstar in (0.0, 0.25, 0.675, 1.0, 1.4, -0.3):
        out = _run(
            f"const r=NMI.interpolateStudy({{X:[[0],[1]],TE:[{y0},{y1}],se:[{s0},{s1}]}},"
            f"[{xstar}],{{cov:'independent'}});console.log(JSON.stringify([r.TE,r.se]));"
        )
        w = (xstar - 0.0) / (1.0 - 0.0)
        te_cf = (1 - w) * y0 + w * y1
        se_cf = math.sqrt((1 - w) ** 2 * s0 ** 2 + w ** 2 * s1 ** 2)
        assert math.isclose(out[0], te_cf, abs_tol=1e-9)
        assert math.isclose(out[1], se_cf, abs_tol=1e-9)


# ------------------------------------------------------------------ gate (b)
_FLAT = (
    "function one(id,a,b,te,se){return {study:id,t1:a,t2:b,X:[[0.5]],TE:[te],se:[se]};}"
    "const S=[one('s1','A','B',1.0,0.20),one('s2','A','B',1.2,0.25),"
    "one('s3','A','C',2.0,0.22),one('s4','A','C',2.2,0.30)];"
    "const f=NMI.fit(S,[0.5],{ref:'A',model:'fe'});"
    "const bc=f.contrasts.find(c=>c.from==='B'&&c.to==='C');"
    "console.log(JSON.stringify([bc.est,bc.se]));"
)


def test_no_em_variation_reduces_to_bucher():
    """Single overall estimate per study -> plain anchored FE NMA (Bucher).

    netmeta / shared-engine anchor: dBC=0.991893416044, se=0.236356155709.
    """
    out = _run(_FLAT)
    assert math.isclose(out[0], 0.991893416044, abs_tol=1e-9)
    assert math.isclose(out[1], 0.236356155709, abs_tol=1e-9)


def test_constant_em_column_is_passthrough():
    """Subgroups present but EM identical across them (rank-deficient) ->
    passthrough of the overall estimate, still reducing to Bucher."""
    body = (
        "function flat(id,a,b,te,se){return {study:id,t1:a,t2:b,X:[[0.5],[0.5],[0.5]],"
        "TE:[te,te+0.3,te-0.3],se:[se,0.9,0.9]};}"
        "const S=[flat('s1','A','B',1.0,0.20),flat('s2','A','B',1.2,0.25),"
        "flat('s3','A','C',2.0,0.22),flat('s4','A','C',2.2,0.30)];"
        "const f=NMI.fit(S,[0.5],{ref:'A',model:'fe'});"
        "const bc=f.contrasts.find(c=>c.from==='B'&&c.to==='C');"
        "console.log(JSON.stringify([bc.est,bc.se,f.interpolated[0].degenerate]));"
    )
    out = _run(body)
    assert math.isclose(out[0], 0.991893416044, abs_tol=1e-9)
    assert math.isclose(out[1], 0.236356155709, abs_tol=1e-9)
    assert out[2] is True  # flagged degenerate


# ------------------------------------------------------------------ gate (c)
_RHO = "const rho=[[1,0.2],[0.2,1]];"


def test_minnorm_faithful_to_reference_study1():
    """BLUP design (rho=0.2) + cov='minnorm' reproduces NMI_Functions.R.

    Reference NMI (faithful R port) study 1 at x*=(.675,.475):
    TE=1.439012485003, se=0.188745246742.
    """
    body = (
        _RHO +
        "const X=NMI.blupDesign([0.628,0.457],600,rho);"
        "const r=NMI.interpolateStudy({X:X,TE:[1.387,1.829,0.492,1.363,1.464],"
        "se:[0.188,0.242,0.319,0.267,0.27]},[0.675,0.475],{cov:'minnorm'});"
        "console.log(JSON.stringify([r.TE,r.se]));"
    )
    out = _run(body)
    assert math.isclose(out[0], 1.439012485003, abs_tol=1e-6)
    assert math.isclose(out[1], 0.188745246742, abs_tol=1e-6)


def test_minnorm_faithful_to_reference_study4():
    """Reference NMI study 4 (A-C): TE=2.785823315092, se=0.199837857603."""
    body = (
        _RHO +
        "const X=NMI.blupDesign([0.733,0.503],600,rho);"
        "const r=NMI.interpolateStudy({X:X,TE:[2.757,3.415,1.879,3.135,2.515],"
        "se:[0.204,0.27,0.392,0.308,0.286]},[0.675,0.475],{cov:'minnorm'});"
        "console.log(JSON.stringify([r.TE,r.se]));"
    )
    out = _run(body)
    assert math.isclose(out[0], 2.785823315092, abs_tol=1e-6)
    assert math.isclose(out[1], 0.199837857603, abs_tol=1e-6)


def test_blup_imputation_matches_reference():
    """BLUP-imputed design for study 1 matches NMI_Functions.R::BLUP_impute.

    Reference imputed X (rows: overall, x1=1, x1=0, x2=1, x2=0):
      row1 x2 = 0.533679568194 ; row2 x2 = 0.327551696706 ;
      row3 x1 = 0.733371485395 ; row4 x1 = 0.539317184483.
    """
    body = (
        _RHO +
        "const X=NMI.blupDesign([0.628,0.457],600,rho);console.log(JSON.stringify(X));"
    )
    X = _run(body)
    assert X[0] == [0.628, 0.457]
    assert math.isclose(X[1][1], 0.533679568194, abs_tol=1e-9)  # x1=1 -> imputed x2
    assert math.isclose(X[2][1], 0.327551696706, abs_tol=1e-9)  # x1=0 -> imputed x2
    assert math.isclose(X[3][0], 0.733371485395, abs_tol=1e-9)  # x2=1 -> imputed x1
    assert math.isclose(X[4][0], 0.539317184483, abs_tol=1e-9)  # x2=0 -> imputed x1
    assert X[1][0] == 1 and X[2][0] == 0 and X[3][1] == 1 and X[4][1] == 0


# ------------------------------------------------------------------ gate (d)
_NETWORK = (
    _RHO +
    "const raw=["
    "{study:'s1',t1:'A',t2:'B',xbar:[0.628,0.457],TE:[1.387,1.829,0.492,1.363,1.464],se:[0.188,0.242,0.319,0.267,0.27]},"
    "{study:'s2',t1:'A',t2:'B',xbar:[0.843,0.618],TE:[1.475,1.577,0.946,1.517,1.412],se:[0.183,0.198,0.525,0.232,0.298]},"
    "{study:'s3',t1:'A',t2:'B',xbar:[0.787,0.592],TE:[1.612,1.858,0.643,1.662,1.542],se:[0.187,0.215,0.398,0.241,0.296]},"
    "{study:'s4',t1:'A',t2:'C',xbar:[0.733,0.503],TE:[2.757,3.415,1.879,3.135,2.515],se:[0.204,0.27,0.392,0.308,0.286]},"
    "{study:'s5',t1:'A',t2:'C',xbar:[0.705,0.468],TE:[2.526,3.412,1.038,3.264,2.033],se:[0.198,0.272,0.329,0.325,0.258]},"
    "{study:'s6',t1:'A',t2:'C',xbar:[0.6,0.405],TE:[2.134,3.139,1.056,3.768,1.307],se:[0.191,0.279,0.287,0.38,0.233]}];"
    "const S=raw.map(s=>({study:s.study,t1:s.t1,t2:s.t2,X:NMI.blupDesign(s.xbar,600,rho),TE:s.TE,se:s.se}));"
    "const f=NMI.fit(S,[0.675,0.475],{ref:'A',model:'fe',cov:'minnorm'});"
    "const g=(a,b)=>f.contrasts.find(c=>c.from===a&&c.to===b);"
    "console.log(JSON.stringify({AB:[g('A','B').est,g('A','B').se],"
    "AC:[g('A','C').est,g('A','C').se],BC:[g('B','C').est,g('B','C').se]}));"
)


def test_end_to_end_matches_netmeta_fe():
    """Full BLUP+minnorm+FE NMA == netmeta FE NMA on the interpolated contrasts.

    netmeta anchors: dAB=1.433111137666/0.114954653833,
    dAC=2.634516355369/0.115987567591, dBC=1.201405217703/0.163302444175.
    """
    out = _run(_NETWORK)
    assert math.isclose(out["AB"][0], 1.433111137666, abs_tol=1e-6)
    assert math.isclose(out["AB"][1], 0.114954653833, abs_tol=1e-6)
    assert math.isclose(out["AC"][0], 2.634516355369, abs_tol=1e-6)
    assert math.isclose(out["AC"][1], 0.115987567591, abs_tol=1e-6)
    assert math.isclose(out["BC"][0], 1.201405217703, abs_tol=1e-6)
    assert math.isclose(out["BC"][1], 0.163302444175, abs_tol=1e-6)


def test_minnorm_differs_from_independent_se():
    """Truth-discipline guard: the reference min-norm SE is NOT the meta-regression
    SE (it ignores subgroup independence). Same 2 points, different cov mode ->
    the point matches but the SE differs materially."""
    body = (
        "const a=NMI.interpolateStudy({X:[[0],[1]],TE:[0.5,1.8],se:[0.32,0.24]},[0.675],{cov:'independent'});"
        "const b=NMI.interpolateStudy({X:[[0],[1]],TE:[0.5,1.8],se:[0.32,0.24]},[0.675],{cov:'minnorm'});"
        "console.log(JSON.stringify([a.TE,b.TE,a.se,b.se]));"
    )
    out = _run(body)
    assert math.isclose(out[0], out[1], abs_tol=1e-9)   # point estimates agree
    assert abs(out[2] - out[3]) > 0.05                  # SEs materially differ
