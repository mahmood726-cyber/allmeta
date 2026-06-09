"""Ground-truth: run ASReview's OWN code (v2) end-to-end on the shared datasets,
to (a) sanity-check our headless harness's WSS@95 definition and (b) get the real
ASReview number for the same datasets. Replicates ELAS u3 (NB, the v1-equivalent
default) and ELAS u4 (SVM, the current default) exactly from asreview.models.

WSS@95 = 0.95 - (records labelled to reach 95% recall)/N  (priors count as labelled),
the same definition our harness uses. Seeded with 1 included + 1 excluded prior
(prior_seed varied) to mirror a realistic cold start.
"""
import sys, os, gzip, json
import numpy as np
import pandas as pd
from asreview.models.classifiers import NaiveBayes, SVM
from asreview.models.balancers import Balanced
from asreview.models.queriers import Max
from asreview.models.feature_extractors import Tfidf
from asreview.learner import ActiveLearningCycle
from asreview.simulation.simulate import Simulate
from sklearn.utils import check_random_state

CORP = sys.argv[1] if len(sys.argv) > 1 else "F:/allmeta/benchmark/data/corpora"
if len(sys.argv) > 2 and sys.argv[2] not in ("all", ""):
    DATASETS = sys.argv[2].split(",")
else:
    DATASETS = [d["id"] for d in json.load(open(f"{CORP}/manifest.json"))["datasets"]]
MODELS = os.environ.get("MODELS", "both")  # "nb" | "svm" | "both"
SEEDS = [int(s) for s in os.environ.get("SEEDS", "42,7,2024").split(",")]
OUT = os.environ.get("OUT")

def load(idn):
    with gzip.open(f"{CORP}/{idn}.csv.gz", "rt", encoding="utf-8") as f:
        df = pd.read_csv(f)
    df["title"] = df.get("title", "").fillna("")
    df["abstract"] = df.get("abstract", "").fillna("")
    y = (df["label_included"].astype(str).str.strip() == "1").astype(int).values
    return df[["title", "abstract"]], y

def cycle_u3():  # NB — mimics ASReview LAB v1 default (ELAS u3)
    return ActiveLearningCycle(querier=Max(), classifier=NaiveBayes(alpha=3.822),
        balancer=Balanced(ratio=1.2), feature_extractor=Tfidf(stop_words="english"), n_query=1)

def cycle_u4():  # SVM — current ASReview LAB default (ELAS u4)
    return ActiveLearningCycle(querier=Max(), classifier=SVM(loss="squared_hinge", C=0.11),
        balancer=Balanced(ratio=9.8),
        feature_extractor=Tfidf(ngram_range=(1, 2), sublinear_tf=True, min_df=1, max_df=0.95), n_query=1)

def wss95(results_order_labels, N, total_pos):
    found = 0
    for i, lab in enumerate(results_order_labels, start=1):
        found += int(lab)
        if found >= np.ceil(0.95 * total_pos):
            return 0.95 - i / N
    return 0.95 - 1.0

def run(idn, make_cycle):
    X, y = load(idn)
    N, P = len(y), int(y.sum())
    vals = []
    for s in SEEDS:
        r = check_random_state(s)
        inc = np.where(y == 1)[0]; exc = np.where(y == 0)[0]
        priors = np.concatenate([r.choice(inc, 1, replace=False), r.choice(exc, 1, replace=False)])
        sim = Simulate(X, y, make_cycle(), print_progress=False)
        sim.label(priors)
        sim.review()
        order = sim._results.sort_values("training_set", na_position="first")
        labs = list(order["label"].values)
        vals.append(wss95(labs, N, P))
    return N, P, float(np.mean(vals)), float(np.std(vals))

print(f"ASReview v2 ground-truth — MODELS={MODELS}, seeds={SEEDS}, 1+1 priors")
print(f"{'dataset':32s} {'N':>6s} {'P':>4s}  {'u3_NB':>7s}  {'u4_SVM':>7s}")
nb_all, svm_all, rows = [], [], {}
for idn in DATASETS:
    try:
        if MODELS in ("nb", "both"):
            N, P, nb_m, nb_s = run(idn, cycle_u3); nb_all.append(nb_m)
        else:
            N, P, nb_m, nb_s = (0, 0, float("nan"), 0)
        if MODELS in ("svm", "both"):
            N, P, svm_m, svm_s = run(idn, cycle_u4); svm_all.append(svm_m)
        else:
            svm_m = float("nan")
        rows[idn] = {"N": N, "P": P, "nb_wss95": nb_m, "svm_wss95": svm_m}
        print(f"{idn:32s} {N:6d} {P:4d}  {nb_m:7.3f}  {svm_m:7.3f}")
    except Exception as e:
        print(f"{idn:32s} ERROR {type(e).__name__}: {e}")
cohen_nb = [rows[k]["nb_wss95"] for k in rows if k.startswith("cohen_") and rows[k]["nb_wss95"] == rows[k]["nb_wss95"]]
if nb_all:
    print(f"{'MEAN(all)':32s} {'':6s} {'':4s}  {np.nanmean(nb_all):7.3f}  {(np.nanmean(svm_all) if svm_all else float('nan')):7.3f}")
if cohen_nb:
    print(f"{'MEAN(Cohen-15 NB)':32s} {'':6s} {'':4s}  {np.mean(cohen_nb):7.3f}")
if OUT:
    json.dump({"seeds": SEEDS, "models": MODELS, "perDataset": rows,
               "cohen15_nb_mean": float(np.mean(cohen_nb)) if cohen_nb else None,
               "all_nb_mean": float(np.nanmean(nb_all)) if nb_all else None,
               "all_svm_mean": float(np.nanmean(svm_all)) if svm_all else None}, open(OUT, "w"), indent=2)
    print(f"wrote {OUT}")
