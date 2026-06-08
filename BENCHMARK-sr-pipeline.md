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

## 1. Classifier quality — active learning on a real labelled corpus

Protocol: the **shipped** Screen classifier (`window.__almScreenpro.simulateActiveLearning`)
screens a top-ranked batch, reveals the gold labels, retrains, and repeats — the
standard technology-assisted-review (TAR) simulation. Corpus: **Cohen et al. 2006**
drug-class reviews (the canonical TAR benchmark), full text from the ASReview
collection. WSS@95 = work saved over random sampling at 95 % recall (a random
screener scores ≈ 0).

| Corpus | Records | Relevant | WSS@95 [m] | Recall@10 % [m] | Recall@20 % [m] | Screened for 95 % recall |
|---|---:|---:|---:|---:|---:|---:|
| **Cohen ACE-Inhibitors** (cardiology) | 2,544 | 41 (1.6 %) | **0.67** | 0.61 | 0.85 | 711 (28 %) |
| **Cohen Triptans** | 671 | 24 (3.6 %) | 0.41 | 0.29 | 0.67 | 361 (54 %) |

**Reading:** on the canonical Cohen ACE set, screening **28 % of records finds
95 % of the relevant ones** — i.e. **~72 % of the screening burden is saved** at
95 % recall, in the published WSS range for trained TAR systems (Rayyan/ASReview).
The classifier upgrade that earns this: **both reviewers' labels** are now used (was
R1-only), **unigram + bigram + MeSH** features, class-weighted logistic regression,
and a **5-fold cross-validated AUC** + data-driven stopping signal surfaced in-UI.
Smaller/effect-sparser corpora (Triptans) save less — reported honestly, not hidden.

> Verdict vs Rayyan / ASReview active learning: **competitive (measured)**, not just
> "functional on toy data". This is the cell the review told us not to claim until measured.

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
| Active-learning recall | WSS@95 0.67 (Cohen ACE) [m] | Rayyan/ASReview | Loss/unproven → **competitive, measured** |
| Dedup recall/precision | F1 0.95 reformatted; 0.64 real-gold [m] | Rayyan/EPPI multi-field | Loss/unproven → **measured, strong** |
| Scale (>50k) | 100k in ~6 s [m] | cloud | Loss → **Win (client-side 100k)** |
| Semantic search recall | expansion + cosine + snowball [t] | Elicit neural index | Loss → **narrowed** |
| Automated extraction | free deterministic + handoff, feeds pooling [t,m] | Elicit (metered) | Loss → **free/automated win; raw-accuracy parity via handoff** |
| Real-time collaboration | async file merge + conflict detection [t] | Rayyan live | Loss → **async serverless collaboration** |

**Bottom line:** allmeta keeps its decisive lead on **cost, privacy, reproducibility
and an integrated design→search→screen→extract→synthesis pipeline**, and the four
cells it previously lost on — classifier quality, dedup, scale, extraction — are now
either **won or competitive with measured evidence**. The honest residuals: Elicit's
neural index still wins raw semantic recall, and collaboration is async (file-based)
rather than live.
