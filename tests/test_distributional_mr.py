"""Tests for shared/distributional-mr.js — distributional meta-regression with a
skew-normal between-study random-effects distribution (location + log-scale + shape).

Numerical baselines are computed LIVE against a reference and pasted here:

  (a) shape fixed at 0 reduces EXACTLY to shared/location-scale.js (metafor rma
      scale-model ML). Verified two ways:
        - the skew-normal per-study log density at lambda=0 equals the normal
          location-scale log density pointwise (machine precision, ~9e-16);
        - fit() with W omitted delegates to the location-scale core (bit-identical).
  (b) location+scale+shape skew-normal fit cross-checked against an independent,
      clean-room R MLE of the SAME marginal skew-normal likelihood and against the
      CRAN `sn` package's dsn():
        - the marginal per-study density equals sn::dsn to ~9e-16;
        - normal (lambda=0) intercept fit == metaplus(random='normal') to 7 dp
          (muhat=-0.7463152, tau2=0.2539984 on the metaplus `mag` data);
        - a controlled interior-lambda simulated dataset (k=45) matches the R MLE
          on xi/omega2/lambda/delta/logLik to <= 2.4e-7 (tol 1e-4);
        - the real `mag` data (k=16) drives lambda to the boundary (delta -> -1,
          the classic Azzalini monotone-likelihood pathology) — JS and R agree on
          the boundary logLik/delta/xi/omega2 (<= ~1e-6).
      NOTE: metaplus has NO skew-normal random-effects option (only normal / t-dist
      / mixture), so the skew comparator is the clean-room R MLE + sn::dsn, not
      metaplus; metaplus is used only for the normal anchor.
  (c) the skewness MODERATOR is only validated by Monte-Carlo recovery (weakly
      identified). Small deterministic MC: the Wald CI has ~nominal coverage and the
      moderator direction is recovered, but the lambda-scale point estimate is
      UPWARD-biased and heavy-tailed — so we assert coverage + direction only, NOT a
      0.05 point-bias gate. fit() REFUSES a shape moderator for k < 20 (guard).
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

PRELUDE = (
    "const DMR = require('./shared/distributional-mr.js');\n"
    "const LS  = require('./shared/location-scale.js');\n"
    "const delta_of = l => l/Math.sqrt(1+l*l);\n"
)

# metaplus `mag` magnesium dataset (k=16) — yi and vi=sei^2.
MAG_YI = [-0.8303483, -1.056053, -1.27834, -0.0434851, 0.2231435, -2.40752,
          -1.280934, -1.191703, -0.695748, -2.208274, -2.03816, -0.8501509,
          -0.7932307, -0.2993399, -1.570789, 0.0575873]
MAG_VI = [1.555053892, 0.171454462, 0.653088967, 2.04349884, 0.239285724,
          1.149629995, 1.425000863, 2.759891109, 0.287486419, 1.231318684,
          0.609533556, 0.382478671, 0.3917085, 0.021483615, 0.329521348, 0.001001222]

# Controlled interior-lambda simulated dataset (k=45), generated in R with sn::rsn
# (seed 20260710, xi=-0.30, omega=0.55, lambda=3.0) then y=theta+N(0,sei^2).
SIM_YI = [-0.02832092855, -0.1666028203, 0.0569353472, -0.2227006271, 0.9017526239,
          0.3414712777, -0.01538733535, 0.09121611689, 0.2036351188, -0.001576147108,
          -0.3473187217, 0.8585061735, 0.5410360041, 0.2468183496, -0.2890036821,
          0.3185778946, -0.2651213029, -0.05131669849, -0.8865090843, 0.3607115862,
          -0.1250528479, 0.2617199479, -0.03010128957, 0.7996609742, 0.6243255788,
          -0.190577648, 0.5481876518, 0.4557933077, -0.1285877623, -0.3918602597,
          0.1416448816, -0.182462862, -0.2734460143, -0.206771305, -0.4807617397,
          -0.1295213327, 0.04336951455, -0.258343333, 0.50832214, -0.130643265,
          0.1278339478, -0.04115808457, -0.3480765251, 0.02333279678, -0.1554545166]
SIM_VI = [0.01633467299, 0.02833691615, 0.0100606576, 0.02605634625, 0.03738147613,
          0.01594866298, 0.007105081669, 0.03024595331, 0.03675697739, 0.03807639954,
          0.007251546957, 0.03810243409, 0.01302032345, 0.02150952406, 0.006960200628,
          0.007785392285, 0.03304463241, 0.01918299716, 0.02162940717, 0.008454342629,
          0.009016317204, 0.02808766853, 0.0271269926, 0.02861463247, 0.02357827689,
          0.02413209623, 0.02413986761, 0.03147426488, 0.0214255759, 0.02342565139,
          0.03218321251, 0.02564534211, 0.01222667679, 0.00985275267, 0.008760010237,
          0.03351083374, 0.01545201028, 0.02288073165, 0.0180245741, 0.01504545803,
          0.008942082332, 0.02514134985, 0.01422091286, 0.01771917201, 0.01791945309]

# Clean-room R MLE anchors (optim on the identical marginal skew-normal likelihood).
R_SIM = dict(xi=-0.3278721586, omega2=0.2472869880, lam=2.4954000248,
             delta=0.9282404894, logLik=-17.7477476216)
R_MAG = dict(xi=0.09955547, omega2=1.05831055, delta=-1.00000000, logLik=-19.09947159)
# metaplus(random='normal') on mag (== metafor rma ML).
METAPLUS_NORMAL = dict(mu=-0.7463152, tau2=0.2539984)


def _run(body: str):
    r = subprocess.run(
        [NODE, "-e", PRELUDE + body],
        capture_output=True, text=True, timeout=180, cwd=str(ROOT),
    )
    if r.returncode != 0:
        raise AssertionError(f"node exited {r.returncode}\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def _arr(x):
    return "[" + ",".join(repr(v) for v in x) + "]"


# --------------------------------------------------------------------------- (a)
def test_reduction_a_density_equals_normal_pointwise():
    """Skew-normal log density at lambda=0 == normal location-scale log density."""
    yi = [0.10, 0.32, -0.05, 0.44, 0.28, 0.61, 0.02, 0.35]
    vi = [0.02, 0.05, 0.03, 0.06, 0.04, 0.08, 0.02, 0.05]
    mod = [0, 1, 0, 1, 0, 1, 0, 1]
    body = f"""
      const yi={_arr(yi)}, vi={_arr(vi)}, mod={_arr(mod)};
      const X=yi.map((_,i)=>[1,mod[i]]), Z=yi.map((_,i)=>[1,mod[i]]), W=yi.map(()=>[1]);
      const beta=[0.2,0.15], alpha=[-2.5,0.4];
      let ll=-0.5*yi.length*Math.log(2*Math.PI);
      for(let i=0;i<yi.length;i++){{const t2=Math.exp(Z[i][0]*alpha[0]+Z[i][1]*alpha[1]);
        const s2=vi[i]+t2,e=yi[i]-(X[i][0]*beta[0]+X[i][1]*beta[1]);
        ll+=-0.5*Math.log(s2)-0.5*e*e/s2;}}
      const skew=DMR._logDens(yi,vi,X,Z,W,beta,alpha,[0.0]);
      console.log(JSON.stringify({{normalLL:ll,skewLL:skew,absdiff:Math.abs(ll-skew)}}));
    """
    o = _run(body)
    assert o["absdiff"] < 1e-12


def test_reduction_a_fit_delegates_to_location_scale():
    """fit() with W omitted is bit-identical to shared/location-scale.js."""
    yi = [0.10, 0.32, -0.05, 0.44, 0.28, 0.61, 0.02, 0.35, 0.50, -0.12,
          0.27, 0.41, 0.19, 0.55, 0.08, 0.36]
    vi = [0.02, 0.05, 0.03, 0.06, 0.04, 0.08, 0.02, 0.05, 0.07, 0.03,
          0.04, 0.06, 0.03, 0.09, 0.02, 0.05]
    mod = [0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1]
    body = f"""
      const yi={_arr(yi)}, vi={_arr(vi)}, mod={_arr(mod)};
      const X=yi.map((_,i)=>[1,mod[i]]), Z=yi.map((_,i)=>[1,mod[i]]);
      const d=DMR.fit(yi,vi,X,Z,null), l=LS.fit(yi,vi,X,Z);
      console.log(JSON.stringify({{
        db:Math.max(...d.beta.map((b,i)=>Math.abs(b-l.beta[i]))),
        da:Math.max(...d.alpha.map((a,i)=>Math.abs(a-l.alpha[i]))),
        dll:Math.abs(d.logLik-l.logLik), shapeEstimated:d.shapeEstimated}}));
    """
    o = _run(body)
    assert o["shapeEstimated"] is False
    assert o["db"] < 1e-9 and o["da"] < 1e-9 and o["dll"] < 1e-9


# --------------------------------------------------------------------------- (b)
def test_reduction_b_normal_matches_metaplus():
    """Normal (lambda=0) intercept fit on mag == metaplus(random='normal')."""
    body = f"""
      const yi={_arr(MAG_YI)}, vi={_arr(MAG_VI)};
      const X=yi.map(()=>[1]), Z=yi.map(()=>[1]);
      const f=DMR.fit(yi,vi,X,Z,null);
      console.log(JSON.stringify({{mu:f.beta[0],tau2:f.tau2[0],logLik:f.logLik}}));
    """
    o = _run(body)
    assert math.isclose(o["mu"], METAPLUS_NORMAL["mu"], abs_tol=1e-4)
    assert math.isclose(o["tau2"], METAPLUS_NORMAL["tau2"], abs_tol=1e-4)


def test_reduction_b_skew_matches_r_interior():
    """Interior-lambda simulated fit (k=45) matches the clean-room R MLE to 1e-4."""
    body = f"""
      const yi={_arr(SIM_YI)}, vi={_arr(SIM_VI)};
      const X=yi.map(()=>[1]), Z=yi.map(()=>[1]), W=yi.map(()=>[1]);
      const f=DMR.fit(yi,vi,X,Z,W);
      console.log(JSON.stringify({{xi:f.beta[0],omega2:f.omega2[0],lambda:f.lambda[0],
        delta:delta_of(f.lambda[0]),logLik:f.logLik,shapeEstimated:f.shapeEstimated}}));
    """
    o = _run(body)
    assert o["shapeEstimated"] is True
    assert math.isclose(o["xi"], R_SIM["xi"], abs_tol=1e-4)
    assert math.isclose(o["omega2"], R_SIM["omega2"], abs_tol=1e-4)
    assert math.isclose(o["lambda"], R_SIM["lam"], abs_tol=1e-4)
    assert math.isclose(o["delta"], R_SIM["delta"], abs_tol=1e-4)
    assert math.isclose(o["logLik"], R_SIM["logLik"], abs_tol=1e-4)


def test_reduction_b_skew_matches_r_boundary_mag():
    """Real mag data drives lambda to the boundary; JS and R agree there."""
    body = f"""
      const yi={_arr(MAG_YI)}, vi={_arr(MAG_VI)};
      const X=yi.map(()=>[1]), Z=yi.map(()=>[1]), W=yi.map(()=>[1]);
      const f=DMR.fit(yi,vi,X,Z,W);
      console.log(JSON.stringify({{xi:f.beta[0],omega2:f.omega2[0],
        delta:delta_of(f.lambda[0]),logLik:f.logLik}}));
    """
    o = _run(body)
    assert math.isclose(o["delta"], R_MAG["delta"], abs_tol=1e-4)   # -> -1 boundary
    assert math.isclose(o["xi"], R_MAG["xi"], abs_tol=1e-4)
    assert math.isclose(o["omega2"], R_MAG["omega2"], abs_tol=1e-3)
    assert math.isclose(o["logLik"], R_MAG["logLik"], abs_tol=1e-4)


# --------------------------------------------------------------------------- (c)
def test_reduction_c_shape_moderator_guard():
    """fit() refuses a shape moderator (non-intercept W column) for k < 20."""
    body = """
      const k=15, yi=[], vi=[], m=[];
      for(let i=0;i<k;i++){yi.push(0.1*i-0.6);vi.push(0.1);m.push(i%2);}
      const X=yi.map(()=>[1]), Z=yi.map(()=>[1]);
      const Wmod=yi.map((_,i)=>[1,m[i]]), Wint=yi.map(()=>[1]);
      const bad=DMR.fit(yi,vi,X,Z,Wmod), ok=DMR.fit(yi,vi,X,Z,Wint);
      console.log(JSON.stringify({guardErr:bad.error||null, guardTag:bad.guard||null,
        interceptErr:ok.error||null}));
    """
    o = _run(body)
    assert o["guardTag"] == "k<kMin"
    assert o["guardErr"] is not None and "k >= 20" in o["guardErr"]
    assert o["interceptErr"] is None      # intercept-only skew is allowed at k=15


def test_reduction_c_moderator_montecarlo_recovery():
    """Small deterministic MC (weakly identified): assert NOMINAL Wald coverage and
    recovered moderator DIRECTION only — NOT a 0.05 point-bias gate. The lambda-scale
    estimator is honestly upward-biased and heavy-tailed under weak identification."""
    # k=50, nu1_true=2.5; 15 reps, fixed seeds -> deterministic. Runs in the suite.
    body = """
      const ZA=1.959963984540054;
      function mul(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
        t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
      function gauss(seed){const u=mul(seed);let sp=null;return{n(){if(sp!==null){const v=sp;sp=null;return v;}
        const u1=Math.max(u(),1e-12),u2=u(),r=Math.sqrt(-2*Math.log(u1));sp=r*Math.sin(2*Math.PI*u2);
        return r*Math.cos(2*Math.PI*u2);},u};}
      const k=50,b0=0,om=Math.sqrt(0.4),nu0=-1.0,nu1=2.5,REPS=15;
      let ests=[],cov=0,n=0;
      for(let rep=0;rep<REPS;rep++){
        const g=gauss(4242+rep);const yi=[],vi=[],m=[];
        for(let i=0;i<k;i++){const mi=i<k/2?0:1,lam=nu0+nu1*mi,del=lam/Math.sqrt(1+lam*lam);
          const U=Math.abs(g.n()),Zc=g.n(),theta=b0+om*del*U+om*Math.sqrt(1-del*del)*Zc;
          const v=0.02;yi.push(theta+Math.sqrt(v)*g.n());vi.push(v);m.push(mi);}
        const X=yi.map(()=>[1]),Z=yi.map(()=>[1]),W=yi.map((_,i)=>[1,m[i]]);
        const f=DMR.fit(yi,vi,X,Z,W);if(f.error)continue;
        const n1=f.nu[1],se=f.nuSE[1];ests.push(n1);n++;
        if(isFinite(se)&&Math.abs(n1-nu1)<=ZA*se)cov++;}
      ests.sort((a,b)=>a-b);const med=ests[Math.floor(n/2)];
      console.log(JSON.stringify({n:n,median:med,coverage:cov/n,allPositive:ests.every(e=>e>0)}));
    """
    o = _run(body)
    assert o["n"] == 15
    # direction recovered: median estimate is positive and same order as truth (2.5)
    assert o["median"] > 0.8
    assert o["allPositive"] is True
    # Wald CI coverage is near nominal (loose 3-sigma-ish band for 15 reps)
    assert o["coverage"] >= 0.73


def test_boundary_exposes_mean_and_flags_unidentified():
    """Hardening: at the |delta|->1 boundary, beta is the location xi (NOT the
    pooled mean) and shape SEs are undefined. The engine must (a) flag boundary +
    non-convergence, (b) warn, and (c) expose meanEffect = xi + omega*delta*sqrt(2/pi),
    which recovers the true pooled effect (metafor rma ML mu = -0.7463) that beta
    alone (xi ~ +0.10) does not."""
    body = f"""
      const yi={_arr(MAG_YI)}, vi={_arr(MAG_VI)};
      const X=yi.map(()=>[1]), Z=yi.map(()=>[1]), W=yi.map(()=>[1]);
      const f=DMR.fit(yi,vi,X,Z,W);
      console.log(JSON.stringify({{beta:f.beta[0], mean:f.meanEffect[0],
        boundary:f.boundary, converged:f.converged, nWarn:(f.warnings||[]).length}}));
    """
    o = _run(body)
    assert o["boundary"] is True
    assert o["converged"] is False
    assert o["nWarn"] >= 1
    # beta (xi) is near +0.10 and far from the true pooled effect
    assert o["beta"] > -0.2
    # meanEffect recovers the true pooled effect (metafor rma ML mu = -0.7463)
    assert abs(o["mean"] - (-0.7463152)) < 0.1, o
