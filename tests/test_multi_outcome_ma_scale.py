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
"""
from __future__ import annotations

import json
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


def _fit(rows, c: float, kvariate: bool = False) -> dict:
    data = [[None if v is None else v * c for v in r] for r in rows]
    script = f"""
const M = require({json.dumps(str(MODULE))});
const c = {c!r}, rw = {RHO_W!r};
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
const tau = [Math.sqrt(r.Sigma_RE[0][0]), Math.sqrt(r.Sigma_RE[1][1])];
const rho = (tau[0] > 0 && tau[1] > 0) ? r.Sigma_RE[0][1] / (tau[0] * tau[1]) : NaN;
console.log(JSON.stringify({{
  mu: r.mu.map(x => x / c), se: r.se.map(x => x / c), tau: tau.map(x => x / c),
  rho: isFinite(rho) ? rho : null }}));
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
    # fitKvariate parametrises tau on the log scale, so at the tau -> 0 boundary it can only
    # drift towards 0 until its |delta f| < 1e-8 stop fires; its mu/se are then determined
    # only to ~1e-8 (vs metafor), and 1e-7 is the honest equivariance bound there.
    tol = 1e-7 if (kvariate and name == "example") else 1e-9
    for c in SCALES[1:]:
        got = _fit(rows, c, kvariate)
        for key in ("mu", "se"):
            for a, b in zip(got[key], base[key]):
                assert _rel(a, b) < tol, (name, c, key, got[key], base[key])
        if name == "interior":  # tau/rho identified only away from the tau=0 boundary
            for a, b in zip(got["tau"], base["tau"]):
                assert _rel(a, b) < 1e-9, (name, c, "tau", got["tau"], base["tau"])
            assert abs(got["rho"] - base["rho"]) < 1e-9, (name, c, got["rho"], base["rho"])


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
    # metafor's tau are ~1e-7 (boundary); the engine must also sit at the boundary, i.e.
    # tau negligible next to the within-study SEs (~0.1), at every scale.
    assert max(got["tau"]) < 1e-3, (c, got["tau"])
