"""Tests for shared/robma.js: log marginal likelihoods of the four effect x heterogeneity
models against a high-precision oracle.

Oracle: the same four integrals evaluated with mpmath at 80 significant digits, with the
mu-integrated likelihood written in its direct (Sherman-Morrison) form
l0(tau2) - log(muSD^2 A)/2 + B^2/(2A) -- exact at that precision -- and the tau integrals
by mpmath.quad around the mode. The oracle reproduces the R integrate() values pinned in
hub/shared/tests/robma-parity.spec.mjs (dataset HUB below) to every printed digit.

Regression for #504-review finding d: with very precise studies, logLik0(0) and B^2/(2A)
are both ~2^60 and the double-precision difference was 0 (true 18.11) for H1FE.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

HUB = ([0.10, 0.30, 0.50, 0.20, 0.90, 0.40, 1.10, 0.05], [0.20, 0.25, 0.18, 0.30, 0.22, 0.28, 0.35, 0.15])
CASES = [
    ("hub_parity_dataset", HUB, dict(H0FE=-15.01072397948482, H1FE=-7.042083326988722,
                                     H0RE=-7.780665507396961, H1RE=-6.243632166598109)),
    ("small_k3", ([0.3, 0.5, 0.1], [0.1, 0.2, 0.15]), dict(H0FE=-4.794894831522212, H1FE=-0.8992925658327700,
                                                         H0RE=-1.980182257264357, H1RE=-2.073323496172565)),
    ("se_2pow-30", ([1, 1], [2 ** -30, 2 ** -30]), dict(H0FE=-1152921504606846936.249046, H1FE=18.10996476010904,
                                                       H0RE=-3.598664219062413, H1RE=0.1583011611947577)),
    ("se_1e-4", ([1, 1.0001], [1e-4, 1e-4]), dict(H0FE=-100009983.9171963, H1FE=6.275839714037170,
                                                 H0RE=-3.598784920473020, H1RE=-0.6385788531862928)),
    ("se_1e-6", ([3, 3], [1e-6, 1e-6]), dict(H0FE=-8999999999974.207670, H1FE=7.131059901276956,
                                            H0RE=-7.525703632476067, H1RE=-4.070228821050500)),
]
# |app - oracle| <= TOL * max(1, |oracle|): far tighter than the cancellation error (~2^60 * eps)
# and looser than the adaptive-Simpson tolerance relative to the peak.
TOL = 1e-8
# One exception, NOT the cancellation defect: H1RE for se = 2^-30 has its tau-integrand spike
# (width ~1e-9) at tau = 0 on [0, 10], and the adaptive-Simpson tolerance is relative to that
# peak, so the quadrature itself is good to ~4e-6 there. Recorded as a separate limitation.
LOOSER = {("se_2pow-30", "H1RE"): 1e-5}


def _run(yi, sei):
    js = ("const R=require('./shared/robma.js');const o=R.analysis(%s,%s);"
          "console.log(JSON.stringify(o.logMarginal));") % (json.dumps(yi), json.dumps(sei))
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("name,data,exp", CASES, ids=[c[0] for c in CASES])
def test_log_marginals_match_high_precision_oracle(name, data, exp):
    got = _run(*data)
    for m, v in exp.items():
        tol = LOOSER.get((name, m), TOL)
        assert abs(got[m] - v) <= tol * max(1.0, abs(v)), (name, m, got[m], v)


def _fe(yi, sei):
    # Fixed-effect models only: the source is evaluated with an early return before the tau
    # quadrature (which is not what this checks, and is slow for these absurd scales).
    js = ("const fs=require('fs');let src=fs.readFileSync('./shared/robma.js','utf8');"
          "const cut='var lH0RE = _logIntTau';if(!src.includes(cut))throw new Error('anchor missing');"
          "src=src.replace(cut,'return {H0FE:lH0FE,H1FE:lH1FE};'+cut);const mod={exports:{}};"
          "new Function('module',src)(mod);const o=mod.exports.analysis(%s,%s);"
          "console.log(JSON.stringify([o.H0FE,o.H1FE]));") % (json.dumps(yi), json.dumps(sei))
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("yi,sei,h1fe", [
    # Huge but finite variances: 2*pi*v and d*d/v must not overflow (review of the fix).
    # Oracle (mpmath, 80 digits): H1FE = log N2(y; 0, diag(v) + 11').
    ([0, 0], [1e154, 1e154], -711.0340857085754),
    ([1e155, -1e155], [1e153, 1e153], -10706.428915522587),
    # Tiny SEs (Codex review of #513): m = B/A rounds (3 -> 3.0000000000000004) and the
    # residual y - m, divided by se = 1e-17, became a spurious penalty (H1FE -1939.69).
    # Oracle as above (mpmath, 80 digits); also R: dnorm(0,0,sqrt(2)*1e-17,log=TRUE) +
    # dnorm(3,0,sqrt(1+1e-34/2),log=TRUE) = 32.459495924209456.
    ([3, 3], [1e-17, 1e-17], 32.459495924209458),
    ([3, 3, 3], [1e-17, 1e-12, 1e-17], 59.171578506908334),
    ([0.1, 0.3, 0.7], [1e-9, 2e-9, 1e-9], -91111111111111047.0),
])
def test_fixed_effect_no_overflow_for_huge_finite_inputs(yi, sei, h1fe):
    h0, h1 = _fe(yi, sei)
    assert h1 is not None and abs(h1 - h1fe) <= 1e-12 * abs(h1fe), (h0, h1, h1fe)
