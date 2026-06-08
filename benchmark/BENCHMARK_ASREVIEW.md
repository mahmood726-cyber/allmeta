# allmeta vs ASReview — active-learning screening head-to-head (WSS@95)

**Status: 1-seed complete (all 19 datasets). Honest verdict: allmeta is BELOW ASReview.**
3-seed run + finer-cadence sensitivity pass pending; means will be updated.

This is a like-for-like comparison of allmeta's shipped active-learning screening
classifier against ASReview's published benchmark, on the standard datasets
ASReview itself reports on (Cohen 2006 TAR set + SYNERGY).

## How this was measured (truth-first, no browser, no server)

- **Headless.** No web server, no Playwright, no port. The classifier functions
  (`mlBuildVocab`, `mlVector`, `mlFit`, `mlPredict`, `simulateActiveLearning`,
  `normalizeImported`, …) are extracted **verbatim** from the shipped
  `screen/index.html` by brace-matching and run inside a Node `vm`. This is the
  exact shipped code path — confirmed because the headless numbers reproduce the
  earlier browser-driven run (`run_1seed.log`) to the digit.
- **Classifier (as shipped):** TF-IDF over unigrams + adjacent bigrams (+ MeSH/
  keywords), top-4000 terms, class-weighted logistic regression (lr 0.5, L2 1e-4,
  300 epochs), zero-init → deterministic. No embeddings, no ensemble, no
  doc2vec. This is the baseline free-core; no model upgrades were committed by a
  prior pass.
- **Active-learning protocol:** seed = 10 random records (forced ≥1 pos / ≥1 neg),
  then reveal the top-ranked **batch** (50 for N<1000, 100 for N<4000, 200 above),
  reveal gold labels, retrain, repeat. WSS@95 = `0.95 − screened_to_95%_recall / N`
  (standard Cohen/Kusa definition; 0 = no better than random screening order).
- **Datasets:** all 15 Cohen 2006 TAR datasets + 4 SYNERGY datasets
  (Appenzeller-Herzog 2020, Kwok 2020, Wolters 2018, Bos 2018), CC-licensed,
  fetched + attributed under `benchmark/data/`. See `data/corpora/ATTRIBUTION.md`.
- **Reproduce:** `node benchmark/run_headless.mjs` (3 seeds) or
  `SEEDS=1234567 node benchmark/run_headless.mjs` (1 seed, fast). Writes
  `benchmark/results_headless.json`.

`[m]` = measured here. `[d]` = documented / published.

## Per-dataset (1 seed, seed 1234567) — all 19 datasets

| Dataset | Suite | N | prev | WSS@95 `[m]` | recall@10% | recall@20% | recall@50% |
|---|---|--:|--:|--:|--:|--:|--:|
| ACE Inhibitors | Cohen | 2544 | 1.6% | 0.670 | 0.610 | 0.854 | 0.951 |
| ADHD | Cohen | 851 | 2.4% | 0.408 | 0.350 | 0.850 | 0.900 |
| Antihistamines | Cohen | 310 | 5.2% | **−0.050** | 0.063 | 0.313 | 0.813 |
| Atypical Antipsychotics | Cohen | 1120 | 13.0% | 0.138 | 0.212 | 0.418 | 0.808 |
| Beta Blockers | Cohen | 2072 | 2.0% | 0.559 | 0.357 | 0.833 | 0.976 |
| Calcium Channel Blockers | Cohen | 1218 | 8.2% | 0.203 | 0.210 | 0.470 | 0.770 |
| Estrogens | Cohen | 368 | 21.7% | 0.243 | 0.025 | 0.275 | 0.813 |
| NSAIDs | Cohen | 393 | 10.4% | 0.413 | 0.024 | 0.390 | 0.927 |
| Opioids | Cohen | 1915 | 0.8% | 0.109 | 0.467 | 0.733 | 0.933 |
| Oral Hypoglycemics | Cohen | 503 | 27.0% | 0.035 | 0.022 | 0.199 | 0.684 |
| Proton Pump Inhibitors | Cohen | 1333 | 3.8% | 0.192 | 0.412 | 0.725 | 0.824 |
| Skeletal Muscle Relaxants | Cohen | 1643 | 0.5% | 0.091 | 0.222 | 0.222 | 0.556 |
| Statins | Cohen | 3465 | 2.5% | 0.485 | 0.482 | 0.729 | 0.953 |
| Triptans | Cohen | 671 | 3.6% | 0.412 | 0.292 | 0.667 | 0.875 |
| Urinary Incontinence | Cohen | 327 | 12.2% | 0.461 | 0.025 | 0.350 | 0.975 |
| Appenzeller-Herzog 2020 | SYNERGY | 3453 | 0.8% | 0.425 | 0.621 | 0.897 | 0.931 |
| Kwok 2020 | SYNERGY | 2481 | 4.8% | 0.623 | 0.458 | 0.758 | 0.975 |
| Wolters 2018 | SYNERGY | 5019 | 0.4% | 0.549 | 0.632 | 0.895 | 1.000 |
| Bos 2018 | SYNERGY | 5746 | 0.2% | 0.356 | 0.545 | 0.909 | 0.909 |

## Aggregate (1 seed)

| Metric | allmeta `[m]` | ASReview `[d]` |
|---|--:|--:|
| **Cohen-15 mean WSS@95** | **0.291** | **~0.83** (range 0.67–0.92) |
| Cohen-15 median | 0.244 | — |
| Cohen-15 range | −0.050 – 0.670 | 0.67–0.92 |
| SYNERGY-4 mean | 0.489 | — |
| All-19 mean | 0.333 | — |

ASReview reference: van de Schoot et al. (2021), *Nature Machine Intelligence*
3:125–133, "An open source machine learning framework for efficient and
transparent systematic reviews" — published WSS@95 ~0.83 (Naive Bayes + TF-IDF
default, per-record / batch≈1 active learning). Per-dataset ASReview values are
NOT reproduced here to avoid fabrication; only the published aggregate is cited.
Cohen 2006 SVM / SWIFT-ActiveScreener per-dataset numbers are likewise not
fabricated; where a published value is not in hand it is left blank rather than
guessed.

## Honest verdict

**allmeta's shipped screening classifier is clearly BELOW ASReview — not at it,
not above it.** On the 15 Cohen datasets the measured mean WSS@95 is **0.291**
against ASReview's published **~0.83**, a gap of ~0.54. allmeta's *best* single
dataset (ACE Inhibitors, 0.670) only reaches ASReview's published *floor*, and
one dataset (Antihistamines, −0.050) is marginally worse than random screening
order. This is the as-shipped result with no cherry-picking and no rounding up.
SYNERGY datasets are somewhat better (mean 0.489) but still well short.

### Caveat being quantified next (not an excuse)
A material part of the gap is almost certainly the **retraining cadence**, not
just model quality: allmeta's harness reveals 50–200 records per retrain, whereas
ASReview retrains after **every single record** (batch≈1). Coarse batching means
the first 100–200 records on a small corpus are revealed in a near-random order
before the model has enough signal, which directly depresses WSS@95 (and explains
the negative Antihistamines value on a 310-record set, and low recall@10% on
several small high-prevalence sets). A finer-cadence sensitivity pass
(`BATCH=<n> node benchmark/run_headless.mjs`) will quantify how much of the gap is
protocol vs. model. Even so, on the as-shipped default, **allmeta does not match
or beat ASReview on this benchmark.**
