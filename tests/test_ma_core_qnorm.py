"""shared/ma-core.js normal quantile and Wald CI accuracy vs R qnorm (paper 37, RMST validation).

The Wald CI half-width is qnorm(0.975) * SE. With Acklam's approximation (relative error ~1e-9) the CI limits of
an RMST difference in days (SE in the hundreds) differ from metafor by more than 1e-9 relative, which the paper-37
gate (|app - R| / max(1, |R|) <= 1e-9) detects. Reference quantiles: R 4.6.0 qnorm(), printed with %.17g.
Skipped if Node is not installed.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "ma-core.js"
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

# R 4.6.0: sprintf('%.17g', qnorm(p))
R_QNORM = {
    "0.975": 1.9599639845400536,
    "0.995": 2.5758293035488999,
    "0.9": 1.2815515655446008,
    "0.001": -3.0902323061678132,
    "1e-10": -6.3613409024040557,
    "0.5": 0.0,
}


def _node(script: str):
    res = subprocess.run([NODE, "-e", script], capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT))
    assert res.returncode == 0, f"node exited {res.returncode}\n{res.stderr}"
    return json.loads(res.stdout.strip().splitlines()[-1])


def test_qnorm_matches_r_to_machine_precision():
    got = _node(f"""
        const M = require({json.dumps(str(MODULE))});
        const ps = {json.dumps(list(R_QNORM))};
        console.log(JSON.stringify(Object.fromEntries(ps.map(p => [p, M._qnorm(Number(p))]))));
    """)
    for p, want in R_QNORM.items():
        assert abs(got[p] - want) <= 1e-14 * max(1.0, abs(want)), (p, got[p], want)


def test_wald_ci_uses_exact_z_for_large_se():
    # RMST differences in days: SE ~ 300; CI half-width must equal qnorm(0.975) * SE to 1e-12 relative
    out = _node(f"""
        const M = require({json.dumps(str(MODULE))});
        const r = M.pool([120.5, -40.25, 310.0], [300 * 300, 250 * 250, 410 * 410], {{ method: "FE" }});
        console.log(JSON.stringify(r));
    """)
    half = (out["ciHi"] - out["ciLo"]) / 2
    assert abs(half - R_QNORM["0.975"] * out["se"]) <= 1e-12 * half


# R 4.6.0 qnorm() at central p (|p - 0.5| <= 0.425, the AS 241 rational branch), %.17g. These are
# reproduced bit-for-bit only with Wichura's published denominator coefficient 5226.4952788528544610
# (R nmath/qnorm.c); a transposed 5226.495278852545925 is off by one ulp on these inputs.
R_QNORM_CENTRAL = {
    "0.40319697866216309": -0.24508068597450103,
    "0.46520586732076485": -0.087326821926634185,
    "0.4798985583125614": -0.050408181697496682,
    "0.44175263696815825": -0.14652713059182321,
}


def test_qnorm_central_branch_bit_exact_vs_r():
    got = _node(f"""
        const M = require({json.dumps(str(MODULE))});
        const ps = {json.dumps(list(R_QNORM_CENTRAL))};
        console.log(JSON.stringify(Object.fromEntries(ps.map(p => [p, M._qnorm(Number(p))]))));
    """)
    for p, want in R_QNORM_CENTRAL.items():
        assert got[p] == want, (p, got[p], want)
