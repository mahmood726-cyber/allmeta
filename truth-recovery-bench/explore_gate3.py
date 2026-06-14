"""Test gate severities that ADD a resid_skew term, plain recenter (no clamp,
no widening). Goal: clean |bias| small, clean width ~unchanged, under-sel min
cov >=0.90, type-I mean<=0.05 & max<=0.10."""
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
def skew_term(X): return np.maximum(0,-X[:,I["resid_skew"]])
SEVS={
 "base":        lambda X: base_sev(X),
 "base+8skew":  lambda X: base_sev(X)+8*skew_term(X),
 "base+12skew": lambda X: base_sev(X)+12*skew_term(X),
 "base+16skew": lambda X: base_sev(X)+16*skew_term(X),
}
def met(mu,lo,hi,mt):
    return (np.mean(mu)-mt,np.mean((lo<=mt)&(hi>=mt)),np.mean(hi-lo),np.mean((lo>0)|(hi<0)))
REPS=600
ks=[5,10,15,25,50]
cells=[{"mu":0.3,"tau2":0.05,"k":k,"scenario":sc,"block":"primary"} for k in ks for sc in dgp.SCENARIOS]
cells+=[{"mu":0.0,"tau2":0.05,"k":k,"scenario":sc,"block":"typeI"} for k in [10,25] for sc in dgp.SCENARIOS]
# precompute per cell
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

def run(sevfn,s0,s1):
    agg={"none":[],"sel":[],"prim":[],"tI":[],"tImax_cell":None}
    tImax=-1;worst=None
    for cell,X,dm,nmu,nlo,nhi in percell:
        sev=sevfn(X);g=smoothstep(np.clip((sev-s0)/max(1e-9,s1-s0),0,1))
        mug=dm+g*(nmu-dm);lo=mug-(nmu-nlo);hi=mug+(nhi-nmu)
        m=met(mug,lo,hi,cell["mu"])
        if cell["block"]=="primary":
            agg["prim"].append(m)
            if cell["scenario"]=="none":agg["none"].append(m)
            else:agg["sel"].append(m)
        else:
            agg["tI"].append(m)
            if m[3]>tImax:tImax=m[3];worst=f'{cell["scenario"]}_k{cell["k"]}'
    cb=np.mean([abs(m[0]) for m in agg["none"]]);cw=np.mean([m[2] for m in agg["none"]])
    sb=np.mean([abs(m[0]) for m in agg["sel"]]);scov=np.mean([m[1] for m in agg["sel"]]);smin=np.min([m[1] for m in agg["sel"]])
    pw=np.mean([m[2] for m in agg["prim"]]);tr=np.mean([m[3] for m in agg["tI"]])
    return cb,cw,sb,scov,smin,pw,tr,tImax,worst

print(f"{'sev':12s} {'s0,s1':8s} {'cln|b|':>7s} {'clnW':>6s} {'sel|b|':>6s} {'selCov':>6s} {'selMin':>6s} {'primW':>6s} {'tImn':>5s} {'tImx':>5s} worst")
# baseline old
c,X,dm,nmu,nlo,nhi=None,None,None,None,None,None
old_none=[];old_sel=[];old_prim=[];old_tI=[];tImax=-1;worst=None
for cell,X,dm,nmu,nlo,nhi in percell:
    m=met(nmu,nlo,nhi,cell["mu"])
    if cell["block"]=="primary":
        old_prim.append(m)
        (old_none if cell["scenario"]=="none" else old_sel).append(m)
    else:
        old_tI.append(m)
        if m[3]>tImax:tImax=m[3];worst=f'{cell["scenario"]}_k{cell["k"]}'
print(f"{'OLD':12s} {'-':8s} {np.mean([abs(m[0]) for m in old_none]):7.3f} {np.mean([m[2] for m in old_none]):6.3f} "
      f"{np.mean([abs(m[0]) for m in old_sel]):6.3f} {np.mean([m[1] for m in old_sel]):6.3f} {np.min([m[1] for m in old_sel]):6.3f} "
      f"{np.mean([m[2] for m in old_prim]):6.3f} {np.mean([m[3] for m in old_tI]):5.3f} {tImax:5.3f} {worst}")
for name,fn in SEVS.items():
    for s0,s1 in [(2,6),(2.5,7),(2,7)]:
        cb,cw,sb,scov,smin,pw,tr,tx,w=run(fn,s0,s1)
        print(f"{name:12s} {f'{s0},{s1}':8s} {cb:7.3f} {cw:6.3f} {sb:6.3f} {scov:6.3f} {smin:6.3f} {pw:6.3f} {tr:5.3f} {tx:5.3f} {w}")
