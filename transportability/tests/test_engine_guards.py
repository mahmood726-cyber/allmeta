"""Refusals of shared/transportability-v1.js (limitation sweep P58, lane lim8, 2026-11-20).

F11: without shared/ma-core.js the engine replaced the t_{k-2} quantile by a normal one and still returned
intervals the page labels Knapp-Hartung t (example: CI -6.846 to 3.370 instead of -8.118 to 4.642).
Requirement: no t quantile -> no result (ok: false, with the reason); with ma-core the result is unchanged.

F09: the Paule-Mandel root was bracketed by at most 60 doublings and bisected with no convergence check, so
an unbracketed equation returned tau^2 = 2^60 as a success. Requirement: an unresolved PM equation or a
non-finite prediction is refused, never returned as a fit.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

EXAMPLE = [(-12.4, 0.6, 37.9), (-10.3, 0.9, 38.0), (-17.8, 0.7, 38.0), (-5.4, 0.5, 38.3),
           (-4.2, 0.6, 32.9), (-3.0, 0.7, 33.5), (-2.1, 1.0, 30.5), (-15.0, 1.1, 41.0)]


def transport(rows, target, macore=True):
    studies = [{"est": e, "se": s, "x": x} for e, s, x in rows]
    js = (("globalThis.AlmMaCore = require('./shared/ma-core.js');" if macore else "") +
          "const T=require('./shared/transportability-v1.js');"
          "const o=T.transport(%s);console.log(JSON.stringify(o));") % json.dumps({"studies": studies, "target": target})
    r = subprocess.run([NODE, "-e", js], capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_example_unchanged_with_ma_core():
    o = transport(EXAMPLE, 31)
    assert o["ok"]
    t = o["transported"]
    assert abs(t["est"] - -1.73782498245167) < 1e-12
    assert abs(t["ciLo"] - -8.118019984118195) < 1e-12 and abs(t["ciHi"] - 4.642370019214856) < 1e-12


def test_no_t_quantile_no_result():
    o = transport(EXAMPLE, 31, macore=False)
    assert o["ok"] is False and "t quantile" in o["error"], o


def test_unresolved_paule_mandel_is_refused():
    o = transport([(0, 1, 1), (1e12, 1, 2), (-1e12, 1, 3), (0, 1, 4)], 2)
    assert o["ok"] is False and "Paule-Mandel" in o["error"], o


def test_resolved_large_heterogeneity_still_fits():
    # control: big but bracketable residual heterogeneity is still fitted
    o = transport([(0, 1, 1), (1e4, 1, 2), (-1e4, 1, 3), (0, 1, 4)], 2)
    assert o["ok"] and o["tau2"] > 1e7, o
