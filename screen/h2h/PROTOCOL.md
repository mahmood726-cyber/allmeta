# Pre-registered protocol: Screen vs ASReview LAB on held-out reviews

Status: **pre-registration**. This file is committed, and its commit SHA recorded (git tag `h2h-prereg-v1`), before
any run of either tool on any review in the held-out sets below. After that commit, the only permitted addition is
`FREEZE.md`, which names the frozen Screen candidate (allmeta commit SHA, `rank-core.js` sha256, configuration name,
model-file sha256s) before the held-out run. Any other change is a protocol amendment: it must be dated, justified
and reported alongside the results, and if it is made after held-out results exist it voids the confirmatory status
of the analysis it touches.

This protocol answers the requirements raised in the external review of Paper 1 (Oyewole; points 6.1-6.17 of
`REVIEW_OF_ARUN.md`) and the owner's brief of 19 October 2026. A draft was reviewed adversarially by an independent
model (OpenAI Codex, 19 findings); every finding was addressed in this version before registration.

## 1. Question and hypotheses

Does Screen's frozen in-browser ranker save at least as much screening work as ASReview LAB's default model,
on systematic reviews that neither tool was tuned on?

The estimand throughout is the **cluster-weighted mean difference** (Section 6): per review, each tool's outcome is
averaged over 10 seeds; d_r = Screen - comparator; a cluster's d_c is the mean of its reviews' d_r; the estimand is
the mean of d_c over clusters, each cluster weighted equally.

- **H1 (primary, non-inferiority).** The cluster-weighted mean difference in WSS@95, Screen minus ASReview ELAS u4,
  is greater than -0.02.
- **H2 (superiority, tested only if H1 is accepted; fixed sequence, so no alpha adjustment).** The same mean
  difference is greater than 0.
- Secondary outcomes (Section 7.3) are a separate family, Holm-adjusted.

## 2. Comparators

| | Version / setting |
|---|---|
| ASReview LAB | **3.0.8** (PyPI), the current release; its default model is ELAS u4. Exact environment: `h2h/requirements-asreview-3.0.8.txt` (pip freeze). |
| Primary comparator | **ELAS u4** exactly as `asreview.models.models.get_ai_config("elas_u4")` returns it: Max querier, SVM (squared hinge, C = 0.11), Balanced (ratio 9.8), TF-IDF (1-2 grams, sublinear tf, min_df 1, max_df 0.95), `n_query = 1`. |
| Secondary comparator | **ELAS u3** (Naive Bayes alpha 3.822, Balanced 1.2, TF-IDF with English stop words, Max, `n_query = 1`). |
| How ASReview is run | `h2h/run_asreview_h2h.py`: the code path of ASReview 3.0.8's `asreview simulate --ai <name> --prior-idx ...` (cycles `[TopDown until IsFittable, from_meta(<ai config>)]`, `LastRelevant` stopper, priors via `sim.label`, `group_similar_records` off as in the CLI default), with ASReview's own `load_dataset`. Nothing in ASReview is modified. The stock `Max` querier is used; in 3.0.8 it ranks with `np.argsort(-p, kind="stable")`, so ties go to the lowest record index (the Screen ranker breaks ties the same way). The runner refuses to start unless the installed ASReview version is 3.0.8 and the resolved u4/u3 configuration equals the one registered in `h2h/sets/comparator_configs.json`; it records version, configuration, package list hash and CPU SIMD features in every output. |
| Disclosed addition | `np.random.seed(seed)` before each simulation, because u4's `LinearSVC(random_state=None)` draws liblinear's shuffle from NumPy's global generator. It changes no setting. |
| Platform | All confirmatory runs of both tools execute on `baseimage` (Windows, x86-64). |
| ELAS u5 | Not a comparator: it is unreleased on PyPI at the time of registration (default only on ASReview's `main`), and it was tuned on SYNERGY+'s training split, which overlaps the primary set. |

The Screen candidate is the in-browser ranker of the allmeta Screen app at the commit named in `FREEZE.md`. Its
ranking code is the exact file the browser loads (`rank-core.js` or its successor, sha256 in `FREEZE.md`), executed
in Node by `h2h/js/run_js.mjs`, which itself recomputes the ID hash and the dataset digest (3.1), rejects labels
outside {0, 1}, refuses a `rank-core.js` whose hash differs from the frozen one, and, for embeddings, refuses files
computed from a different CSV (sha256 of the input bytes) or with weights other than the frozen ONNX file.

Context (DEV only, not confirmatory): a Node port of ELAS u4 inside `rank-core.js` reproduced real ASReview 3.0.8's
screening order exactly in 22 of 24 (review, seed) runs on 12 DEV reviews; in the other 2 the orders diverged late
(steps 108/907 and 427/620) at near-ties whose scores differed by about 1e-7 and whose order flips with liblinear's
shuffle; both picks were irrelevant records and WSS@95 was identical (`h2h/parity_dev.py`, `h2h/parity_diag.py`). If the candidate uses an embedding model, embeddings are computed with the same
library (Transformers.js) and the same pinned ONNX weight files that the browser loads (sha256 in `FREEZE.md`). The
candidate must run with no network access after the model files are cached: no hosted model, no API. An optional
LLM relevance prior, if explored, is not part of the confirmatory candidate and would be reported separately,
labelled as requiring upload of titles/abstracts to a provider.

## 3. Datasets

### 3.1 Source

SYNERGY+ v3.0 (De Bruin et al., DataverseNL doi:10.34894/DDCVCV v3.0; collection licence CC0 1.0). Obtained as
the GitHub release archive `asreview/synergy-dataset` tag `synergy_plus_v3.0` (commit `d6c46f32bd0e325a64eafa9da6dd3bdb9db5579f`;
zip sha256 `5c0d6fbff0e9073be8c7dc712ee73610496a85c3a32b9d1a9f44ce4bb7686640`), because the DataverseNL object
store (`objectstore.surf.nl`) timed out from all three of our machines. CSVs were built with `synergy-dataset==2.2`:
`SYNERGY_PATH=<extracted archive> python -m synergy_dataset get -l --min-inclusions 0 -o <dir> < /dev/null`
(archive of the 119 built CSVs: sha256 `611190bac3539e686342b3d31e07c846b01eb9c7ed74ea7338612084f0d01980`). Each
review's exact analysis input is additionally frozen by `dataset_sha256` in `h2h/priors/<review>.json`: a sha256 over
the ordered (OpenAlex ID, label, title, abstract) tuples; the analysis refuses data that do not match it.

**SYNERGY legal note (recorded in substance).** The CLI asks, before building: abstracts in SYNERGY "cannot be
published in plaintext" and are stored as OpenAlex inverted indexes; converting them back to plaintext locally for
machine learning is offered, but the plaintext must not be published again. We answered yes non-interactively with
the CLI's own `-l/--ignore-legal` flag. Consequence: **plaintext SYNERGY+ abstracts are never committed or
redistributed**. This repository commits only review keys, OpenAlex IDs, record indices, label-derived metrics and
screening orders; the built CSVs stay outside the repository and are rebuilt from the pinned archive.

**What the builder distributes.** For SYNERGY+, `synergy-dataset` 2.2 yields only works that are open access in
OpenAlex **and** have a valid abstract (>= 20 words or >= 100 characters; `Dataset.iter()`); the archive holds no
abstract for non-OA works. Each review is therefore its open-access-with-abstract subset: the built files hold
roughly a quarter to two thirds of the listed records and inclusions (per review:
`h2h/synergy_plus_v3.0_inventory.csv`, columns `n_records`/`n_included` vs `n_built`/`R_built`). This is SYNERGY+
as its maintainers distribute it, so we use it unmodified and every set rule below applies to the built data.
Results describe these subsets, not the reviews' full search results.

Reference standard: `label_included` (inclusion after full-text screening), as distributed. Labels must be exactly
0 or 1 and every record must carry an OpenAlex ID, or loading fails. No label is edited. Records are used as
distributed (no within-review de-duplication), identically for both tools.

### 3.2 Tuning history (what each tool has been tuned on)

| Tool | Tuned on |
|---|---|
| ASReview ELAS u4 | 24 classic SYNERGY v1 reviews (asreview-optuna tag `ASReview2_0b4-nb-tfidf-full-1`, commit `4b9e0d98`, `src/synergy_studies_full.jsonl`; classic 26 minus Chou_2004, Jeyaraman_2020). Matched to SYNERGY+ **by publication DOI** (`h2h/sets/asreview_tuning_map.json`, DOIs in `h2h/sets/classic_v1_dois.txt`): 22 SYNERGY+ reviews, including five renamed ones (Hall_2012 -> Hall_2011, Moran_2021 -> Moran_2020, Muthu_2021 -> Muthu_2020, Smid_2020 -> Smid_2019, van_Dis_2020 -> van_Dis_2019). Nelson_2002 and van_de_Schoot_2018 have no SYNERGY+ counterpart. |
| Screen (history) | Cohen 2006 (15 drug-class reviews), Appenzeller-Herzog, Bos 2018, Kwok 2020, Wolters 2018 (allmeta benchmark, kaizen of 2026-06-09); PR #145 used Appenzeller-Herzog and Kwok. |
| Screen candidate (this study) | Only the DEV set below. Every DEV-exploration script refuses held-out review keys. |

### 3.3 Sets (fixed now)

- **PRIMARY held-out set** (`h2h/sets/primary.txt`, confirmatory): every SYNERGY+ v3.0 review that is not one of the
  22 ASReview tuning reviews, has at least 5 relevant records in the built data, and shares < 10% of its records
  with every DEV review (3.4). Of 97 non-tuning reviews, 10 have R < 5 after building (Alunno_2020, Clark_2021,
  Deckers_2022, Demirkaya_2015, Erer_2015, Ferreira_2022, Pijls_2017, Roberts_2021, Zinsser_2022, de_Matteis_2024a)
  and 3 overlap DEV (Kerschbaumer_2022, Webers_2022, van_Ballegooijen_2024), leaving **84 reviews (110,549 records;
  largest 7,573) in 73 clusters**. 44 of the 84 have R >= 20. None is a Screen tuning review (3.4).
- **Descriptive extension** (`h2h/sets/primary_plus_devoverlap.txt`): PRIMARY plus the 3 DEV-overlapping reviews,
  analysed descriptively only.
- **SECONDARY held-out subset** (`h2h/sets/official_test16.txt`): the reviews of SYNERGY+'s official test split
  (`synergy_dataset.splits.TEST_SPLIT`) that are in PRIMARY (15).
- **DEV set** (`h2h/sets/dev.txt`, the only data the Screen candidate may be tuned on): the 22 ASReview-tuning
  reviews in SYNERGY+, the 15 Cohen 2006 files, and Kwok 2020 (from ASReview's `systematic-review-datasets`; it is
  **not** part of SYNERGY). DEV results carry no confirmatory weight; on DEV, ASReview is evaluated in-sample.
  Chou_2003 (DEV) is itself the Cohen Opioids review (86% shared titles).

### 3.4 Cross-review duplicates

Computed before registration from record identity only (OpenAlex IDs and normalised titles; no labels, no tool
output): `h2h/overlap.py` -> `h2h/sets/overlap.json`. SYNERGY+ contains families of reviews built from shared
searches (e.g. the EULAR series Kerschbaumer/Sepriano/Webers share up to 72% of records). Each review is a separate
screening task with its own eligibility criteria and labels, so records are **not** removed from any review;
non-independence is handled in the unit of inference:

- **Clusters.** PRIMARY reviews are joined (union-find) when they share records amounting to >= 10% of the smaller
  review: **73 clusters from 84 reviews**; 7 clusters have more than one review (`h2h/sets/clusters.json`):
  Bech_2019/Lauper_2021/Ramiro_2015; Bindoli_2024a/b + de_Matteis_2024b; Boersma-van_Dam_2024/van_de_Schoot_2025;
  Bosch_2023/Sanchez-Alvarez_2023; Kerschbaumer_2024a/2024b + Sepriano_2022; Lewowski_2021/Zakeri-Nasrabadi_2023a/b;
  Parodis_2023a/b. Alternative thresholds (sensitivity): 5% -> 61 clusters (`clusters_5pct.json`), 20% -> 80
  (`clusters_20pct.json`). The analysis refuses a cluster file that is not an exact partition of the analysed set.
- **Overlap with DEV**: reviews sharing >= 10% of records with any DEV review are excluded from PRIMARY (3.3); global
  tuning could otherwise exploit shared records.
- **Overlap with Screen's historical tuning files** (all 20 local files: Cohen 2006 x15 and the 4 ASReview benchmark
  files, plus Kwok): each matches only its own SYNERGY+ version (Bos, Wolters, Appenzeller-Herzog, and Chou_2003 =
  Cohen Opioids: all DEV) and <= 3% of any other review.
- van_de_Schoot_2018 (a u4 tuning review absent from SYNERGY+) could not be checked for record overlap with
  van_de_Schoot_2025 (PRIMARY); this is disclosed.

### 3.5 Licences

Collection: CC0 1.0. Per-source licences, resolved from each deposit's repository API, are in
`h2h/sets/licences.csv` (all 119 SYNERGY+ reviews): 105 CC-BY-4.0, 9 CC0-1.0, 2 CC0 data waiver (BMC supplement),
3 unknown (Chou_2003 [DEV; OHSU page states no licence]; Mejean_2024 [Zenodo record without licence];
Verdugo-Castro_2022 [Zenodo "other-open", source repo without LICENSE]). No source is non-commercial or
no-derivatives. We analyse but do not redistribute any SYNERGY+ text. Cohen 2006 labels are openly provided by OHSU
(citation requested); Kwok 2020 is CC-BY 4.0. CC-BY sources are cited in the results report.

## 4. Starting records, replication and stopping

- 10 seeds: 101, 202, 303, 404, 505, 606, 707, 808, 909, 1010.
- For each (review, seed): **2 relevant and 2 irrelevant records** drawn uniformly at random with
  `numpy.random.Generator(PCG64([seed, crc32(review_key)]))` (`h2h/core.py: prior_records`). Two plus two is
  Screen's real training gate (`mlTrainOn`: "Label at least 2 includes and 2 excludes"); ASReview accepts any
  prior set. The same four records are given to both tools; they count as screened for both. The draws are
  committed in `h2h/priors/<review>.json` with the ID hash and dataset digest; both runners refuse a dataset whose
  order differs, and the analysis rejects any order that does not begin with the registered four records.
- Both tools retrain after every screened record (ASReview `n_query = 1`; Screen per-record) and stop when the last
  relevant record has been screened; an order that continues past it is rejected.
- If the frozen Screen candidate's UI uses a different retraining cadence, a sensitivity run uses that cadence
  (`FREEZE.md` states it; `run_js.mjs --retrain-every K`).

## 5. Outcomes (all computed by `h2h/core.py: metrics_from_order` from each tool's screening order)

- **Primary:** WSS@95 = 0.95 - n95/N, n95 = records screened when ceil(0.95 R) relevant records are found.
- Secondary: recall at 10% and at 20% of records screened; proportion of records screened when the last relevant
  record is found (`prop_last`, lower is better).
- Known limits, reported with the results: WSS@95 is a retrospective (oracle) quantity, not an operational stopping
  rule; its nominal "random screening" baseline is not exact with discrete recall targets and forced relevant
  starting records; for R <= 19, ceil(0.95 R) = R and WSS@95 equals WSS@100 minus 0.05 (flagged per review). No
  stopping rule or "safe to stop" claim is evaluated or made.

## 6. Unit of analysis

The review is the experimental unit; the **cluster of overlapping reviews (3.4) is the unit of inference**, and
every confirmatory and secondary estimate is the cluster-weighted mean (Section 1). Seeds within a review are
dependent replicates and are never treated as independent observations. "n of N" is reported per review (of 84) and
per cluster (of 73).

## 7. Analysis (implemented in `h2h/analyze.py`, committed with this protocol)

### 7.1 Primary (H1, then H2)

Mean of d_c over the 73 PRIMARY clusters with a two-sided 95% t-interval (df = k - 1). H1 is accepted if the lower
limit exceeds **-0.02** (one-sided alpha 0.025). If H1 is accepted, H2 is accepted if the lower limit exceeds 0.
Reported: mean, 95% CI, one-sided p-values for both nulls, k, the number of clusters and of reviews with a positive,
negative and zero difference, and the number of reviews on which Screen loses by more than the margin. Zero-variance
differences give p = 0 or 1 by definition; fewer than 2 clusters or a non-finite difference stops the analysis.

### 7.2 Non-inferiority margin: 0.02 WSS@95

- Meaning: the cluster-weighted mean WSS@95 of Screen is at most two percentage points below u4's, i.e. on average
  Screen screens at most 2% more of the records to reach 95% recall. It does not bound the loss on any single review
  (per-review losses are reported separately).
- It is an absolute average effort tolerance. For context only: on the corrected in-sample benchmark
  (screen-reproducible v1.0.1) u4's mean WSS@95 was 0.468, so 0.02 is about 4% of that; held-out WSS@95 may be
  smaller, and no "fraction of u4's benefit preserved" is claimed.
- It is below the u4 - u3 gap on the same benchmark (0.035), the difference ASReview treated as large enough to
  change its default model. Arun Oyewole proposed +/-0.03 as an equivalence margin; we use the stricter 0.02.
- Fixed before any held-out result exists.

**Power** (from the in-sample review-level SD of Screen - u4 differences, 0.061, 19 reviews; normal approximation
with the t critical value): with k = 73 clusters, the probability of accepting H1 is about 0.79 if the true
difference is 0, and the probability of accepting H2 is about 0.28 if the true difference is +0.01 and 0.79 if it
is +0.02. The SD came from full (unfiltered) review files and may differ on these subsets. With the 15-review
official-test subset alone, H1 power at a true difference of 0 would be about 0.19, which is why it is secondary.

### 7.3 Secondary family (Holm, two-sided alpha 0.05, interpreted regardless of H1)

1. WSS@95, Screen vs ELAS u3 (superiority).
2. Recall at 10% effort, Screen vs u4.
3. Recall at 20% effort, Screen vs u4.
4. `prop_last`, Screen vs u4.

Each: cluster-weighted mean difference, 95% t-CI, two-sided one-sample t-test on cluster differences, Holm p.

### 7.4 Sensitivity analyses (descriptive, no multiplicity claims; every one has a fixed command in 7.5)

- S1 Wilcoxon signed-rank on cluster differences; estimand: Hodges-Lehmann pseudo-median of cluster-level
  differences, with a CI from Walsh-average order statistics at the normal-approximation signed-rank critical value
  (no tie correction; symmetry assumed). If every difference is exactly 0, p = 1 and the pseudo-median is 0.
- S2 Cluster bootstrap (10,000 resamples of clusters, seed 20261019, percentile CI).
- S3 Unit = review (84, dependence-ignoring), reported as such.
- S4 Leave-one-cluster-out and leave-one-review-out ranges of the mean difference (review deletion keeps the other
  members' cluster membership).
- S5 Single seed (101 only). S6 Reviews with R >= 20 only (where WSS@95 differs from WSS@100).
- S7 The 15-review official-test subset (H1/H2 as in 7.1).
- S8 Cluster thresholds of 5% and 20%.
- S9 PRIMARY plus the 3 DEV-overlapping reviews (descriptive).
- S10 (dropped before registration: ASReview 3.0.8's `Max` querier is already stable, so a stable-tie variant would be identical.)
- S11 Screen at its UI retraining cadence, if different (Section 4).
- S12 Determinism: the 10 reviews in `h2h/sets/determinism_sample.json`, seeds 101 and 606, all three runs (Screen,
  u4, u3) repeated on `desktop-iljmsi3`; full orders compared with `==` by `h2h/determinism.py`; any difference is
  reported by tool, review and seed.

### 7.5 Commands (fixed now)

Runs (on `baseimage`, through the driver `h2h/run_heldout.py`, which runs one seed per process and applies the
6-hour limit and the retry rule of Section 8), for the set `sets/primary_plus_devoverlap.txt`:
`run_heldout.py --tool asreview --ai elas_u4 --out R/asreview/elas_u4`, the same with `--ai elas_u3`
(`R/asreview/elas_u3`), and `run_heldout.py --tool screen --config <frozen> --js-args "<FREEZE.md args>" --out R/screen`.
S11: the Screen command with `--retrain-every K` added to `--js-args`, output `R/screen_ui`. S12: the three commands
restricted with `--reviews <determinism sample>` on `desktop-iljmsi3`, output `R_iljmsi3/...`, then
`determinism.py --a R --b R_iljmsi3 --out R/determinism.json`.

Analyses: `analyze.py --screen R/screen --u4 R/asreview/elas_u4 --u3 R/asreview/elas_u3 --screen-config <frozen>
--screen-rank-sha256 <frozen> [--screen-emb-onnx-sha256 <frozen>]` with
- primary + S1-S6: `--set sets/primary.txt --clusters sets/clusters.json`;
- S7: `--set sets/official_test16.txt --clusters sets/clusters.json`;
- S8: `--set sets/primary.txt --clusters sets/clusters_5pct.json` and `... clusters_20pct.json`;
- S9: `--set sets/primary_plus_devoverlap.txt --clusters sets/clusters.json --cluster-key clusters_primary_plus_devoverlap`;
- S11: primary command with `--screen R/screen_ui`.

## 8. Conduct and integrity

- DEV-only tuning; the candidate is frozen (`FREEZE.md`) before any held-out run; the held-out run is made once.
- **Failures.** A run "fails" if the process exits non-zero, produces an order rejected by `metrics_from_order`, or
  exceeds 6 hours wall time for one (review, seed). A failed (tool, review, seed) is retried once from scratch with
  the same inputs; every attempt is logged. If it fails twice it is recorded as failed (`"failed": true,
  "attempts": 2`) and scored with the worst possible values for that tool (WSS@95 = -0.05, recall 0,
  `prop_last` = 1). **No review is ever excluded for a failure.** This applies equally to both tools and to u3.
- **Minimum success.** Worst-case scoring alone could let failures manufacture agreement (if both tools failed
  everywhere, every difference would be 0). Confirmatory conclusions (H1, H2) are therefore drawn only if, within the
  analysed set, each of Screen, u4 and u3 completed at least 95% of its (review, seed) runs; otherwise H1/H2 are
  reported as **not assessable** and all estimates are descriptive.
- **Provenance checks at analysis.** Every result file must carry the registered dataset digest and start from the
  registered starting records; ASReview files must record version 3.0.8 and the registered model configuration;
  Screen files must record the frozen `rank-core.js` hash (and, if used, the frozen embedding-weight hash). Any
  mismatch stops the analysis.
- All per-seed screening orders, environments, attempt logs and the analysis output are archived with the results.
- The result is reported whichever way it comes out, as n of N clusters and reviews plus the tests above. A
  non-significant superiority test is not reported as "beats"; a failed H1 is reported as such.

## 9. Static versus dynamic disclosure

| Item | Static (fixed here) | Dynamic (produced by runs) |
|---|---|---|
| Sets, clusters, seeds, starting records, margin, tests, commands, ASReview version/settings | yes | |
| Screen candidate identity | fixed in `FREEZE.md` before held-out runs | |
| Screening orders, metrics, CIs, p-values | | yes |

## Amendment 1 (2026-10-20; made before any held-out run of either tool)

Source: an independent protocol review (`h2h/reviews/R1_protocol.md`) and a DEV-results review
(`h2h/reviews/R2_results.md`). No held-out data had been run or inspected by either tool when this amendment was written; the
registered commit is `24f04f363eaa542764fac9fb341b2b0ac1d31948`.

**A1.1 Failure scoring is now conservative for a non-inferiority claim.** Section 8 scored every failed
(tool, review, seed) run with the worst values. For a failed *comparator* run that moves the difference toward
Screen, which is the wrong direction for H1. From now: a failed Screen run keeps the worst values; a failed ASReview
run (u4 or u3) is scored with the best order possible from its starting records (every remaining relevant record
next; `analyze.py: best_case`). A comparator failure can therefore only make Screen look worse. The 95% success gate
for each tool is unchanged.

**A1.2 A review whose every seed failed is scored, never fatal.** The driver writes such a review with
`all_failed: true` and the identity fields only; the analysis skips run-provenance checks for it (there is no run)
and scores it as in A1.1. Previously the provenance check would have stopped the analysis after results existed.

**A1.3 Orders are validated in the driver, for both tools.** `run_heldout.py: accept_run` accepts a run only if its
order starts from the registered starting records and passes `core.metrics_from_order`; otherwise the attempt is a
failure and is retried once, then recorded as failed. Each attempt log records the reason.

**A1.4 The frozen settings are checked, not only names and hashes.** `analyze.py --screen-freeze-json` takes the
`cfg` and `emb` objects from `FREEZE.md`; every Screen result file's ranker settings (C, ratio, retraining cadence,
TF-IDF options) and every listed embedding-recipe field must equal them, or the analysis stops.

**A1.5 The freeze is enforced in code.** A held-out Screen run is refused unless `h2h/FREEZE.json` exists and its
`rank_core_sha256`, `config` and `js_args` equal the file and arguments being run (`run_heldout.py: check_freeze`).
Every result file records the driver's git commit and the sha256 of `FREEZE.json`. The git tag `h2h-prereg-v1`
(protocol header) still has to be created by the repository owner; until then the registered commit SHA above is the
reference.

**A1.6 What FREEZE.md must pin for an embedding candidate** (in addition to the protocol header): the allmeta commit;
sha256 of `rank-core.js`, `run_js.mjs`, `run_heldout.py`, `analyze.py`, `core.py`, `bench/extract.mjs`; the exact
`--js-args` including `--emb-dir` and `--emb-onnx-sha256`; the source model id and revision, the export command and
tool versions, sha256 of every model file (ONNX, tokenizer, config); the embedding recipe (text template, prefix,
max tokens, pooling, normalisation, dtype, device/backend, batch); the embedding script's sha256 and the
Transformers.js, onnxruntime and Node versions; the selection rule and fallback that chose the candidate. Held-out
embeddings are computed once, with that pipeline, before the Screen held-out run, and their sha256s are archived
with the results.

**Disclosures (no change to the analysis).**
- Margin (7.2): the "about 4% of u4's mean" figure uses in-sample numbers, and the statement that ASReview changed
  its default because of the 0.035 u4-u3 gap is our reading, not a documented ASReview decision. The margin itself is
  unchanged. In records: 0.02 WSS@95 is 2 extra records screened per 100.
- Unit (6): the brief asked for the review as the unit; the protocol uses clusters of overlapping reviews (each
  equally weighted), which is more conservative where reviews share records. S3 gives the review-level analysis.
- Ceiling: 40 of the 84 PRIMARY reviews have R < 20, where WSS@95 equals WSS@100 - 0.05 and differences shrink.
  S6 (R >= 20) is reported next to the primary result with equal prominence, together with each tool's absolute mean
  WSS@95 (a random order has expected WSS@95 of about 0).
- Seeds: the ASReview runs reseed NumPy per seed; Screen's SVM uses a fixed internal seed (1) and differs across
  seeds only through the starting records. Both tools share identical starting records on every seed.
- The DEV gain of the chosen candidate is optimistic (best of about 37 configurations on 18 reviews, where u4 is
  in-sample); it is not a prediction of the held-out difference.

## Amendment 2 (2026-10-24): an added comparator, ASReview ELAS u5. Written AFTER the primary result was known.

**Why and what it is.** ELAS u5 is ASReview's next model: defined on `asreview` main (PR #2597, 2026-08-25), not
released on PyPI (latest release 3.0.8). It is a TF-IDF (1-2 grams, sublinear, min_df 1, max_df 1.0) + squared-hinge
SVM (C = 0.024) + balanced (ratio 9.242) + Max querier model, optimised by its authors on the **training set of
SYNERGY+**. This amendment adds it as a comparator. It was written after the primary result (commit `1b82d61`) was
known; that is disclosed, and it is legitimate only because **nothing on Screen's side changes**: FREEZE.json
(sha256 `cdb5317d33a214c1413104ff13aa113145de3c26845755acff3ac96e3426a6e1`) is unchanged, and Screen's held-out
results are the frozen run already archived (`results/R/screen_merged`, per-review sha256s in
`results/merge_screen_merged.json`), reused as they are. No Screen run is repeated.

**Comparator, pinned.** ASReview main at commit `79d568212b2b0a78f9fd7be3c5117dfb890489f9`, installed from a git
checkout of that commit into its own environment (reported version `3.0.9.dev10+g79d568212`), configuration
`sets/comparator_configs_u5.json` (sha256 `6bf6f4ac…088`), refused otherwise by `run_asreview_u5.py`. The simulation
call is the registered one (`run_asreview_h2h.simulate_order`, imported unchanged). DEV parity: on Donners_2021,
Smid_2019 and Meijboom_2021 at seeds 101 and 202, the screening orders produced by `run_asreview_u5.py` are
identical to those of that build's own `asreview simulate --ai elas_u5 --prior-idx ... --seed ...` CLI (6 of 6;
`u5_parity.py`). Driver `run_heldout_u5.py` and analysis `analyze_u5.py` are new files that import the registered
`run_heldout.py` / `analyze.py` without editing them.

**Unchanged bar.** Same reviews, 10 seeds, 2 + 2 starting records (`priors/`), WSS@95 and the outcome code
(`core.py`), clusters (`sets/clusters.json`), cluster-weighted mean difference with its t interval, **margin 0.02**,
one-sided alpha 0.025, failure rules (a failed u5 run scored best-case, Amendment 1), the 95% success gate.

**Sets.** Because u5 was optimised on SYNERGY+'s training set, only reviews outside it are a fair held-out test:
- **Confirmatory:** `sets/official_test16.txt`, the 15 PRIMARY reviews in SYNERGY+'s test split
  (`synergy_dataset.splits.TEST_SPLIT`, identical (23 reviews) in both environments; the other 8 are DEV or excluded).
- **Descriptive only:** the other 69 PRIMARY reviews, where u5 is in-sample (this favours u5).

**Family A2 (confirmatory, separate from the primary family, which is not re-tested or adjusted):**
- **H1-u5:** Screen minus u5, cluster-weighted mean WSS@95 on the 15 test-split reviews, > -0.02.
- **H2-u5:** the same > 0, tested only if H1-u5 is accepted (fixed sequence; no further adjustment).
- Reported regardless: per-review counts, losses beyond the margin, and descriptively Screen - u5 on the 69
  in-sample reviews and on all 84, and u5 - u4 on both sets.
- Power is limited (15 clusters): with the SD seen against u4 on this subset, a true difference near +0.01 would
  often fail H2; a failed H2 is reported as such, never as "beats".

**Commands (fixed now).** In the u5 environment on baseimage:
`run_heldout_u5.py --set sets/primary.txt --data-dir <data> --out R/asreview/elas_u5` (all 84 PRIMARY reviews, so the
descriptive comparison exists; sharding with `--reviews` and merging with `results/ho_merge.py` as in the primary
run). Then, once: `analyze_u5.py --screen results/R/screen_merged --u5 R/asreview/elas_u5 --u4
results/R/asreview/elas_u4_merged --screen-freeze-json FREEZE.json --data-dir <data> --out A/u5.json`.
The u5 run is done once and analysed once, and reported whichever way it comes out.
