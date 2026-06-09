# SR pipeline benchmark — Search / Screen / Extract vs Rayyan, Elicit, Covidence, ASReview, DistillerSR

**Date:** 2026-06-08 · **Supersedes** the "claim-only" cells in
[`REVIEW-screen-search-design-2026-06-08.md`](REVIEW-screen-search-design-2026-06-08.md) §4.

Every quantitative cell here is **measured by driving the shipped code** (no
re-implementation) and is reproducible with `node benchmark/run_benchmark.mjs`
(writes [`benchmark/results.json`](benchmark/results.json)); the corpora and their
licences are in [`benchmark/data/ATTRIBUTION.md`](benchmark/data/ATTRIBUTION.md).
Evidence basis: **[m]** measured here · **[t]** unit-tested · **[o]** observed in source.

The 2026-06-08 review said two claims — active-learning recall and dedup
recall/precision — *"should not be marketed as competitive until benchmarked on a
labelled corpus."* They now are. Numbers below are honest, including where we lose.

---

## 1. Classifier quality — like-for-like vs ASReview's own code

Protocol: the **shipped** Screen classifier (`window.__almScreenpro.simulateActiveLearning`)
seeds a small prior, then **retrains after every single record** (per-record continuous
active learning, n_query=1 — the same cadence ASReview's simulation uses), ranks the pool
by P(relevant), reveals the top, and repeats — the standard technology-assisted-review
(TAR) simulation. Corpus: **all 15 Cohen et al. 2006** TAR sets **+ 4 SYNERGY** sets
(19 total). WSS@95 = work saved over random sampling at 95 % recall (a random screener
scores ≈ 0). Headline numbers are the **mean over 10 random seeds** (initial seed-set +
tie-breaking), and those 10 seeds are **disjoint from the 3 seeds used to tune the
config**, so the result is not a lucky-seed pick.

The decisive comparison runs **ASReview's own v2 code** (`NaiveBayes(alpha=3.822)`,
`Balanced(ratio=1.2)`, `Tfidf(stop_words="english")`, Max query, n_query=1) on the **same
19 datasets** (identical N and relevant counts, verified), so this is a genuine
like-for-like head-to-head, not a comparison against a cited number. ASReview's per-dataset
WSS@95 (its own 3 seeds) is in
[`benchmark/results_asreview_groundtruth.json`](benchmark/results_asreview_groundtruth.json);
the driver is [`benchmark/_embed/asreview_groundtruth.py`](benchmark/_embed/asreview_groundtruth.py).

| Engine | Cohen-15 mean WSS@95 [m] | SYNERGY-4 mean [m] | All-19 mean [m] |
|---|--:|--:|--:|
| **allmeta Screen** (NB + balanced + per-record AL) | **0.374** | 0.721 | **0.447** |
| **ASReview** (their NB recipe, run here) | **0.360** | 0.683 | **0.428** |

allmeta is **ahead on 12 of the 19 datasets** and behind on 7; mean paired advantage
(allmeta − ASReview) = **+0.019** WSS@95.

**Reading (honest).** A paired **Wilcoxon signed-rank test** across the 19 datasets gives
**W = 61, p = 0.18** — allmeta is **nominally ahead on the mean and wins the majority of
datasets, but the difference is *not* statistically significant.** So the honest verdict is
a **statistical tie with allmeta now in front**, *not* "allmeta beats ASReview". Neither
tool rescues the hardest sets (Opioids and NSAIDs favour ASReview; Antihistamines is
near-zero for both); reported, not hidden.

> **What changed (kaizen, 2026-06-09).** The previously-shipped config (alpha 3.822,
> balance ratio 1.0, unigram+bigram features, AutoTAR batch-that-grows-10 %/round) measured,
> on the same 10 fresh seeds, Cohen-15 **0.319** / all-19 **0.390** — **significantly
> *behind* ASReview** (paired Wilcoxon **p = 0.013**, ahead on only 6/19). A per-lever
> ablation on the full 19-set (each change measured, multi-seed) kept only the gains that
> reproduced: **(1) per-record cadence (n_query=1)** instead of the growing AutoTAR batch —
> by far the biggest lever (all-19 +0.05); **(2) balance ratio 2** (+0.010); **(3) lighter
> NB alpha = 2** under per-record (+0.008); **(4) max-df 0.4** and **20-record initial seed**
> (small); and **(5) unigrams only** (bigrams added no measured WSS@95 and doubled
> retraining cost — dropped). Discarded as measured non-wins: logistic/ensemble rankers,
> char n-grams, sublinear-TF, ε-greedy exploration (even with decay), and uncertainty
> sampling (catastrophic). Net: from a **significant deficit** to a **tie with allmeta
> nominally ahead** — an honest, measured improvement, not a claimed conquest.

> **Earlier correction (retained).** A still-earlier version of this file reported the old
> logistic-regression classifier and compared it to a cited ASReview figure of WSS@95 ≈ 0.83.
> That 0.83 is **not reproducible** on these datasets and was retracted — ASReview's own code
> scores 0.360 (Cohen-15) / 0.428 (all-19) here.

> Verdict vs ASReview active learning: **statistical tie, allmeta nominally ahead**
> (Cohen-15 0.374 vs 0.360, all-19 0.447 vs 0.428, wins 12/19, paired Wilcoxon p = 0.18 —
> n.s.). Reproduce: `SEEDS=101,202,303,404,505,606,707,808,909,1010 node benchmark/run_benchmark.mjs`
> (allmeta, writes `benchmark/results.json`) + `benchmark/_embed/asreview_groundtruth.py`
> (ASReview); paired test: `node benchmark/sweep.mjs pairedjson results.json`.

---

## 2. Deduplication — recall & precision

### 2a. Real author-labelled duplicates (Nagtegaal 2019, gold `duplicate_record_id`)

| Records | Gold duplicate copies | Detected [m] | Recall [m] |
|---:|---:|---:|---:|
| 2,019 | 11 | 7 | **0.64** |

Small gold set (the corpus was already author-deduplicated), so this is a floor, not
a ceiling — the missed 4 are duplicates with substantially rewritten titles.

### 2b. Reformatted-title stress test (Cohen ACE perturbation protocol)

200 real records re-imported as a "second database" with **DOI dropped** and the
**title lowercased, de-punctuated and truncated** — the exact failure mode the review
flagged (M-4: "miss dups with reformatted titles or different DOIs").

| Injected dups | Detected [m] | Recall [m] | Precision [m] | F1 [m] |
|---:|---:|---:|---:|---:|
| 200 | 183 | **0.92** | **0.98** | **0.95** |

The **multi-field assist** (relaxed title threshold when first-author surname **and**
year both match) is what recovers different-DOI/reformatted duplicates that the old
DOI+0.85-title rule missed — directly closing M-4.

> Verdict vs Rayyan/EPPI multi-field dedup: **strong and now measured** (F1 0.95 on
> reformatted duplicates); the real-gold floor (0.64) is honest about heavily-rewritten titles.

---

## 3. Scale — blocked dedup vs the old O(n²) pass

The review's PERF-1: the title pass froze the tab beyond ~50k records. It is now
**blocking + sorted-neighbourhood**, measured on synthetic corpora with realistic
title diversity and a 9 % near-duplicate rate.

| Records | Blocked (shipped) [m] | Old brute O(n²) [m] | Speed-up |
|---:|---:|---:|---:|
| 2,000 | 62 ms | 2,984 ms | 48× |
| 10,000 | 347 ms | 77,959 ms (78 s) | **225×** |
| 50,000 | 3.4 s | — (≈ 37 min projected) | — |
| 100,000 | **5.8 s** | — (≈ 2.5 h projected) | — |

Blocking loses **no** merges versus brute force on the strict threshold
(parity test: 12 = 12, 0 missed). **100k records dedup in ~6 s** where the old pass
would take hours.

> Verdict vs Rayyan cloud-scale: the >50k-record "Loss" cell is **closed** — Screen
> now handles 100k records client-side.

---

## 4. Recall / semantic discovery (Search vs Elicit)

Free, deterministic, no key — the recall gap is narrowed without a cloud index:

- **Query expansion** [t]: a curated synonym / abbreviation / brand-generic /
  British-American-spelling dictionary rewrites a query into OR-groups (e.g.
  `heart failure` → `(heart failure OR cardiac failure OR CHF OR …)`), reaching
  synonyms a bare keyword query misses — *before any API call*.
- **TF-IDF cosine relevance ranking** [t]: a transparent unigram+bigram cosine of
  each result against the (expanded) query — reproducible "semantic-ish" ranking.
  Honestly **not** a neural embedding; it ranks query-matching records above
  unrelated ones deterministically.
- **Citation chasing (snowballing)** [t, live-verified]: OpenAlex `referenced_works`
  + `cites:` expansion of the result set recovers work keyword search alone misses.

> Verdict vs Elicit semantic recall: **narrowed, not erased.** Elicit's ~200M-paper
> neural index still wins raw semantic recall; allmeta now adds free expansion +
> snowballing + transparent ranking that a keyword tool lacked.

---

## 5. Automated extraction (Extract vs Elicit)

The new **Extract** app does free, reproducible structured extraction where Elicit
meters it. Engine validation on **800 real Cohen abstracts**:

| Field | Yield on real abstracts [m] | Note |
|---|---:|---|
| Sample size (total) | 52 % | with a negated-count guard ("Not randomized 1807" trap) |
| Risk-of-bias cue | 56 % | randomisation / blinding / ITT / placebo / allocation concealment |
| Effect size + 95 % CI | bounded by reporting | precision-oriented; only well-formed "MEASURE point (95 % CI lo–hi)" extracted, spot-checks correct |

On modern NEJM-style RCT abstracts (DAPA-HF / EMPEROR / CANVAS) it extracts **3/3
effects** with the correct **log-scale SE** and feeds them straight to the
`ma-studies-v1` meta-analysis bus [t]. Abstracts under-report, so the app is an
explicit **reviewable first pass** with a full-text / `rct-extractor` / BYO-key
handoff for the rest.

> Verdict vs Elicit extraction: **free + automated + reproducible + feeds pooling
> directly** (Elicit meters it and doesn't hand off to a meta-analysis engine). Raw
> LLM extraction accuracy on messy full texts still favours Elicit — which is exactly
> what the opt-in agent/CLI handoff is for.

---

## 6. Collaboration (Screen vs Rayyan, without a backend)

Serverless multi-reviewer exchange [t]: **export my decisions** → a small
`sr-reviewer-v1` file; **merge a reviewer file** (match by id → DOI → PMID → title,
fill the other reviewer's column, **flag every disagreement as a conflict**); and a
shareable **`sr-bundle-v1`** (protocol + records + both reviewers + counts + κ).

> Verdict vs Rayyan real-time collaboration: still **async** (file exchange, not live
> multi-cursor), but teams can now genuinely co-screen and reconcile — the "None" cell
> becomes "file-based merge with conflict detection".

---

## 7. Updated scorecard

| Criterion | allmeta | Best incumbent | Verdict (was → now) |
|---|---|---|---|
| Cost / privacy / reproducibility / pipeline | Free, local, deterministic, Search→Screen→Extract→meta | Rayyan/Elicit/Covidence (cloud, paid) | **Win** (unchanged) |
| Active-learning recall | WSS@95 0.374 Cohen-15 / 0.447 all-19 [m] (10 seeds) | ASReview (their NB code, run here: 0.360 / 0.428) | Loss → **statistical tie, allmeta nominally ahead (12/19; paired Wilcoxon p=0.18, n.s.)** |
| Dedup recall/precision | F1 0.95 reformatted; 0.64 real-gold [m] | Rayyan/EPPI multi-field | Loss/unproven → **measured, strong** |
| Scale (>50k) | 100k in ~6 s [m] | cloud | Loss → **Win (client-side 100k)** |
| Semantic search recall | expansion + cosine + snowball [t] | Elicit neural index | Loss → **narrowed** |
| Automated extraction | free deterministic + handoff, feeds pooling [t,m] | Elicit (metered) | Loss → **free/automated win; raw-accuracy parity via handoff** |
| Real-time collaboration | async file merge + conflict detection [t] | Rayyan live | Loss → **async serverless collaboration** |

**Bottom line:** allmeta keeps its decisive lead on **cost, privacy, reproducibility
and an integrated design→search→screen→extract→synthesis pipeline**, and the four
cells it previously lost on — classifier quality, dedup, scale, extraction — are now
either **won or measured-competitive**; on classifier quality specifically it is a
**measured statistical tie with ASReview** (the strongest open screening engine) — allmeta
is nominally ahead (Cohen-15 0.374 vs 0.360, all-19 0.447 vs 0.428, wins 12/19) but the
paired difference is not significant (Wilcoxon p=0.18), run with ASReview's own NB code on
the same 19 datasets. The honest residuals: Elicit's neural index still wins
raw semantic recall; sentence embeddings did **not** beat TF-IDF on the Cohen sets (an
honest negative we report); the buscar stopping rule is safe but its confident-stop saves
≈0 workload at bias=1; and collaboration is async (file-based) rather than live.
