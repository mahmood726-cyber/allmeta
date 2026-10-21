# Results: Screen vs ASReview LAB on held-out SYNERGY+ reviews

One held-out run and one analysis, under PROTOCOL.md (registered `24f04f3`, tag `h2h-prereg-v1`; Amendment 1
`d069c77`; FREEZE `47f0cb2`). Run 2026-10-21 11:30-21:20. Commands: PROTOCOL 7.5. Outputs: `results/analysis/`.

## Primary result (H1, then H2)

84 PRIMARY reviews in 73 clusters; 10 seeds each; every run of every tool succeeded (870/870 x 3; success 1.0),
so the confirmatory analysis is valid.

| | Screen (frozen) | ASReview ELAS u4 | ASReview ELAS u3 |
|---|---|---|---|
| Mean WSS@95 (review level, descriptive) | 0.683 | 0.645 | 0.613 |

- **Cluster-weighted mean difference in WSS@95, Screen minus u4: +0.040 (95% CI +0.027 to +0.052).**
- **H1 non-inferiority (margin -0.02): accepted** (lower limit +0.027 > -0.02; one-sided p < 1e-13).
- **H2 superiority: accepted** (lower limit > 0; one-sided p = 9e-9), tested in fixed sequence after H1.
- Reviews: Screen higher on 69, lower on 14, equal on 1 of 84; 4 reviews lose by more than the margin
  (largest loss Brons_2024, -0.093; R = 25, N = 172).

**S6, reviews with R >= 20 only** (where WSS@95 differs from WSS@100; 40 clusters): **+0.037 (95% CI +0.020 to
+0.053)**, Screen higher in 34 of 40 clusters.

In records: +0.040 WSS@95 means that, from the same 2 + 2 starting records, Screen reached 95% recall after
screening on average about 4 fewer records per 100 records in a review than ASReview's default model.

## Secondary family (Holm, two-sided)

| Outcome | Mean difference (95% CI) | Holm p |
|---|---|---|
| WSS@95 vs u3 | +0.073 (+0.044, +0.102) | 1e-5 |
| Recall at 10% screened vs u4 | +0.027 (+0.016, +0.038) | 1e-5 |
| Recall at 20% screened vs u4 | +0.020 (+0.011, +0.029) | 5e-5 |
| Proportion screened to the last relevant vs u4 (lower is better) | -0.045 (-0.060, -0.029) | 5e-7 |

## Sensitivity analyses (descriptive)

| | Estimate |
|---|---|
| S1 Wilcoxon / Hodges-Lehmann pseudo-median | +0.030 (+0.021, +0.043), p = 1e-9 |
| S2 cluster bootstrap 95% CI | +0.028 to +0.052 |
| S3 review as unit (84, dependence ignored) | +0.039 (+0.026, +0.051) |
| S4 leave-one-cluster-out / leave-one-review-out range | +0.038 to +0.042 |
| S5 seed 101 only | +0.042 (+0.026, +0.059) |
| S6 R >= 20 only | +0.037 (+0.020, +0.053) |
| S7 official test split (15 reviews) | +0.034 (+0.009, +0.060); H1 and H2 accepted |
| S8 cluster thresholds 5% / 20% | +0.042 / +0.040 |
| S9 PRIMARY + 3 DEV-overlapping reviews (87) | +0.040 (+0.027, +0.052) |
| S11 Screen at its UI cadence | not run: the app refits after every decision, the same cadence as the benchmark |
| S12 cross-machine determinism (desktop-iljmsi3) | **not run**: that node was fully held by other work; owed |

## What this does and does not show

- It compares ranking quality in simulation (every record labelled by the dataset's own labels, both tools stop
  at the last relevant record), against ASReview 3.0.8's default ELAS u4 and its earlier default u3. It is not a
  user study, and it does not measure screening speed or ease of use.
- ASReview's newer ELAS u5 was not compared (not on PyPI at registration; tuned on SYNERGY+'s training split).
- Screen's frozen ranker is a JS port of u4 (TF-IDF + linear SVM) plus a SPECTER2 embedding of each record. Most of
  the gain comes from that embedding. SPECTER2 was pretrained on citation links in the scientific literature, which
  may include papers in these reviews; that signal is label-adjacent but uses none of these reviews' labels.
- The DEV estimate was +0.043; an independent results review before the freeze expected about +0.02 held out.
- Cost to users: the SPECTER2 model is an optional 110 MB download, and embedding runs at about 2-4 records per
  second on a CPU (Node measurement); until embedding finishes, the app ranks with the u4 port alone.

## Conduct: deviations from the protocol text (none changes a setting, an outcome or a test)

1. **Hosts.** PROTOCOL 7.5 names `baseimage` for the runs. All ASReview runs and part of the Screen runs ran there;
   Screen runs for 53 of the 87 reviews ran on the laptop node (the other 34 on baseimage) (same frozen commit, Node v24.15.0). Held-out
   embeddings were computed on baseimage and the laptop (desktop-iljmsi3, planned in FREEZE.md, was fully held).
   Before any held-out embedding, a DEV review embedded on each machine was byte-identical to the DEV vectors;
   the 5 embedding files present on both machines are identical (`embeddings_sha256.txt`).
2. **Sharding.** Runs were split with `run_heldout.py --reviews` into separate output folders and merged with
   `results/ho_merge.py`: final per-review files only, every review exactly once, any duplicate required to have
   identical runs (records in `merge_*.json`). Merged folders are named `*_merged` instead of `R/screen` etc.
3. **Stopped drivers.** To rebalance long reviews, the operator stopped some drivers at shard boundaries. A stopped
   driver's in-progress attempt is not a failure and is not in any attempt log; its partial per-seed files were
   not merged. No result file was produced twice with different content.
4. **Analysis commands.** As PROTOCOL 7.5, plus `--screen-freeze-json FREEZE.json` (Amendment 1, A1.4) and
   `--data-dir`.
5. **Archive redaction.** In the archived copies the Windows user name in absolute paths is replaced by `<user>`;
   `merge_*.json` keeps the sha256 of each unredacted file as produced on the run node.

## Files

- `results/analysis/{primary,s7_test16,s8_5pct,s8_20pct,s9_plusdev}.json` (analyze.py outputs).
- `results/R/{screen_merged,asreview/elas_u4_merged,asreview/elas_u3_merged}/`: every per-seed screening order,
  environment, and the concatenated attempt logs.
- `results/merge_*.json`, `results/embeddings_sha256.txt` (87 held-out embedding files and their metadata).
