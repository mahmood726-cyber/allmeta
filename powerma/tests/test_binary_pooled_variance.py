"""Binary required size: the page offers the pooled-variance formula of RTSA ris() / the TSA program as an
option beside its documented arcsine (Cohen h) default (paper 46: the 18 'specification ambiguity' checks are
exactly this difference).

Reference: RTSA 0.2.2 ris(outcome = "RR", mc = 1 - rrr, pC = p0, alpha, beta, side, I2/D2) as computed in the
P46 validation archive (tsa-reproducible refs/oracle.json, configurations W19-W24; W22 is one-sided 0.025 in
RTSA, entered as two-sided 0.05). RTSA: NF = ceiling(4 (z_a + z_b)^2 pbar (1 - pbar) / (pC - pI)^2),
NR = ceiling(NF / (1 - D2 or I2)).
"""
from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from test_required_n_rounding import APP, NODE, RUN

pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

# id: (alpha, power, p0, rrr, i2, d2) -> RTSA (NF, NR_I2, NR_D2)
RTSA = {
    "W19": ((0.05, 0.9, 0.1, 0.1, 0, 0), (36136, 36136, 36136)),
    "W20": ((0.05, 0.8, 0.2, 0.1, 0.2, 0.3), (12080, 15100, 17258)),
    "W21": ((0.05, 0.9, 0.12, 0.2, 0, 0), (7030, 7030, 7030)),
    "W22": ((0.05, 0.8, 0.1, 0.25, 0, 0.1), (4011, 4011, 4457)),
    "W23": ((0.05, 0.9, 0.15, 0.2, 0, 0), (5454, 5454, 5454)),
    "W24": ((0.05, 0.8, 0.490936555891239, 0.2, 0, 0), (804, 804, 804)),
}


def _totals(vals):
    r = subprocess.run([NODE, "-e", RUN, str(APP / "index.html"), json.dumps(vals)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout.strip().splitlines()[-1])
    rows = [re.findall(r"<td>(.*?)</td>", tr) for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", out["body"])]
    return [int(row[2]) for row in rows], out["last"]


def _vals(cfg, method):
    alpha, power, p0, rrr, i2, d2 = cfg
    v = {"outcome": "binary", "alpha": alpha, "power": power, "ratio": 1, "i2": i2 * 100, "d2": d2 * 100,
         "p0": p0, "rrr": rrr, "md": 0.4, "sd-c": 1}
    if method is not None:
        v["binary-method"] = method
    return v


@pytest.mark.parametrize("cid", sorted(RTSA))
def test_pooled_variance_option_equals_rtsa_ris(cid):
    cfg, (nf, nri2, nrd2) = RTSA[cid]
    totals, last = _totals(_vals(cfg, "pooled"))
    assert totals == [nf, nri2, nrd2], (cid, totals)
    assert last["ris_total_n"] == nrd2
    assert last["binary_method"] == "pooled"


@pytest.mark.parametrize("cid", sorted(RTSA))
def test_default_is_still_the_documented_arcsine_formula(cid):
    cfg, _ = RTSA[cid]
    alpha, power, p0, rrr, i2, d2 = cfg
    za = 1.959963984540054 if alpha == 0.05 else None
    zb = {0.8: 0.8416212335729143, 0.9: 1.2815515655446004}[power]
    h = abs(2 * math.asin(math.sqrt(p0 * (1 - rrr))) - 2 * math.asin(math.sqrt(p0)))
    total = math.ceil((za + zb) ** 2 / h ** 2 * 2 * 2)
    want = [total, math.ceil(total / (1 - i2)), math.ceil(total / (1 - d2))]
    for method in (None, "arcsine"):
        totals, last = _totals(_vals(cfg, method))
        assert totals == want, (cid, method, totals, want)
        assert "binary_method" not in last or last["binary_method"] == "arcsine"
