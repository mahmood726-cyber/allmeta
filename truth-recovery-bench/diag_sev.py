"""Diagnostic: distribution of _sev_proxy severity + NPE-vs-DL gap per scenario,
on the exact harness seeding. Tells us whether severity cleanly separates
'none' from EVERY selection type (incl. Copas, which lacks a step fingerprint),
which is the precondition for a severity-gated correction."""
import numpy as np, pickle, os
import dgp, features as F, harness as H, methods as M, train_sbi as T

HERE=os.path.dirname(os.path.abspath(__file__))
art=pickle.load(open(os.path.join(HERE,"sbi_model.pkl"),"rb"))
def npe_batch(X):
    q=art["q_grid"];m=art["models"];c=art["conformal"]
    P=T.predict_grid(m,q,X)
    d=np.array([T.conformal_d(c,X[i]) for i in range(X.shape[0])])
    lo=P[:,c["lo_idx"]]-d; hi=P[:,c["hi_idx"]]+d
    mu=np.clip(P[:,q.index(0.5)],lo,hi); return mu,lo,hi

REPS=400
scen=["none","step_weak","step_strong","copas_weak","copas_strong"]
print(f"{'scenario':14s} {'k':>3s} {'sev_mean':>9s} {'sev_p10':>8s} {'sev_p90':>8s} "
      f"{'npe_bias':>9s} {'dl_bias':>8s} {'npe-dl':>8s} {'npe_cov':>8s} {'dl_cov':>7s}")
for k in [5,10,25,50]:
    for sc in scen:
        cell={"mu":0.3,"tau2":0.05,"k":k,"scenario":sc}
        cid=H._cell_id(cell)
        ss=np.random.SeedSequence([H.BASE_SEED,H._stable_hash(cid),k]).spawn(REPS)
        Xs=[];dlmu=[];dllo=[];dlhi=[]
        for rep in range(REPS):
            rng=np.random.default_rng(ss[rep])
            y,v,info=dgp.generate(0.3,0.05,k,sc,rng)
            if info["degenerate"] or len(y)<3: continue
            Xs.append(F.featurize(y,v))
            d=M.dersimonian_laird(y,v)
            dlmu.append(d["mu"]);dllo.append(d["ci_lo"]);dlhi.append(d["ci_hi"])
        X=np.vstack(Xs)
        sev=np.array([T._sev_proxy(X[i]) for i in range(X.shape[0])])
        nmu,nlo,nhi=npe_batch(X)
        dlmu=np.array(dlmu);dllo=np.array(dllo);dlhi=np.array(dlhi)
        npe_bias=nmu.mean()-0.3; dl_bias=dlmu.mean()-0.3
        npe_cov=np.mean((nlo<=0.3)&(nhi>=0.3)); dl_cov=np.mean((dllo<=0.3)&(dlhi>=0.3))
        print(f"{sc:14s} {k:3d} {sev.mean():9.3f} {np.percentile(sev,10):8.3f} "
              f"{np.percentile(sev,90):8.3f} {npe_bias:+9.3f} {dl_bias:+8.3f} "
              f"{nmu.mean()-dlmu.mean():+8.3f} {npe_cov:8.3f} {dl_cov:7.3f}")
