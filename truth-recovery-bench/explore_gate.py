"""Fast gate-config exploration: NPE_old vs severity-gated NPE, NPE+DL only
(no PartialID), exact harness seeding. Picks (s0,s1,mode) before full validation."""
import numpy as np, pickle, os, itertools
import dgp, features as F, harness as H, methods as M, train_sbi as T

HERE=os.path.dirname(os.path.abspath(__file__))
art=pickle.load(open(os.path.join(HERE,"sbi_model.pkl"),"rb"))
def npe_batch(X):
    q=art["q_grid"];m=art["models"];c=art["conformal"]
    P=T.predict_grid(m,q,X)
    d=np.array([T.conformal_d(c,X[i]) for i in range(X.shape[0])])
    lo=P[:,c["lo_idx"]]-d; hi=P[:,c["hi_idx"]]+d
    mu=np.clip(P[:,q.index(0.5)],lo,hi); return mu,lo,hi

def smoothstep(g): return g*g*(3-2*g)
def gate(sev,s0,s1):
    g=np.clip((sev-s0)/max(1e-9,(s1-s0)),0,1); return smoothstep(g)

def gated(nmu,nlo,nhi,dmu,dlo,dhi,sev,s0,s1,mode):
    g=gate(sev,s0,s1)
    mug=dmu+g*(nmu-dmu)
    if mode=="recenter":
        lo=mug-(nmu-nlo); hi=mug+(nhi-nmu)
    else: # blend arms
        hwl=g*(nmu-nlo)+(1-g)*(dmu-dlo); hwh=g*(nhi-nmu)+(1-g)*(dhi-dmu)
        lo=mug-hwl; hi=mug+hwh
    return mug,lo,hi

def met(mu,lo,hi,mt):
    return (np.mean(mu)-mt, np.mean((lo<=mt)&(hi>=mt)), np.mean(hi-lo),
            np.mean((lo>0)|(hi<0)))

REPS=500
ks=[5,10,15,25,50]; scen=dgp.SCENARIOS
cells=[{"mu":0.3,"tau2":0.05,"k":k,"scenario":sc,"block":"primary"} for k in ks for sc in scen]
cells+=[{"mu":0.0,"tau2":0.05,"k":k,"scenario":sc,"block":"typeI"} for k in [10,25] for sc in scen]

configs=[(s0,s1,mode) for (s0,s1) in [(1.5,5),(2,6),(2.5,6),(2,5),(3,7),(1.5,4)]
         for mode in ["recenter","blend"]]
# accumulators per (config or 'old'): lists of (cell, metric tuple)
data={c:[] for c in configs}; data["old"]=[]
for cell in cells:
    cid=H._cell_id(cell)
    ss=np.random.SeedSequence([H.BASE_SEED,H._stable_hash(cid),cell["k"]]).spawn(REPS)
    Xs=[];dm=[];dl=[];dh=[]
    for rep in range(REPS):
        rng=np.random.default_rng(ss[rep])
        y,v,info=dgp.generate(cell["mu"],cell["tau2"],cell["k"],cell["scenario"],rng)
        if info["degenerate"] or len(y)<3: continue
        Xs.append(F.featurize(y,v)); d=M.dersimonian_laird(y,v)
        dm.append(d["mu"]);dl.append(d["ci_lo"]);dh.append(d["ci_hi"])
    X=np.vstack(Xs); sev=np.array([T._sev_proxy(X[i]) for i in range(X.shape[0])])
    nmu,nlo,nhi=npe_batch(X); dm=np.array(dm);dl=np.array(dl);dh=np.array(dh)
    mt=cell["mu"]
    data["old"].append((cell,met(nmu,nlo,nhi,mt)))
    for cfg in configs:
        mug,lo,hi=gated(nmu,nlo,nhi,dm,dl,dh,sev,*cfg)
        data[cfg].append((cell,met(mug,lo,hi,mt)))

def agg(key):
    rows=data[key]
    none=[m for c,m in rows if c["block"]=="primary" and c["scenario"]=="none"]
    sel=[m for c,m in rows if c["block"]=="primary" and c["scenario"]!="none"]
    prim=[m for c,m in rows if c["block"]=="primary"]
    tI=[m for c,m in rows if c["block"]=="typeI"]
    cb=np.mean([abs(m[0]) for m in none]); cw=np.mean([m[2] for m in none]); cc=np.mean([m[1] for m in none])
    sb=np.mean([abs(m[0]) for m in sel]); scov=np.mean([m[1] for m in sel]); smin=np.min([m[1] for m in sel])
    pw=np.mean([m[2] for m in prim])
    tr=np.mean([m[3] for m in tI]); trmax=np.max([m[3] for m in tI])
    return cb,cw,cc,sb,scov,smin,pw,tr,trmax

print(f"{'config':22s} {'cln|b|':>7s} {'clnW':>6s} {'clnCov':>6s} {'sel|b|':>6s} "
      f"{'selCov':>6s} {'selMin':>6s} {'primW':>6s} {'tImean':>6s} {'tImax':>6s}")
for key in ["old"]+configs:
    cb,cw,cc,sb,scov,smin,pw,tr,trmax=agg(key)
    lbl=key if key=="old" else f"{key[0]}-{key[1]}-{key[2][:3]}"
    print(f"{lbl:22s} {cb:7.3f} {cw:6.3f} {cc:6.3f} {sb:6.3f} {scov:6.3f} {smin:6.3f} {pw:6.3f} {tr:6.3f} {trmax:6.3f}")
