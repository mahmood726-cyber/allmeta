"""Parity gate behind the proportion-ma τ² migration (2026-06-07).

proportion-ma formerly computed its DerSimonian-Laird / Paule-Mandel τ² inline;
it now delegates to the audited single source shared/ma-core.js. This test is the
gate that justified the migration: on logit-transformed proportions, ma-core's
DL and PM τ² must equal the former inline closed-form / iteration to 1e-7. If this
ever fails, the delegation changed a shipped value and must be reverted.

Reproduces the inline math proportion-ma used to run (the exact lines removed in
the migration commit) and compares against AlmMaCore.pool(...).tau2.
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

# (events x, total n) — a deliberately HETEROGENEOUS set (varied proportions) so
# τ² > 0 and the DL/PM formulas are genuinely exercised (the app's homogeneous
# default gives τ²=0, a degenerate check).
DATA = [[5, 100], [50, 100], [10, 120], [80, 100], [20, 150], [90, 110], [35, 140], [60, 90]]

# Inline reimplementation exactly as proportion-ma used to compute it (logit
# transform with Sweeting continuity correction at extremes; DL closed form; PM
# iteration), then the ma-core delegation, compared in one node process.
JS = r"""
const C = require('./shared/ma-core.js');
const data = %s;
const rows = data.map(([x,n]) => { const ex=(x===0||x===n); const cx=ex?x+0.5:x, cn=ex?n+1:n; const p=cx/cn; return { y: Math.log(p/(1-p)), v: 1/cx + 1/(cn-cx) }; });
const yi = rows.map(r=>r.y), vi = rows.map(r=>r.v);
const w = vi.map(v=>1/v), sw=w.reduce((a,b)=>a+b,0);
const mu_fe = yi.reduce((a,y,i)=>a+w[i]*y,0)/sw;
const Q = yi.reduce((a,y,i)=>a+w[i]*(y-mu_fe)**2,0);
const df = yi.length-1;
const swSq = w.reduce((a,b)=>a+b*b,0);
const dlInline = Math.max(0,(Q-df)/(sw-swSq/sw));
let tau=0;
for(let it=0;it<50;it++){const wi=vi.map(v=>1/(v+tau));const swi=wi.reduce((a,b)=>a+b,0);const mt=yi.reduce((a,y,i)=>a+wi[i]*y,0)/swi;const Qt=yi.reduce((a,y,i)=>a+wi[i]*(y-mt)**2,0);const dQ=yi.reduce((a,y,i)=>a+wi[i]*wi[i]*(y-mt)**2,0);const adj=(Qt-df)/dQ;tau=Math.max(0,tau+adj);if(Math.abs(adj)<1e-8)break;}
const out = { Q, df,
  dlInline, dlCore: C.pool(yi,vi,{method:'DL'}).tau2,
  pmInline: tau, pmCore: C.pool(yi,vi,{method:'PM'}).tau2,
  feCore: C.pool(yi,vi,{method:'FE'}).tau2 };
console.log(JSON.stringify(out));
"""


def _run():
    code = JS % json.dumps(DATA)
    r = subprocess.run([NODE, "-e", code], capture_output=True, text=True,
                       timeout=20, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_data_is_heterogeneous():
    o = _run()
    assert o["Q"] > o["df"], "test data must have τ²>0 to exercise the estimators"


def test_dl_tau2_parity():
    o = _run()
    assert math.isclose(o["dlInline"], o["dlCore"], abs_tol=1e-7), \
        f"DL τ² migration changed a value: inline={o['dlInline']} core={o['dlCore']}"


def test_pm_tau2_parity():
    o = _run()
    assert math.isclose(o["pmInline"], o["pmCore"], abs_tol=1e-7), \
        f"PM τ² migration changed a value: inline={o['pmInline']} core={o['pmCore']}"


def test_fe_tau2_is_zero():
    o = _run()
    assert o["feCore"] == 0
