"""Point-only gating: mu_gated = DL + g*(NPE-DL), interval = NPE verbatim.
Coverage/width/type-I are identical to NPE_old by construction; only point bias
changes. Confirm clean bias drops, quantify under-sel point-bias cost, verify
coverage/typeI truly unchanged."""
import numpy as np, pickle, os
import dgp, features as F, harness as H, methods as M, train_sbi as T
HERE=os.path.dirname(os.path.abspath(__file__))
art=pickle.load(open(os.path.join(HERE,"sbi_model.pkl"),"rb"))
FN=F.FEATURE_NAMES; I={n:i for i,n in enumerate(FN)}
def npe_batch(X):
    q=art["q_grid"];m=art["models"];c=art["conformal"]
    P=T.predict_grid(m,q,X)
    d=np.array([T.conformal_d(c,X[i]) for i in range(X.shape[0])])
    lo=P[:,c["lo_idx"]]-d; hi=P[:,c["hi_idx"]]+d
    mu=np.clip(P[:,q.index(0.5)],lo,hi); return mu,lo,hi
def smoothstep(g): return g*g*(3-2*g)
def base_sev(X):
    return (np.abs(X[:,I["egger_t"]])+0.5*X[:,I["tf_k0"]]
            +2*np.abs(X[:,I["corr_y_se"]])+3*np.maximum(0,X[:,I["p_bin_lo"]]-X[:,I["p_bin_hi"]]))
def skew(X): return np.maximum(0,-X[:,I["resid_skew"]])
SEVS={"base":lambda X:base_sev(X),
      "base+10skew":lambda X:base_sev(X)+10*skew(X)}
REPS=600
ks=[5,10,15,25,50]
cells=[{"mu":0.3,"tau2":0.05,"k":k,"scenario":sc,"block":"primary"} for k in ks for sc in dgp.SCENARIOS]
cells+=[{"mu":0.0,"tau2":0.05,"k":k,"scenario":sc,"block":"typeI"} for k in [10,25] for sc in dgp.SCENARIOS]
percell=[]
for cell in cells:
    cid=H._cell_id(cell)
    ss=np.random.SeedSequence([H.BASE_SEED,H._stable_hash(cid),cell["k"]]).spawn(REPS)
    Xs=[];dm=[]
    for rep in range(REPS):
        rng=np.random.default_rng(ss[rep])
        y,v,info=dgp.generate(cell["mu"],cell["tau2"],cell["k"],cell["scenario"],rng)
        if info["degenerate"] or len(y)<3: continue
        Xs.append(F.featurize(y,v));dm.append(M.dersimonian_laird(y,v)["mu"])
    X=np.vstack(Xs);nmu,nlo,nhi=npe_batch(X)
    percell.append((cell,X,np.array(dm),nmu,nlo,nhi))
def met(mu,lo,hi,mt):
    return (np.mean(mu)-mt,np.mean((lo<=mt)&(hi>=mt)),np.mean(hi-lo),np.mean((lo>0)|(hi<0)))
def run(sevfn,s0,s1):
    A={"none":[],"sel":[],"prim":[],"tI":[]}
    for cell,X,dm,nmu,nlo,nhi in percell:
        if sevfn is None: mug=nmu
        else:
            g=smoothstep(np.clip((sevfn(X)-s0)/max(1e-9,s1-s0),0,1))
            mug=np.clip(dm+g*(nmu-dm),nlo,nhi)   # point only; interval untouched
        m=met(mug,nlo,nhi,cell["mu"])
        if cell["block"]=="primary":
            A["prim"].append(m); (A["none"] if cell["scenario"]=="none" else A["sel"]).append(m)
        else: A["tI"].append(m)
    return (np.mean([abs(m[0]) for m in A["none"]]),       # clean|b|
            np.mean([m[2] for m in A["none"]]),            # clean W
            np.mean([m[1] for m in A["none"]]),            # clean cov
            np.mean([abs(m[0]) for m in A["sel"]]),        # sel|b|
            np.mean([m[1] for m in A["sel"]]),             # selCov
            np.min([m[1] for m in A["sel"]]),              # selMin
            np.mean([m[2] for m in A["prim"]]),            # primW
            np.mean([m[3] for m in A["tI"]]),              # tImean
            np.max([m[3] for m in A["tI"]]))               # tImax
print(f"{'cfg':22s} {'cln|b|':>7s} {'clnW':>6s} {'clnCov':>6s} {'sel|b|':>6s} {'selCov':>6s} {'selMin':>6s} {'primW':>6s} {'tImn':>5s} {'tImx':>5s}")
r=run(None,0,0)
print(f"{'OLD (point=NPE)':22s} "+" ".join(f"{x:6.3f}" for x in r[:1])+f"  "+" ".join(f"{x:6.3f}" for x in r[1:]))
for name,fn in SEVS.items():
    for s0,s1 in [(1.5,5),(2,6),(2.5,7),(3,8)]:
        r=run(fn,s0,s1)
        print(f"{name+f' {s0},{s1}':22s} "+f"{r[0]:7.3f} "+" ".join(f"{x:6.3f}" for x in r[1:]))
