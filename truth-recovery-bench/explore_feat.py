"""Find a severity feature that is HIGH for strong selection at BOTH mu=0 and
mu=0.3 but LOW for none, so the gate keeps NPE on all strong-selection cells."""
import numpy as np, os
import dgp, features as F, harness as H
FN=F.FEATURE_NAMES
idx={n:i for i,n in enumerate(FN)}
REPS=500
cells=[]
for mu in [0.0,0.3]:
    for sc in ["none","step_weak","step_strong","copas_weak","copas_strong"]:
        cells.append((mu,sc))
feats=["egger_t","corr_y_se","p_bin_lo","p_bin_mid","p_bin_hi","frac_pos",
       "tf_k0","tf_gap","i2","resid_skew","ptl_se_signal","peese_b0","pet_b0","dl_mu","fe_mu"]
print(f"{'mu':>4s} {'scenario':13s} "+" ".join(f"{f[:7]:>7s}" for f in feats))
for k in [25]:
    for mu,sc in cells:
        cell={"mu":mu,"tau2":0.05,"k":k,"scenario":sc}
        cid=H._cell_id(cell)
        ss=np.random.SeedSequence([H.BASE_SEED,H._stable_hash(cid),k]).spawn(REPS)
        Xs=[]
        for rep in range(REPS):
            rng=np.random.default_rng(ss[rep])
            y,v,info=dgp.generate(mu,0.05,k,sc,rng)
            if info["degenerate"] or len(y)<3: continue
            Xs.append(F.featurize(y,v))
        X=np.vstack(Xs)
        print(f"{mu:4.1f} {sc:13s} "+" ".join(f"{X[:,idx[f]].mean():7.3f}" for f in feats))
