"""Scale equivariance of shared/multi-outcome-ma.js (bivariate + K-variate REML).

Rescaling every effect and SE by a constant c is a change of units: the REML
estimates of mu, se(mu) and tau must scale by exactly c and rho_between must not
change. Until 2026-11-15 fitBivariate searched an ABSOLUTE tau grid
(0..2.0) with an ABSOLUTE coordinate step (0.05, stop at 1e-5), so at c = 1/1000
the true tau (~4e-4) sat below the first grid point and the step floor; the fit
returned tau = 1.5625 (in original units), se ~3.6x too wide and
rho_between = -0.978 instead of -0.654.

Reference values: metafor 5.2.1, rma.mv(yi ~ out - 1, V, random = ~ out | study,
struct = "UN", method = "REML"), fitted separately at c = 1 and c = 1e-3
(script: ref.R in the momagrid lane scratch folder; values below are in
ORIGINAL units, i.e. the c = 1e-3 fit divided by c). metafor itself agrees with
itself across the two scales to ~2.4e-7 (rho), so the R-parity tolerance is
1e-6 relative.

Equivariance tolerance is 1e-7 relative: the pattern search compares likelihood VALUES,
so it locates the optimum only to ~sqrt(machine eps) where the REML surface is flat; the
rescaled rows differ from the originals in the last bit, which is enough to move the
end point at that level (measured: 9e-9). The pre-fix errors were O(1).

Second round (agy review of PR #600, 2026-11-15) adds a case per confirmed finding:
  F1 seed evaluated in the wrong units (tau ~1000 x SE, beyond the grid)
  F2 rho_between must be reported as not identified when a tau is 0
  F3 singularity test must be invariant to per-outcome units (scales 1e5 vs 1e-3)
  F4 rho_between must be able to reach the +/-1 boundary (metafor does)
  F5 fitKvariate vs metafor at K = 2 and K = 3, at both scales
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "multi-outcome-ma.js"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

EXAMPLE = [  # (y1, se1, y2, se2); None = outcome not reported
    (-0.30, 0.12, -0.40, 0.15), (-0.22, 0.10, -0.35, 0.12), (-0.45, 0.18, -0.55, 0.20),
    (-0.18, 0.09, -0.28, 0.11), (-0.50, 0.20, None, None), (-0.25, 0.11, -0.32, 0.13),
    (-0.38, 0.15, -0.48, 0.17), (None, None, -0.42, 0.16),
]
INTERIOR = list(zip(
    [0.10, 0.80, -0.20, 0.55, 0.40, -0.30, 0.90, 0.20],
    [0.14, 0.12, 0.15, 0.13, 0.16, 0.14, 0.12, 0.15],
    [0.50, 0.20, 0.60, -0.10, 0.85, 0.30, 0.15, 0.70],
    [0.16, 0.13, 0.17, 0.14, 0.18, 0.15, 0.13, 0.16],
))
RHO_W = 0.5

# metafor 5.2.1 (original units). c=1 and c=1e-3 fits.
R_INTERIOR = {
    1.0: dict(mu=[0.303756312702471, 0.389627084015953], se=[0.155425614914729, 0.109010390752526],
              tau=[0.417191965076229, 0.268345793627981], rho=-0.654452360207966),
    1e-3: dict(mu=[0.303756312023802, 0.389627083215906], se=[0.155425611924755, 0.109010388042823],
               tau=[0.41719195623658, 0.268345785037654], rho=-0.654452513447697),
}
# tau -> 0 boundary: rho_between is not identified (metafor returns 0.9996 at c=1 and 0.16 at
# c=1e-3), so only mu and se are compared.
R_EXAMPLE = {
    1.0: dict(mu=[-0.273670577962501, -0.375363810433275], se=[0.0452313566476423, 0.0528014127357273]),
    1e-3: dict(mu=[-0.273670577962499, -0.375363810433251], se=[0.0452313566476414, 0.0528014127356943]),
}

SCALES = [1.0, 1e-3, 1e3]
EQ_TOL = 1e-7

# F1: tau ~ 1000 x median within-study SE (beyond the 15 x SE grid). k = 12, rho_w = 0.5.
HUGETAU = [(r[0] * 1000 / 30, r[1], r[2] * 1000 / 30, r[3]) for r in [[1.561064797249185, 0.08000219138339264, 2.8897303682238498, 0.11683058068008655], [1.0967185427885138, 0.1057501694121166, -2.11050782776927, 0.10309730944367931], [-2.298402685345338, 0.10657684143007587, 3.2273237394296244, 0.11697391528495305], [-2.0659295991370143, 0.09322399341185764, 2.9194250148345846, 0.09565727309121623], [-0.007785410623901257, 0.08304159358285441, 0.8599082407820546, 0.08006334703418583], [-1.3634718332269538, 0.08835738540084911, 5.316137781048257, 0.10257643207096329], [3.5561526029166552, 0.11547940447716015, -0.14267327875954727, 0.10235104763058529], [-2.227222768695662, 0.10650448437151708, 4.839890122339078, 0.10086883208754885], [-8.371794672856012, 0.1089614998497821, 1.3527149541083325, 0.11592797528762741], [-3.848106980718721, 0.08609728217408866, -2.2965817518050704, 0.11702149990807358], [3.544302631423016, 0.11849777106125736, 5.399162799305829, 0.11203822655232541], [2.473699862358022, 0.11820738265207381, 1.2293830203029241, 0.11148023340454336]]]
R_HUGETAU = {  # metafor 5.2.1 (c=1 nlminb-default, c=1e-3 nlminb-tight); original units
    1.0: dict(mu=[-22.0854940659077, 65.2330916538084], se=[33.2023521617414, 25.2925078374437],
              tau=[115.016276714771, 87.6157521901414], rho=0.0546816675411346),
    1e-3: dict(mu=[-22.0854940659111, 65.2330916538141], se=[33.2023483586317, 25.2925197056394],
               tau=[115.016263540407, 87.6157933028079], rho=0.0546801829926288),
}
# F4: REML optimum ON the rho_between = 1 boundary (metafor rho = 1). rho_w = 0.3.
NEARBOUND = list(zip(
    [0.10, 0.80, -0.20, 0.55, 0.40, -0.30, 0.90, 0.20, 0.65, -0.05],
    [0.10, 0.12, 0.11, 0.13, 0.10, 0.12, 0.11, 0.10, 0.12, 0.11],
    [0.12, 0.70, -0.10, 0.50, 0.38, -0.22, 0.80, 0.21, 0.60, 0.02],
    [0.11, 0.12, 0.10, 0.12, 0.11, 0.12, 0.10, 0.11, 0.12, 0.10],
))
R_NEARBOUND = {
    1.0: dict(mu=[0.304127485366659, 0.301140935388206], se=[0.133557143302687, 0.112659827028275],
              tau=[0.407268881202978, 0.338648844254446], rho=1.0),
    1e-3: dict(mu=[0.304127492242086, 0.301140929601], se=[0.13355721371404, 0.11265976930897],
               tau=[0.407269111800506, 0.338648652526992], rho=0.99999999999987),
}
# F5: K = 3, rho_w = 0.4 for every pair, study 8 misses outcome 3.
K3 = {"rw": 0.4, "y": [[0.1, 0.5, 0.3], [0.8, 0.2, 0.55], [-0.2, 0.6, 0.1], [0.55, -0.1, 0.4], [0.4, 0.85, 0.7], [-0.3, 0.3, -0.1], [0.9, 0.15, 0.6], [0.2, 0.7, None], [0.65, 0.05, 0.35], [-0.05, 0.45, 0.05]], "s": [[0.14, 0.16, 0.15], [0.12, 0.13, 0.14], [0.15, 0.17, 0.16], [0.13, 0.14, 0.12], [0.16, 0.18, 0.17], [0.14, 0.15, 0.13], [0.12, 0.13, 0.14], [0.15, 0.16, None], [0.13, 0.12, 0.15], [0.14, 0.15, 0.16]]}
R_K3 = {  # rho order: (1,2), (1,3), (2,3)
    1.0: dict(mu=[0.305457844906488, 0.360512369252922, 0.326939408437205],
              se=[0.134875808969704, 0.092979346976688, 0.0836867720635784],
              tau=[0.403730781194939, 0.25409322548272, 0.215786378784904],
              rho=[-0.683613815990163, 0.907500998551047, -0.313809337524832]),
    1e-3: dict(mu=[0.305457846130784, 0.360512363354685, 0.326939394027258],
               se=[0.13487576145721, 0.0929793207882815, 0.0836867492959155],
               tau=[0.403730622447242, 0.254093129618525, 0.215786292571206],
               rho=[-0.683613662102879, 0.907501101100869, -0.313809369131067]),
}
# The pre-existing "positive within-study correlation" dataset of test_multi_outcome_ma.py
# (REML tau = 0 for both outcomes). rho_w = 0.7.
TAU0_B = [(-0.30, 0.10, -0.32, 0.10), (-0.25, 0.12, -0.28, 0.11), (-0.40, 0.14, -0.42, 0.13),
          (-0.20, 0.09, -0.18, 0.10), (-0.35, 0.11, -0.36, 0.12)]


def _fit(rows, c: float, kvariate: bool = False, rho_w: float = RHO_W, scale2: float | None = None,
         r_eval: dict | None = None) -> dict:
    """Fit at per-outcome scales (c, scale2 or c); everything returned in ORIGINAL units.
    r_eval: optional {tau, rho} (original units) at which -2logL_R is also evaluated."""
    c2 = c if scale2 is None else scale2
    data = [[None if v is None else v * (c if j < 2 else c2) for j, v in enumerate(r)] for r in rows]
    script = f"""
const M = require({json.dumps(str(MODULE))});
const c = {c!r}, c2 = {c2!r}, rw = {rho_w!r};
const rEval = {json.dumps(r_eval)};
const rows = {json.dumps(data)};
const studies = rows.map(r => {{
  const y = [r[0] === null ? NaN : r[0], r[2] === null ? NaN : r[2]];
  const se = [r[1] === null ? NaN : r[1], r[3] === null ? NaN : r[3]];
  const V = [[NaN, NaN], [NaN, NaN]];
  if (isFinite(se[0])) V[0][0] = se[0] * se[0];
  if (isFinite(se[1])) V[1][1] = se[1] * se[1];
  if (isFinite(se[0]) && isFinite(se[1])) {{ V[0][1] = V[1][0] = rw * se[0] * se[1]; }}
  return {{ y, se, V }};
}});
const r = {'M.fitKvariate(studies, 2)' if kvariate else 'M.fitBivariate(studies, { rhoWithin: rw })'};
const sc = [c, c2];
const tau = [Math.sqrt(r.Sigma_RE[0][0]), Math.sqrt(r.Sigma_RE[1][1])];
const rho = (tau[0] > 0 && tau[1] > 0) ? r.Sigma_RE[0][1] / (tau[0] * tau[1]) : NaN;
let nllAtR = null;
if (rEval) {{
  const t = rEval.tau.map((x, k) => x * sc[k]);
  const S = [[t[0] * t[0], rEval.rho * t[0] * t[1]], [rEval.rho * t[0] * t[1], t[1] * t[1]]];
  nllAtR = M._replLogLik(studies, S, M._muGivenSigma(studies, S, 2).mu);
}}
console.log(JSON.stringify({{
  mu: r.mu.map((x, k) => x / sc[k]), se: r.se.map((x, k) => x / sc[k]), tau: tau.map((x, k) => x / sc[k]),
  rho: isFinite(rho) ? rho : null,
  rho_between: r.rho_between === undefined ? "absent" : r.rho_between,
  rho_between_identified: r.rho_between_identified === undefined ? "absent" : r.rho_between_identified,
  nll: isFinite(r.neg2LogLikR) ? r.neg2LogLikR : String(r.neg2LogLikR), nllAtR }}));
"""
    res = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=120, cwd=str(ROOT))
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout.strip().splitlines()[-1])


def _rel(a: float, b: float) -> float:
    return abs(a - b) / max(abs(b), 1e-300)


@pytest.mark.parametrize("kvariate", [False, True], ids=["bivariate", "kvariate"])
@pytest.mark.parametrize("name,rows", [("interior", INTERIOR), ("example", EXAMPLE)])
def test_fit_is_scale_equivariant(name, rows, kvariate):
    base = _fit(rows, 1.0, kvariate)
    for c in SCALES[1:]:
        got = _fit(rows, c, kvariate)
        for key in ("mu", "se"):
            for a, b in zip(got[key], base[key]):
                assert _rel(a, b) < EQ_TOL, (name, c, key, got[key], base[key])
        if name == "interior":  # tau/rho identified only away from the tau=0 boundary
            for a, b in zip(got["tau"], base["tau"]):
                assert _rel(a, b) < EQ_TOL, (name, c, "tau", got["tau"], base["tau"])
            assert abs(got["rho"] - base["rho"]) < EQ_TOL, (name, c, got["rho"], base["rho"])


@pytest.mark.parametrize("c", [1.0, 1e-3])
def test_bivariate_interior_matches_metafor_at_both_scales(c):
    got = _fit(INTERIOR, c)
    ref = R_INTERIOR[c]
    for key in ("mu", "se", "tau"):
        for a, b in zip(got[key], ref[key]):
            assert _rel(a, b) < 1e-6, (c, key, got[key], ref[key])
    assert abs(got["rho"] - ref["rho"]) < 1e-6, (c, got["rho"], ref["rho"])


@pytest.mark.parametrize("c", [1.0, 1e-3])
def test_bivariate_example_boundary_matches_metafor_at_both_scales(c):
    got = _fit(EXAMPLE, c)
    ref = R_EXAMPLE[c]
    for key in ("mu", "se"):
        for a, b in zip(got[key], ref[key]):
            assert _rel(a, b) < 1e-6, (c, key, got[key], ref[key])
    # The REML optimum is ON the tau = 0 boundary (metafor stops at tau ~1e-7, its
    # optimiser's resolution). The bivariate engine clamps tau at 0, so it must return 0
    # EXACTLY, at every scale.
    assert got["tau"] == [0.0, 0.0], (c, got["tau"])


# ---- F1: DL seed in the right units; tau far beyond the grid ------------------------------

@pytest.mark.parametrize("c", [1.0, 1e-3])
def test_bivariate_tau_far_beyond_grid_matches_metafor(c):
    ref = R_HUGETAU[c]
    got = _fit(HUGETAU, c, r_eval=dict(tau=ref["tau"], rho=ref["rho"]))
    for a, b in zip(got["mu"], ref["mu"]):
        assert _rel(a, b) < 1e-9, (c, "mu", got["mu"], ref["mu"])
    # The likelihood is very flat in (tau, rho) here (k = 12, tau ~ 1000 SE): metafor's own
    # c=1 and c=1e-3 fits differ by 1.5e-6 in rho. So the requirement is stated on the
    # objective: the engine's -2logL_R must be no worse than at metafor's estimates.
    assert got["nll"] <= got["nllAtR"] + 1e-9, (c, got["nll"], got["nllAtR"])
    for key in ("se", "tau"):
        for a, b in zip(got[key], ref[key]):
            assert _rel(a, b) < 1e-5, (c, key, got[key], ref[key])
    assert abs(got["rho"] - ref["rho"]) < 1e-5, (c, got["rho"], ref["rho"])


def test_bivariate_tau_far_beyond_grid_is_scale_equivariant():
    base = _fit(HUGETAU, 1.0)
    got = _fit(HUGETAU, 1e-3)
    for key in ("mu", "se", "tau"):
        for a, b in zip(got[key], base[key]):
            assert _rel(a, b) < EQ_TOL, (key, got[key], base[key])


# ---- F2: rho_between is NOT IDENTIFIED when a between-study SD is 0 ----------------------

@pytest.mark.parametrize("c", [1.0, 1e-3])
@pytest.mark.parametrize("name,rows,rw", [("example", EXAMPLE, RHO_W), ("tau0_b", TAU0_B, 0.7)])
def test_bivariate_rho_between_reported_unidentified_at_tau0(name, rows, rw, c):
    got = _fit(rows, c, rho_w=rw)
    assert got["tau"] == [0.0, 0.0], (name, c, got["tau"])
    assert got["rho_between"] is None, (name, c, got["rho_between"])
    assert got["rho_between_identified"] is False, (name, c, got["rho_between_identified"])


def test_bivariate_rho_between_identified_flag_true_in_interior():
    got = _fit(INTERIOR, 1.0)
    assert got["rho_between_identified"] is True
    assert abs(got["rho_between"] - got["rho"]) < 1e-12


# ---- F3: per-outcome units differing by 1e8 (variances by 1e16) -------------------------

@pytest.mark.parametrize("kvariate", [False, True], ids=["bivariate", "kvariate"])
@pytest.mark.parametrize("a,b", [(1e5, 1e-3), (1e-3, 1e5)])
def test_heterogeneous_per_outcome_units(a, b, kvariate):
    base = _fit(INTERIOR, 1.0, kvariate)
    got = _fit(INTERIOR, a, kvariate, scale2=b)
    for key in ("mu", "se", "tau"):
        for x, y in zip(got[key], base[key]):
            assert _rel(x, y) < EQ_TOL, (a, b, key, got[key], base[key])
    assert abs(got["rho"] - base["rho"]) < EQ_TOL
    # -2logL_R must be finite and shift by exactly the change-of-units constant
    # sum_k 2 (n_k - 1) log(scale_k), n_k = 8 studies reporting outcome k.
    assert isinstance(got["nll"], float), got["nll"]
    shift = 2 * 7 * (math.log(a) + math.log(b))
    assert abs(got["nll"] - (base["nll"] + shift)) < 1e-7, (got["nll"], base["nll"], shift)


def test_inverse_of_well_conditioned_matrix_with_disparate_scales():
    script = f"""
const M = require({json.dumps(str(MODULE))});
console.log(JSON.stringify(M._inverseAndDet([[1e10, 0], [0, 1e-6]])));
"""
    res = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    assert res.returncode == 0, res.stderr
    out = json.loads(res.stdout.strip().splitlines()[-1])
    assert out["inv"] is not None
    assert _rel(out["inv"][0][0], 1e-10) < 1e-12 and _rel(out["inv"][1][1], 1e6) < 1e-12
    assert _rel(out["det"], 1e4) < 1e-12


# ---- F4: rho_between on the +/-1 boundary --------------------------------------------------

@pytest.mark.parametrize("c", [1.0, 1e-3])
def test_bivariate_rho_boundary_matches_metafor(c):
    got = _fit(NEARBOUND, c, rho_w=0.3)
    ref = R_NEARBOUND[c]
    for key in ("mu", "se", "tau"):
        for a, b in zip(got[key], ref[key]):
            assert _rel(a, b) < 1e-6, (c, key, got[key], ref[key])
    assert abs(got["rho"] - ref["rho"]) < 1e-6, (c, got["rho"], ref["rho"])


# ---- F5: fitKvariate vs metafor at K = 2 and K = 3 ------------------------------------------

@pytest.mark.parametrize("c", [1.0, 1e-3])
def test_kvariate_K2_interior_matches_metafor(c):
    got = _fit(INTERIOR, c, kvariate=True)
    ref = R_INTERIOR[c]
    for key in ("mu", "se", "tau"):
        for a, b in zip(got[key], ref[key]):
            assert _rel(a, b) < 1e-6, (c, key, got[key], ref[key])
    assert abs(got["rho"] - ref["rho"]) < 1e-6, (c, got["rho"], ref["rho"])


@pytest.mark.parametrize("c", [1.0, 1e-3])
def test_kvariate_K2_tau0_boundary(c):
    got = _fit(EXAMPLE, c, kvariate=True)
    ref = R_EXAMPLE[c]
    for key in ("mu", "se"):
        for a, b in zip(got[key], ref[key]):
            assert _rel(a, b) < 1e-9, (c, key, got[key], ref[key])
    # fitKvariate parametrises Sigma_RE by a Cholesky factor with log-diagonal, so it cannot
    # reach tau = 0 exactly; it stops once -2logL_R changes by < 1e-12, which happens at
    # tau ~1e-5 x SE (measured 8e-7 vs SE ~0.1). 1e-4 x the smallest SE (0.09) bounds that.
    assert max(got["tau"]) < 1e-4 * 0.09, (c, got["tau"])


def _fit_k3(c: float) -> dict:
    script = f"""
const M = require({json.dumps(str(MODULE))});
const J = {json.dumps(K3)}, c = {c!r};
const st = J.y.map((y, i) => {{
  const s = J.s[i], V = [];
  for (let a = 0; a < 3; a++) {{ V.push([]); for (let b = 0; b < 3; b++) {{
    const sa = s[a] == null ? NaN : s[a] * c, sb = s[b] == null ? NaN : s[b] * c;
    V[a].push(a === b ? sa * sa : J.rw * sa * sb); }} }}
  return {{ y: y.map(v => v == null ? NaN : v * c), V }};
}});
const r = M.fitKvariate(st, 3), t = r.taus, S = r.Sigma_RE;
console.log(JSON.stringify({{ mu: r.mu.map(x => x / c), se: r.se.map(x => x / c), tau: t.map(x => x / c),
  rho: [S[0][1] / (t[0] * t[1]), S[0][2] / (t[0] * t[2]), S[1][2] / (t[1] * t[2])] }}));
"""
    res = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=120, cwd=str(ROOT))
    assert res.returncode == 0, res.stderr
    return json.loads(res.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("c", [1.0, 1e-3])
def test_kvariate_K3_matches_metafor(c):
    got = _fit_k3(c)
    ref = R_K3[c]
    for key in ("mu", "se", "tau"):
        for a, b in zip(got[key], ref[key]):
            assert _rel(a, b) < 1e-6, (c, key, got[key], ref[key])
    for a, b in zip(got["rho"], ref["rho"]):
        assert abs(a - b) < 1e-6, (c, got["rho"], ref["rho"])


# ---- agy round 2: small positive tau on one outcome (one tau near 0, rho near +/-1) ------
# Simulated from tau1 = 0.08 SE, tau2 = 0.5 SE, rho_between = 0.9, rho_w = 0.5 (gen5.js,
# lane scratch). Before the boundary escape 12 of 40 such data sets stalled at tau_d = 0
# with -2logL_R up to 0.21 above metafor's; these are the three worst (seeds 7, 23, 35)
# and seed 25, where metafor itself stops short of the optimum (the engine must then be
# no worse than metafor on the objective, but need not match its parameters).
SMALLTAU = {7: [(0.07305226722857178, 0.0973535650863096, 0.32267480296770584, 0.10136840560537223), (0.10546993421366775, 0.08420088041769382, 0.24030709406043227, 0.0841971801799709), (0.17133591843714518, 0.09485110605827118, 0.16186691435609424, 0.08253952136381507), (0.17203058679488792, 0.10417180207752241, 0.2378715995827896, 0.09547751691913117), (0.21127862626405755, 0.09115825824959123, 0.21663585964481213, 0.09684640087971762), (0.14192327461091092, 0.11939959684358892, 0.14609338424317286, 0.10902415019880243), (0.04462171884112165, 0.11311178892530119, 0.3173187825932726, 0.10983646753702148), (0.29470111844990976, 0.11665596298717706, 0.5453508151140803, 0.11676992548479229), (0.20892637479392687, 0.09427930350149018, 0.4963650970179524, 0.1122539495454421), (0.1772780973631184, 0.10905892513182895, 0.3868474685204756, 0.11335469064924619), (0.2348723009435633, 0.10263452305581167, 0.18726880752396172, 0.09842899902650575), (0.2350727596095449, 0.08510863375156588, 0.46107217438994796, 0.10080746256783953), (0.2903005158636458, 0.09487727538443975, 0.45540204521283245, 0.08236738627886744), (0.09491737919805172, 0.11962886318547133, 0.27410215821291184, 0.0823035582165716), (0.19639735543793033, 0.08084328709209491, 0.16684926816430667, 0.09312615683913518), (0.3353335774732169, 0.11774555124237461, 0.3697635079949009, 0.10947973059000435), (0.1213862962376477, 0.10179788109930134, 0.22525925991032145, 0.11698763595753706), (0.2240796266193185, 0.09777337337740388, 0.47568117481889605, 0.11708635402707679), (0.21891874467908562, 0.0871699320744583, 0.2723968694016962, 0.10504837542076054), (0.3654977415736678, 0.08079903319515243, 0.40656322891196484, 0.10935091092686677)], 23: [(0.228424307421535, 0.0970188567121601, 0.47480614236678453, 0.11592476127479448), (0.1483449672858557, 0.08237432137242254, 0.3058503000010546, 0.10521930630561864), (0.1415200660050771, 0.11736791990574819, 0.3156797980077914, 0.08262985590967808), (0.17668974418254843, 0.08513592111185934, 0.10812383804727663, 0.11942612702000241), (0.08707119802754931, 0.11666284853437117, 0.11687825168829236, 0.11249531717621503), (0.10266231667746632, 0.09517010391464928, 0.31690410859950846, 0.08393649351035082), (0.13638956313807574, 0.10308159218313247, 0.3408076682778623, 0.0923198219073563), (0.18409836226685067, 0.0918695926721532, 0.2485384018634845, 0.09224404087860326), (0.23260488052541375, 0.11548914007632488, 0.3201166865758528, 0.1059772627921669), (0.15313793491609806, 0.101193611147438, 0.3077842782358056, 0.08102255499038033), (0.09087426598135027, 0.1029420043262383, 0.15171393781217848, 0.1062667110870903), (0.14564941262349052, 0.09678551089800219, 0.09402450028060852, 0.1140816627229013), (0.07056655917936289, 0.08888247626315918, 0.20150201072734664, 0.08777855491627871), (0.1460008075996066, 0.09020912189512006, 0.23392151209486287, 0.10471169128302098), (0.23525431518322729, 0.11705651473116899, 0.31439752442467866, 0.08884308675715843), (0.09945254215820312, 0.08402109693923085, 0.305728437936124, 0.10257625765287143), (0.1577857130417113, 0.11162160932627582, -0.054865944261901084, 0.10438794671762174), (0.17394607960930974, 0.08696965538289847, 0.2995317355582766, 0.09899802037468089), (0.25786151866810963, 0.09784406253036301, 0.22734424824517677, 0.10515894781107034), (0.23821469326180456, 0.11691110906978655, 0.2654385265568906, 0.08501013590256225), (0.03923700436414096, 0.08194291647614116, 0.1272997262842747, 0.09459721450442318), (0.23849357084577974, 0.09423000820643734, 0.3091344326940043, 0.08374792559246902), (0.13451329357238379, 0.11107111995623965, 0.28056882929845894, 0.09231310451976633), (0.273002679443899, 0.11969823526204482, 0.2586029210920217, 0.08824004918720575), (0.1760446788162407, 0.0845647205433644, 0.41943879693594815, 0.1192581723254445), (0.33286279981318967, 0.09675874109229014, 0.42480607923262453, 0.10416153812043441), (0.10130672211692948, 0.1121895999611307, 0.3902446574200552, 0.09060654672356627), (0.1970815951814089, 0.0808594162766167, 0.45315349591063314, 0.08420936109694158), (0.26260348966052954, 0.08942891296438357, 0.4467140128385909, 0.11174019239458265), (0.39202745132966577, 0.11156070435026694, 0.4153515144898287, 0.0807580149363531)], 35: [(0.08224016880758087, 0.08676782543154798, 0.2252650534836441, 0.10684202802686116), (0.430647189619522, 0.10100440208846909, 0.42815097951163483, 0.10098590089985444), (0.37206375588264395, 0.11425553029135593, 0.3932674256275076, 0.09269760681907535), (0.17765366886721445, 0.08085901038761205, 0.046932764581530034, 0.11738758459565582), (0.17257923137200495, 0.09579129124795613, 0.20390758425981675, 0.08423200439858809), (0.25887101643411703, 0.11699798421794455, 0.43750842820114033, 0.10512075099401211), (0.2889201203181554, 0.08555894462650593, 0.21321161199222405, 0.1091823376851074), (0.2664183602692571, 0.10327981493588528, 0.3538767845681566, 0.10384962742396148), (0.06549123163952672, 0.11139651750745089, 0.23504127031853403, 0.08126974772721052), (0.17215773529765396, 0.10529462565914478, 0.26611905947047826, 0.08677345324623094), (0.25348317355131994, 0.11317261527905828, 0.13916212391217042, 0.09214499513252872), (0.2756081204228566, 0.10554316875782943, 0.40576735588281465, 0.10403731283919761), (0.35074304367966536, 0.11438637692219875, 0.38461777570504324, 0.09183693139433718), (-0.03553013058457599, 0.11814431592735664, 0.21219678790347724, 0.09151779108285801), (0.1813888449717494, 0.08421643546047455, 0.3141020903412243, 0.10563078419567588), (0.17953323826149195, 0.10872775621187303, 0.2485999722625077, 0.10739865295002174), (0.03682713283923422, 0.10898940549650668, 0.22042574214923458, 0.10493817978768524), (0.3026504198731665, 0.08886686688701942, 0.38778780712885774, 0.10543177013538395), (0.19989019420300538, 0.11584966037229152, 0.23665744729456492, 0.0852418771038027), (0.1864976452684914, 0.08399516597576215, 0.175587213660286, 0.10675455463433385), (0.26704776871161434, 0.08643487289847568, 0.26899200925895345, 0.11090880468064399), (0.09932334077858271, 0.08948044727066552, 0.2985525818757561, 0.09787727807549633), (0.14042365637978582, 0.08032561732471251, 0.37693699304966927, 0.11265037644312269), (0.14451745348511125, 0.11432340148572037, 0.31196138668469353, 0.11340877050226963), (0.15880554136533018, 0.11825066169642409, 0.27706698542332014, 0.11887113179958944), (0.3553226542261342, 0.08811112774913718, 0.39443190747357776, 0.08372407974848714), (0.4163408053805782, 0.10637547820172062, 0.3733084340979301, 0.09266213631847042), (0.1369929120298467, 0.09000345955137325, 0.1874929500920947, 0.08814467993012848), (0.22627865934161023, 0.0943483458153663, 0.27198229198461366, 0.11264811886132142), (0.2159890304472158, 0.10367933270692795, 0.32532666805384636, 0.09854480533792861)], 25: [(0.19038864107845302, 0.10197701816539141, 0.5007459506342535, 0.08774430573347225), (0.11024393483846939, 0.11214600149176362, 0.13658808194088218, 0.11784707207132461), (0.36021892306797043, 0.11018252163668281, 0.5418384851754342, 0.11764114772791096), (0.14484716982266077, 0.09775643599115147, 0.48119750957945817, 0.1124197032826113), (0.159717327447707, 0.11985092231996866, 0.2880808474413955, 0.09445143171327722), (0.1423002389978473, 0.11214141729853183, 0.3778579971563658, 0.08080053642429437), (0.16431264179648594, 0.10682781759036138, 0.22663746537761717, 0.09513024120364816), (0.26512217757209033, 0.1137712963827752, 0.4080084925096543, 0.11417830530282963), (0.11215357664936276, 0.10814036964817922, 0.2922211375239549, 0.11519267694800751), (0.08574239413888826, 0.11521044689938913, 0.16940562672305187, 0.1019810380330221), (0.26855218473800135, 0.09798043948504163, 0.22118579328806953, 0.11724642509466338), (0.22599588770474557, 0.09824512054130674, 0.2695955257146173, 0.085740937742284), (0.32974502018208773, 0.0931331263729991, 0.3454816077208326, 0.08845495099595513), (0.25077800223898783, 0.10153165423382617, 0.21925013003648003, 0.08251270791632716), (0.16958651420622287, 0.11158316818605324, 0.36410461471366223, 0.09830770299691134), (0.2253729684648141, 0.09480554015133788, 0.2623978195296898, 0.11671332353572982), (0.010251088060705793, 0.11784957535464763, 0.12456092517846223, 0.09781298556263232), (0.20128897987269895, 0.0806191906335853, 0.33782613498650266, 0.08673697866813139), (0.17161888110377777, 0.0941783288373511, 0.25113780626523796, 0.09517276935985906), (-0.01095619805777312, 0.11142511855411583, 0.2668212586164204, 0.08196753902452418)]}
R_SMALLTAU = {7: {'mu': [0.19989666907098, 0.312299713357332], 'tau': [0.0117810935266014, 0.071399956975015], 'rho': 0.999999999987487}, 23: {'mu': [0.173621954920318, 0.283945164577871], 'tau': [0.0109018337530303, 0.0593674308059151], 'rho': 0.999999999999003}, 35: {'mu': [0.213030725129364, 0.286859545351166], 'tau': [0.0351264864698196, 0.017727492568189], 'rho': 0.999999999994035}, 25: {'mu': [0.186466844861471, 0.305958521302872], 'tau': [3.69750052903504e-05, 0.0513176666892861], 'rho': 0.309883454377594}}  # metafor 5.2.1, c = 1 fits (rho = 1 boundary except seed 25)


@pytest.mark.parametrize("c", [1.0, 1e-3])
@pytest.mark.parametrize("seed", [7, 23, 35, 25])
def test_bivariate_small_tau_near_boundary_not_worse_than_metafor(seed, c):
    ref = R_SMALLTAU[seed]
    got = _fit(SMALLTAU[seed], c, rho_w=0.5, r_eval=dict(tau=ref["tau"], rho=ref["rho"]))
    assert got["nll"] <= got["nllAtR"] + 1e-9, (seed, c, got["nll"], got["nllAtR"], got["tau"], ref["tau"])
    if seed != 25:
        for a, b in zip(got["mu"], ref["mu"]):
            assert _rel(a, b) < 1e-6, (seed, c, "mu", got["mu"], ref["mu"])
        for a, b in zip(got["tau"], ref["tau"]):
            assert _rel(a, b) < 1e-4, (seed, c, "tau", got["tau"], ref["tau"])
        assert abs(got["rho"] - ref["rho"]) < 1e-6, (seed, c, got["rho"], ref["rho"])
