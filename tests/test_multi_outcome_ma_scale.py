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
