"""LMA.eggerTest against R (found 2026-11-12 by another lane; reproduced in real Chrome on the page's own bcg demo
dataset: se_intercept, t, z and p were NaN).

Egger's test is the OLS regression of yi/sei on 1/sei; the intercept is the asymmetry estimate. metafor
regtest(model = "lm") fits the equivalent lm(yi ~ sei, weights = 1/vi) and its sei coefficient equals that
intercept. The page (a) also weighted the standardized regression by 1/vi, which is not Egger's model, and
(b) used mse / (sum(w) - sum(w x)^2 / sum(w)) for the intercept variance, which is not the intercept variance
of any regression and is negative whenever sum(w x)^2 > sum(w)^2, giving sqrt(<0) = NaN.

References (R 4.6.0, metafor 5.2.1; summary(lm(I(yi/sqrt(vi)) ~ I(1/sqrt(vi)))) and regtest(yi, vi, model = "lm")):
  page demo 'bcg' set: intercept 5.699918, SE 4.240388, t 1.344197, p 0.2059506 (df 11), slope -1.657520
  metafor dat.bcg (escalc RR): intercept -2.1120421, SE 1.5072213, t -1.4012820, p 0.188707, slope -0.1909286
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

PRELUDE = r"""
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('living-meta/living-meta-complete.html','utf8');
const stub=new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?(()=>''):stub,apply:()=>stub,construct:()=>stub});
const sb={console:{log(){},warn(){},error(){},info(){}},Math,JSON,Number,String,Array,Object,isFinite,isNaN,parseFloat,parseInt,Date,setTimeout(){},clearTimeout(){},document:stub,localStorage:stub,navigator:stub,location:stub,addEventListener(){},removeEventListener(){}};
sb.window=sb;vm.createContext(sb);
for (const m of html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)) { try { vm.runInContext(m[1],sb); } catch(e) {} }
const L=sb.LMA;
"""


def egger(yi, vi):
    js = PRELUDE + "process.stdout.write(JSON.stringify(L.eggerTest(%s,%s)));" % (json.dumps(yi), json.dumps(vi))
    out = subprocess.run([NODE, "-e", js], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=120)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


DEMO_YI = [-0.8893, -1.5854, -1.3481, -1.4416, -0.2175, -0.7861, -1.6209, -0.4717, -0.0173, 0.4459, -0.0173, 0.5878, -1.3863]
DEMO_VI = [0.032, 0.012, 0.0115, 0.0204, 0.051, 0.0633, 0.0175, 0.0096, 0.0511, 0.0255, 0.2252, 0.02, 0.0096]
BCG_YI = [-0.88931133392020545, -1.5853886572014306, -1.3480731482996933, -1.4415511900213054, -0.21754732221129558,
          -0.78611558581886398, -1.6208982235983918, 0.011952333523840508, -0.4694176487381494, -1.3713448034727844,
          -0.33935882833839059, 0.44591340057137874, -0.017313948216879815]
BCG_VI = [0.32558476500396133, 0.19458112139814385, 0.41536796536796539, 0.020010031902247573, 0.051210172169630863,
          0.0069056184559087574, 0.22301724757231517, 0.0039615792978177295, 0.056434210463248966, 0.07302479361302891,
          0.01241221397155972, 0.53250584520015276, 0.071404659683986293]


@pytest.mark.parametrize("yi,vi,ref", [
    (DEMO_YI, DEMO_VI, dict(intercept=5.699918, se=4.240388, t=1.344197, p=0.2059506, slope=-1.657520)),
    (BCG_YI, BCG_VI, dict(intercept=-2.1120421, se=1.5072213, t=-1.4012820, p=0.188707, slope=-0.1909286)),
])
def test_egger_matches_r(yi, vi, ref):
    r = egger(yi, vi)
    assert r["df"] == len(yi) - 2
    assert r["se_intercept"] is not None, "se_intercept is NaN"
    assert r["intercept"] == pytest.approx(ref["intercept"], rel=1e-6)
    assert r["slope"] == pytest.approx(ref["slope"], rel=1e-6)
    assert r["se_intercept"] == pytest.approx(ref["se"], rel=1e-6)
    assert r["t"] == pytest.approx(ref["t"], rel=1e-6)
    assert r["pvalue"] == pytest.approx(ref["p"], rel=1e-4)


def test_equal_variances_still_refused_as_degenerate():
    r = egger([-0.5, -0.3, 0, 0.3, 0.5], [0.04] * 5)
    assert r["pvalue"] == 1 and r["se_intercept"] is None  # Infinity serialises as null


def test_fewer_than_three_studies_refused():
    assert "error" in egger([0.1, 0.2], [0.01, 0.02])
