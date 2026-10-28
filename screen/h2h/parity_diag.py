"""Diagnose a parity divergence: at the first differing step, refit ASReview's u4 (sklearn) on the shared prefix and
report the scores of the two records each tool picked. Also reports both tools' WSS@95. DEV only.

  python h2h/parity_diag.py --review Muthu_2020 --seed 202 --parity-dir C:/h2h/parity --data-dir C:/h2h/synergy_plus_local
"""
import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC

import core


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--review", required=True); ap.add_argument("--seed", required=True)
    ap.add_argument("--parity-dir", required=True); ap.add_argument("--data-dir", required=True)
    a = ap.parse_args()
    A = json.loads(Path(a.parity_dir, f"asr_{a.review}.json").read_text())["runs"][a.seed]["order"]
    J = json.loads(Path(a.parity_dir, f"js_{a.review}.json").read_text())["runs"][a.seed]["order"]
    df, y, _ = core.load_review(a.review, Path(a.data_dir))
    i = next(k for k in range(len(A)) if A[k] != J[k])
    X = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1, max_df=0.95).fit_transform(
        (df["title"].fillna("") + " " + df["abstract"].fillna("")).tolist())
    lab = A[:i]; yl = y[lab]
    n1, n0 = yl.sum(), (1 - yl).sum(); w = np.where(yl == 1, 1.0, n1 / (9.8 * n0)); w *= len(yl) / w.sum()
    gaps = []
    for rs in range(5):  # liblinear's shuffle order varies with the RNG: show how stable the pick is
        clf = LinearSVC(C=0.11, loss="squared_hinge", random_state=rs).fit(X[lab], yl, sample_weight=w)
        s = clf.decision_function(X)
        gaps.append({"rs": rs, "score_asr_pick": float(s[A[i]]), "score_js_pick": float(s[J[i]]), "diff": float(s[A[i]] - s[J[i]])})
    print(json.dumps({"review": a.review, "seed": a.seed, "first_diff": i, "asr_pick": A[i], "js_pick": J[i],
                      "labels": [int(y[A[i]]), int(y[J[i]])],
                      "wss_asr": core.metrics_from_order(A, y)["wss95"], "wss_js": core.metrics_from_order(J, y)["wss95"],
                      "refits": gaps}, indent=1))


if __name__ == "__main__":
    main()
