"""Per-cell type-I diagnosis for the recenter gate, + a fix probe:
gate the point toward DL but CLAMP the lower bound at NPE's original lo
(directional union on the side that protects H0)."""
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
def smoothstep(g): return g*g*(3-2*g)
def gate(sev,s0,s1): return smoothstep(np.clip((sev-s0)/max(1e-9,(s1-s0)),0,1))

REPS=600
S0,S1=2.0,6.0
for blk,mu0 in [("typeI",0.0)]:
    print(f"=== type-I per cell (s0={S0},s1={S1}); old vs recenter vs clampLo ===")
    print(f"{'scenario':14s} {'k':>3s} {'sevMean':>7s} {'gMean':>5s} {'old_rej':>7s} {'rec_rej':>7s} {'clp_rej':>7s} {'rec_w':>6s} {'clp_w':>6s}")
    for k in [10,25]:
        for sc in dgp.SCENARIOS:
            cell={"mu":mu0,"tau2":0.05,"k":k,"scenario":sc}
            cid=H._cell_id(cell)
            ss=np.random.SeedSequence([H.BASE_SEED,H._stable_hash(cid),k]).spawn(REPS)
            Xs=[];dm=[];dl=[];dh=[]
            for rep in range(REPS):
                rng=np.random.default_rng(ss[rep])
                y,v,info=dgp.generate(mu0,0.05,k,sc,rng)
                if info["degenerate"] or len(y)<3: continue
                Xs.append(F.featurize(y,v)); d=M.dersimonian_laird(y,v)
                dm.append(d["mu"]);dl.append(d["ci_lo"]);dh.append(d["ci_hi"])
            X=np.vstack(Xs); sev=np.array([T._sev_proxy(X[i]) for i in range(len(X))])
            nmu,nlo,nhi=npe_batch(X); dm=np.array(dm)
            g=gate(sev,S0,S1); mug=dm+g*(nmu-dm)
            # recenter
            rlo=mug-(nmu-nlo); rhi=mug+(nhi-nmu)
            # clampLo: protect H0 — lower bound never rises above NPE's own lo
            clo=np.minimum(rlo,nlo); chi=rhi
            old_rej=np.mean((nlo>0)|(nhi<0))
            rec_rej=np.mean((rlo>0)|(rhi<0))
            clp_rej=np.mean((clo>0)|(chi<0))
            print(f"{sc:14s} {k:3d} {sev.mean():7.2f} {g.mean():5.2f} {old_rej:7.3f} "
                  f"{rec_rej:7.3f} {clp_rej:7.3f} {(rhi-rlo).mean():6.3f} {(chi-clo).mean():6.3f}")
