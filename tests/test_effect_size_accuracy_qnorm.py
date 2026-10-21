"""R parity of the normal quantile behind the effect-size converter's Wald p -> SE derivation.

shared/effect-size-accuracy.js used Acklam's rational approximation (relative error about 1e-9), so SEs recovered from a
two-sided p-value differed from metafor::conv.wald by up to about 1e-7 relative after propagation into CI limits. These
values were pinned from R 4.6.0 (qnorm) and metafor 5.2.1 (conv.wald(out = log(2), pval = p)) and must be matched to
near machine precision.
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

# (p, qnorm(p)) from R 4.6.0
QNORM = [
    (1e-300, -37.047096299361201),
    (1e-100, -21.273453560965319),
    (9.9999999999999995e-21, -9.2623400897984052),
    (1e-08, -5.61200124417479),
    (0.0001, -3.71901648545568),
    (0.001, -3.0902323061678132),
    (0.01, -2.3263478740408408),
    (0.02, -2.0537489106318225),
    (0.024250000000000001, -1.9729610513118845),
    (0.029999999999999999, -1.8807936081512509),
    (0.050000000000000003, -1.6448536269514726),
    (0.10000000000000001, -1.2815515655446008),
    (0.20000000000000001, -0.84162123357291418),
    (0.29999999999999999, -0.52440051270804067),
    (0.42499999999999999, -0.18911842627279249),
    (0.5, 0.0),
    (0.57499999999999996, 0.18911842627279238),
    (0.69999999999999996, 0.52440051270804067),
    (0.90000000000000002, 1.2815515655446008),
    (0.94999999999999996, 1.6448536269514715),
    (0.97575000000000001, 1.9729610513118847),
    (0.98999999999999999, 2.3263478740408408),
    (0.999, 3.0902323061678132),
    (0.99990000000000001, 3.7190164854557084),
]

# (p, sqrt(vi)) from metafor 5.2.1 conv.wald(out = log(2), pval = p)
WALD_SE_LOG2 = [
    (9.9999999999999998e-13, 0.097208683101918422),
    (0.0011999999999999999, 0.21400828534290484),
    (0.031, 0.32133695777646903),
    (0.050000000000000003, 0.35365301915106701),
    (0.20000000000000001, 0.54086561882930506),
    (0.5, 1.027661547649078),
    (0.90000000000000002, 5.5159935645075926),
]


def _node(expr: str):
    code = "const A = require('./shared/effect-size-accuracy.js');\nconsole.log(JSON.stringify(" + expr + "));"
    r = subprocess.run([NODE, "-e", code], capture_output=True, text=True, timeout=20, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_qnorm_matches_r_to_machine_precision():
    got = _node("[" + ",".join(repr(p) for p, _ in QNORM) + "].map(A.qnorm)")
    for (p, want), x in zip(QNORM, got):
        assert abs(x - want) <= 4e-15 * max(1.0, abs(want)), f"qnorm({p}) = {x!r}, R gives {want!r}"


def test_wald_p_to_se_matches_metafor_conv_wald():
    got = _node("[" + ",".join(repr(p) for p, _ in WALD_SE_LOG2) + "].map(p => A.seFromTwoSidedWaldP(p, Math.log(2)))")
    for (p, want), x in zip(WALD_SE_LOG2, got):
        assert abs(x - want) <= 1e-13 * max(1.0, abs(want)), f"SE from p={p}: {x!r}, conv.wald gives {want!r}"


def test_qnorm_symmetry_and_domain():
    lo, hi = _node("[A.qnorm(0.025), A.qnorm(0.975)]")
    assert math.isclose(lo, -hi, rel_tol=0, abs_tol=1e-15)
    bad = _node("[0, 1, -0.1, 1.1, NaN].map(p => { try { A.qnorm(p); return 'accepted'; } catch (e) { return 'refused'; } })")
    assert bad == ["refused"] * 5
