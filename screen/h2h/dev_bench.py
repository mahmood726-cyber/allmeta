"""DEV-only candidate exploration (never run on PRIMARY / official-test reviews; the script refuses).

A lean re-implementation of the per-record active-learning loop (Max querier, n_query = 1, retrain after every
record, stop at the last relevant record), so many feature/classifier configurations can be compared quickly.
`--parity` checks that, for the u4 configuration, the loop reproduces ASReview's own screening order exactly.

  python h2h/dev_bench.py --reviews Appenzeller-Herzog_2019 --configs u4,hyb_bge_1 --seeds 11,22,33 --out E:/.../dev.jsonl
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import normalize
from sklearn.svm import LinearSVC

import core

ROOT = Path(__file__).resolve().parent
EMB_DIR = Path("E:/screen-h2h-data/emb")
DEV_SEEDS = [11, 22, 33]  # dev seeds differ from the confirmatory seeds


def forbidden_reviews() -> set[str]:
    s = set()
    for f in ("primary.txt", "official_test16.txt"):
        p = ROOT / "sets" / f
        if p.exists():
            s |= {x.strip() for x in p.read_text().splitlines() if x.strip() and not x.startswith("#")}
    return s


def text_of(df):
    return (df["title"].fillna("") + " " + df["abstract"].fillna("")).tolist()


def tfidf(df, kind):
    if kind == "u4":
        v = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1, max_df=0.95)
    elif kind == "u3":
        v = TfidfVectorizer(stop_words="english")
    elif kind == "u4min2":
        v = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=2, max_df=0.95)
    else:
        raise ValueError(kind)
    return v.fit_transform(text_of(df)).tocsr()


def load_emb(review, model):
    p = EMB_DIR / model / f"{review}.f32"
    meta = json.loads(Path(str(p) + ".json").read_text())
    return np.fromfile(p, dtype="<f4").reshape(meta["N"], meta["dim"])


def balanced_weights(y, ratio):
    n1, n0 = (y == 1).sum(), (y == 0).sum()
    w = np.where(y == 1, 1.0, n1 / (ratio * n0))
    return w * (len(y) / w.sum())


# ---- configurations -------------------------------------------------------------------------------
# name -> dict(feat=..., clf=..., C=..., ratio=..., emb=..., w=...)
def parse_config(name: str) -> dict:
    """Config names:
      u4                       ASReview ELAS u4 replica (tfidf u4 + LinearSVC C=.11, Balanced 9.8)
      u3                       ASReview ELAS u3 replica (tfidf stop-words + MultinomialNB 3.822, Balanced 1.2)
      emb_<model>[_C<c>]       embedding only, LinearSVC
      hyb_<model>_<w>[_C<c>]   [tfidf_u4 ; w * embedding] concatenated, LinearSVC
      lr_<feat>...             as above with L2 logistic regression instead of SVM
    """
    parts = name.split("_")
    cfg = {"name": name, "clf": "svm", "C": 0.11, "ratio": 9.8, "tfidf": "u4", "emb": None, "w": 0.0}
    if parts[0] == "lr":
        cfg["clf"] = "lr"; parts = parts[1:]
    for p in list(parts):
        if p.startswith("C") and p[1:].replace(".", "").isdigit():
            cfg["C"] = float(p[1:]); parts.remove(p)
        elif p.startswith("r") and p[1:].replace(".", "").isdigit():
            cfg["ratio"] = float(p[1:]); parts.remove(p)
    if parts[0] == "u4":
        pass
    elif parts[0] == "u3":
        cfg.update(clf="nb", tfidf="u3", ratio=1.2)
    elif parts[0] == "emb":
        cfg.update(tfidf=None, emb=parts[1], w=1.0)
    elif parts[0] == "hyb":
        cfg.update(emb=parts[1], w=float(parts[2]))
    else:
        raise ValueError(name)
    return cfg


def features(review, df, cfg):
    blocks = []
    if cfg["tfidf"]:
        blocks.append(tfidf(df, cfg["tfidf"]))
    if cfg["emb"]:
        E = normalize(load_emb(review, cfg["emb"]))
        blocks.append(sp.csr_matrix(E * cfg["w"]))
    return blocks[0] if len(blocks) == 1 else sp.hstack(blocks).tocsr()


def make_clf(cfg):
    if cfg["clf"] == "svm":
        return LinearSVC(loss="squared_hinge", C=cfg["C"])
    if cfg["clf"] == "lr":
        return LogisticRegression(C=cfg["C"], solver="liblinear")
    if cfg["clf"] == "nb":
        from sklearn.naive_bayes import MultinomialNB
        return MultinomialNB(alpha=3.822)
    raise ValueError(cfg["clf"])


def run_loop(X, y, prior_idx, cfg, seed):
    """Max querier, n_query 1, retrain every record, stop at last relevant. Mirrors ASReview Simulate.review."""
    np.random.seed(seed)
    N, R = len(y), int(y.sum())
    labelled = list(prior_idx)
    in_l = np.zeros(N, bool); in_l[labelled] = True
    found = int(y[labelled].sum())
    while found < R:
        clf = make_clf(cfg)
        yl = y[labelled]
        clf.fit(X[labelled], yl, sample_weight=balanced_weights(yl, cfg["ratio"]))
        pool = np.flatnonzero(~in_l)
        s = clf.predict_proba(X[pool])[:, 1] if hasattr(clf, "predict_proba") and cfg["clf"] == "nb" else clf.decision_function(X[pool])
        pick = int(pool[np.argsort(-s, kind="stable")[0]])  # as ASReview 3.0.8 Max: stable, lowest index wins ties
        labelled.append(pick); in_l[pick] = True; found += int(y[pick])
    return labelled


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reviews", required=True)
    ap.add_argument("--configs", required=True)
    ap.add_argument("--seeds", default=",".join(map(str, DEV_SEEDS)))
    ap.add_argument("--out", required=True)
    ap.add_argument("--data-dir", default=str(core.DATA_DIR))
    a = ap.parse_args()
    dev = {x.strip() for x in (ROOT / "sets" / "dev.txt").read_text().splitlines() if x.strip() and not x.startswith("#")}
    bad = (forbidden_reviews() & set(a.reviews.split(","))) | (set(a.reviews.split(",")) - dev)
    if bad:
        raise SystemExit(f"DEV exploration is restricted to sets/dev.txt; refusing: {sorted(bad)}")
    with open(a.out, "a") as fo:
        for rv in a.reviews.split(","):
            df, y, _ = core.load_review(rv, Path(a.data_dir))
            for cname in a.configs.split(","):
                cfg = parse_config(cname)
                X = features(rv, df, cfg)
                for s in [int(x) for x in a.seeds.split(",")]:
                    t0 = time.time()
                    order = run_loop(X, y, core.prior_records(rv, y, s), cfg, s)
                    m = core.metrics_from_order(order, y)
                    rec = {"review": rv, "config": cname, "seed": s, **m, "seconds": round(time.time() - t0, 1)}
                    fo.write(json.dumps(rec) + "\n"); fo.flush()
                    print(f"{rv:26s} {cname:22s} {s:4d} WSS@95 {m['wss95']:.4f} ({rec['seconds']} s)", flush=True)


if __name__ == "__main__":
    main()
