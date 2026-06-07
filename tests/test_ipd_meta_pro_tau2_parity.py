"""Evidence that IPD-Meta-Pro's inline τ² estimators are correct (2026-06-07).

IPD-Meta-Pro is a fully self-contained 121K-line IPD two-stage engine with 10+
inline DerSimonian-Laird / Paule-Mandel τ² computations across its main /
subgroup / sensitivity / per-outcome analyses, and zero external dependencies.
After scoping the inline-meta-math lint, it was EXEMPTED (not migrated): adding
ma-core as its first-ever dependency and rewriting 10+ scattered sites is high
blast radius for a bespoke, validated engine.

This test is the evidence behind that exemption: the inline DL and PM forms the
file uses (reproduced here from its `estimatePM` / DL-start code) must equal
ma-core's DL and PM to 1e-7 on heterogeneous second-stage aggregate data. It is
NOT a migration gate (nothing was migrated) — it documents that the exempted
inline math agrees with the single source, so the exemption is a divergence of
*location*, not of *value*.
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

# Second-stage aggregate effects + variances (one per study), heterogeneous.
EFFECTS = [0.20, 0.55, 0.10, 0.80, 0.35, 0.65, 0.45, 0.05]
VARIANCES = [0.04, 0.05, 0.03, 0.06, 0.045, 0.05, 0.04, 0.03]

JS = r"""
const C = require('./shared/ma-core.js');
const effects = %s, variances = %s, n = effects.length;
// inline DL closed form (IPD-Meta-Pro DL-start, line ~9083)
const w0 = variances.map(v => 1/v), tW0 = w0.reduce((a,b)=>a+b,0);
let mu0 = 0; for (let i=0;i<n;i++) mu0 += w0[i]*effects[i]; mu0 /= tW0;
let Q0 = 0; for (let i=0;i<n;i++) Q0 += w0[i]*(effects[i]-mu0)**2;
const C0 = tW0 - w0.reduce((a,w)=>a+w*w,0)/tW0;
let tau2 = Math.max(0,(Q0-(n-1))/C0); const dlInline = tau2;
// inline PM iteration (IPD-Meta-Pro estimatePM, lines ~9087-9127)
for (let it=0; it<100; it++) {
  const w = variances.map(v => 1/(v+tau2)), tW = w.reduce((a,b)=>a+b,0);
  let mu = 0; for (let i=0;i<n;i++) mu += w[i]*effects[i]; mu /= tW;
  let Q = 0; for (let i=0;i<n;i++) Q += w[i]*(effects[i]-mu)**2;
  if (Q <= n-1) { tau2 = 0; break; }
  const Cc = tW - w.reduce((a,x)=>a+x*x,0)/tW; if (Cc <= 0) break;
  const nt = Math.max(0, tau2 + (Q-(n-1))/Cc);
  if (Math.abs(nt-tau2) < 1e-8) break; tau2 = nt;
}
const pmInline = tau2;
console.log(JSON.stringify({
  dlInline, dlCore: C.pool(effects,variances,{method:'DL'}).tau2,
  pmInline, pmCore: C.pool(effects,variances,{method:'PM'}).tau2 }));
"""


def _run():
    code = JS % (json.dumps(EFFECTS), json.dumps(VARIANCES))
    r = subprocess.run([NODE, "-e", code], capture_output=True, text=True,
                       timeout=20, cwd=str(ROOT))
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_inline_dl_matches_ma_core():
    o = _run()
    assert math.isclose(o["dlInline"], o["dlCore"], abs_tol=1e-7)


def test_inline_pm_matches_ma_core():
    o = _run()
    assert math.isclose(o["pmInline"], o["pmCore"], abs_tol=1e-7)
