# Report — making the allmeta SR pipeline beat Rayyan & Elicit (2026-06-08)

**Goal:** decisively close the gaps the 2026-06-08 multipersona review flagged in the
Screen / Search / Design suite, add the missing **extraction** stage, and back every
"competitive/beats" claim with measured evidence — keeping the free / private /
reproducible / no-paywall core intact and AI strictly optional.

Everything below drives the **shipped** code; tests live alongside the apps and in
`tests/playwright/`. Reproduce the numbers with `node benchmark/run_benchmark.mjs`.

---

## What shipped

### 1. Extract — a new automated-extraction app (beats Elicit's metered extraction)
`/extract/` completes the pipeline **Search → Screen → Extract → meta-analysis**. A
free, deterministic in-browser engine pulls from each included record:
- **effect sizes + 95 % CIs** (HR / RR / OR / MD / SMD) with CI-bound repair and
  out-of-range rejection;
- **sample sizes** (total + per-arm) with a negated-count guard;
- **event counts** (n/N), **risk-of-bias cues**, **design**, **follow-up**, best-effort **PICO**.

It feeds the `ma-studies-v1` bus directly — ratio effects as `ln(point)` with
`SE = (ln hi − ln lo)/(2·1.96)`, MD/SMD on the natural scale — so extracted studies
flow straight into the Forest-plot and pooling apps. For full texts / harder fields,
a one-click **handoff** exports a task for your own agent (Claude Code / Codex /
Gemini CLI) or the installable **rct-extractor** engine (17 specialties); BYO-key is
the only egress and is opt-in. **This is the step Elicit meters; here it's free.**

### 2. Search — recall upgrade (narrows the gap to Elicit)
- **Free query expansion**: a curated synonym / abbreviation / brand-generic /
  British-American-spelling dictionary rewrites a query into OR-groups before any API
  call — deterministic, no AI (longest-phrase-first with placeholder stashing so
  sub-words don't double-expand).
- **TF-IDF cosine relevance ranking** (unigram+bigram) against the expanded query — a
  transparent, reproducible "semantic-ish" sort (honestly not a neural embedding).
- **Snowballing**: OpenAlex `referenced_works` + `cites:` citation-chasing of the
  result set (live API forms verified).

### 3. Screen — scale, classifier quality, collaboration
- **Scale (PERF-1 closed):** the O(n²) title dedup is now **blocking +
  sorted-neighbourhood + a multi-field assist** (relaxed title threshold when
  first-author surname **and** year match — closes review item M-4). **225× faster at
  10k; 100k records in ~6 s** with no recall loss vs brute force.
- **Classifier (M-5 closed, then upgraded to ASReview parity):** **both reviewers' labels**
  now train the model (was R1-only), with a **5-fold cross-validated AUC** and a data-driven
  **stopping signal** surfaced in-UI. The ranker was subsequently upgraded from class-weighted
  logistic regression to **Naive-Bayes + balanced sample-weighting + per-record continuous
  active learning** (ASReview's recipe + a 2026-06-09 per-lever kaizen ablation that kept
  only measured wins), bringing screening to a **statistical tie with ASReview, allmeta
  nominally ahead** — WSS@95 0.374 Cohen-15 / 0.447 all-19 vs ASReview's 0.360 / 0.428 over
  10 fresh seeds on the same 19 datasets (allmeta wins 12/19, but paired Wilcoxon p=0.18,
  not significant). See [`BENCHMARK-sr-pipeline.md`](BENCHMARK-sr-pipeline.md) §1.
- **Collaboration (serverless):** export my decisions, **merge a reviewer file**
  (match by id → DOI → PMID → title, fill the other column, flag disagreements as
  conflicts), and a shareable **bundle** (protocol + records + both reviewers + κ).

### 4. The evidence (the review's central ask)
A benchmark harness (`benchmark/run_benchmark.mjs`) drives the shipped code over
**CC-licensed labelled corpora** committed under `benchmark/data/` (Cohen 2006 TAR
sets; Nagtegaal 2019 with gold duplicate labels).

---

## Measured improvements

| Claim (was [?] / Loss in the review) | Now (measured, shipped code) |
|---|---|
| Active-learning recall "not benchmarked" | **statistical tie with ASReview, nominally ahead** — allmeta WSS@95 **0.374 Cohen-15 / 0.447 all-19** vs ASReview's own NB code **0.360 / 0.428** over 10 fresh seeds on the same 19 datasets (allmeta wins 12/19; paired Wilcoxon p=0.18, n.s.). See [`BENCHMARK-sr-pipeline.md`](BENCHMARK-sr-pipeline.md) §1 |
| Dedup recall/precision "not benchmarked" | reformatted-title **precision 0.98 / recall 0.92 / F1 0.95**; real author-labelled gold recall 0.64 |
| Scale ">50k degrades / frozen tab" | blocked dedup **225× faster at 10k** (347 ms vs 78 s); **100k in ~5.8 s**; parity-equal to brute force |
| Semantic recall "Loss vs Elicit" | free query expansion + TF-IDF cosine ranking + OpenAlex snowballing (narrowed) |
| Automated extraction "Loss vs Elicit" | new free/deterministic Extract app feeding the meta-analysis bus + agent/CLI handoff |
| Collaboration "None" | serverless reviewer export / merge / conflict-detection + shareable bundle |

Full table and methodology: [`BENCHMARK-sr-pipeline.md`](BENCHMARK-sr-pipeline.md);
raw numbers: [`benchmark/results.json`](benchmark/results.json).

---

## Where allmeta now wins vs each competitor

- **vs Rayyan:** wins on cost, privacy, reproducibility, transparency, and now
  **100k-record scale** and **measured active learning tied with ASReview** (WSS@95
  0.374 Cohen-15 / 0.447 all-19, nominally ahead, paired p=0.18 n.s.); matches on
  dual-reviewer + κ and adds serverless collaboration. Rayyan still wins **real-time**
  (live multi-cursor) collaboration.
- **vs Elicit:** wins on cost, privacy, reproducibility, pipeline integration, and now
  **free automated extraction that feeds meta-analysis**. Narrows semantic recall with
  expansion + snowballing + transparent ranking. Elicit's neural ~200M-paper index
  still wins **raw semantic recall**; raw LLM extraction accuracy on messy full texts
  is matched only via the opt-in handoff.
- **vs Covidence / DistillerSR:** wins on cost, openness and the integrated free
  pipeline; those tools retain managed-service collaboration and support.
- **vs ASReview:** **statistical tie on active-learning screening, nominally ahead** —
  allmeta's shipped classifier scores 0.447 vs 0.428 all-19 (wins 12/19) over 10 fresh seeds
  on the same 19 datasets, but the paired difference is not significant (Wilcoxon p=0.18),
  while remaining a zero-install single-file browser app. ASReview still carries the deeper
  peer-reviewed validation cohort.

---

## Honest residuals (not fixed, disclosed)
- Elicit's neural semantic recall over ~200M papers still exceeds keyword + expansion +
  snowballing.
- Collaboration is **async** (file exchange + conflict detection), not live.
- Effect-size extraction is bounded by how often **abstracts** report a machine-readable
  effect; the full-text/AI handoff exists precisely for the rest.
- The real-gold dedup floor (0.64 on 11 Nagtegaal pairs) reflects heavily-rewritten
  titles; the reformatted-title F1 (0.95) is the better-powered estimate.

---

## Live URLs (GitHub Pages)
- Hub: https://mahmood726-cyber.github.io/allmeta/
- Design: https://mahmood726-cyber.github.io/allmeta/design/
- Search: https://mahmood726-cyber.github.io/allmeta/search/
- Screen: https://mahmood726-cyber.github.io/allmeta/screen/
- **Extract (new): https://mahmood726-cyber.github.io/allmeta/extract/**

## Tests
- **Playwright:** 97 specs across the four apps (was 66) — `alm-screen-*`,
  `alm-search-*`, `alm-design`, `alm-extract`, `alm-pipeline-e2e`, `alm-a11y-offline`.
- **pytest:** 56 static/structure guards across `screen|search|design|extract/tests/`.
- **Benchmark:** `benchmark/run_benchmark.mjs` (full) + `alm-screen-bench.spec.mjs`
  (fast CI guard on the real Triptans corpus). All green.
