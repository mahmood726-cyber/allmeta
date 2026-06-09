# allmeta vs ASReview — active-learning screening head-to-head (WSS@95)

**Status (updated 2026-06-09 kaizen): statistical tie, allmeta nominally ahead.**
After a per-lever ablation on the full 19-set that kept only the measured wins
(per-record cadence `n_query=1` — now the **shipped default** — plus balance ratio 2,
NB alpha 2, max-df 0.4, unigram features), the shipped Screen classifier scores
**Cohen-15 0.374 / all-19 0.447** WSS@95, vs ASReview's **0.360 / 0.428**, over **10
random seeds disjoint from the 3 used to tune the config**. allmeta wins **12 of 19**
datasets (mean paired Δ +0.019), but a paired **Wilcoxon signed-rank test gives
p = 0.18 — the lead is NOT statistically significant.** So this is an **honest
statistical tie with allmeta in front**, not "allmeta beats ASReview". A **second
lever pass (2026-06-09, "Pass 2" below)** tried six more literature techniques (linear
SVM, ComplementNB, Rocchio, χ² feature selection, NB+SVM blend, AutoTAR-faithful LR) to
break the tie; **none beat the shipped per-record NB**, so the config is unchanged and
the tie stands.

> ### Correction: the "~0.83" reference was wrong
> The previous version of this file compared allmeta against a cited ASReview
> figure of "**~0.83**". **That number is not reproducible and is retracted here.**
> Running ASReview's *own code* (`NaiveBayes(alpha=3.822)`, `Balanced(ratio=1.2)`,
> `Tfidf(stop_words="english")`, `n_query=1`) on these 19 datasets gives a **Cohen-15 mean
> WSS@95 of 0.360** and an **all-19 mean of 0.428** — not 0.83. Per dataset ASReview
> ranges from **−0.021** (Antihistamines — it fails there too) to **0.866** (Bos).
> The real target was never 0.83; it was ~0.43, and allmeta now meets it. We cite
> only numbers we reproduced from source.

## Headline (10 fresh seeds, allmeta; 3 seeds, ASReview; measured here)

| Metric | allmeta **pre-kaizen** `[m]` | allmeta **shipped (2026-06-09)** `[m]` | ASReview (their code) `[m]` |
|---|--:|--:|--:|
| **Cohen-15 mean WSS@95** | 0.319 | **0.374** | **0.360** |
| **SYNERGY-4 mean** | — | **0.721** | 0.683 |
| **All-19 mean** | 0.390 | **0.447** | **0.428** |
| **Wins (of 19) vs ASReview** | 6/19 | **12/19** | — |
| **Paired Wilcoxon p** | 0.013 (behind) | **0.18 (n.s., ahead)** | — |

`[m]` = measured in this repo. **Both tools are measured under the same continuous
per-record (`n_query=1`) protocol** — and per-record is now allmeta's shipped default
(the earlier AutoTAR growing-batch default, which scored ~0.06 lower, was replaced in
the 2026-06-09 kaizen precisely because per-record measured best). "pre-kaizen" =
the previously-shipped config (alpha 3.822, ratio 1.0, unigram+bigram, AutoTAR cadence)
measured on the same 10 fresh seeds. Reproduce:
`SEEDS=101,202,303,404,505,606,707,808,909,1010 node benchmark/run_benchmark.mjs`;
paired test `node benchmark/sweep.mjs pairedjson results.json`.

> **Note on the ablation below.** The step-by-step ablation table that follows is the
> *historical* exploration (3-seed, earlier component order) that first established
> per-record cadence and the NB recipe as the key levers. Its intermediate "after"
> numbers (Cohen-15 0.369 / all-19 0.432) predate the final 2026-06-09 kaizen, which
> added balance-ratio 2 + alpha 2 + max-df 0.4 + unigram-only and re-validated on 10
> fresh seeds → the **0.374 / 0.447** headline above supersedes them.

## How this was measured (truth-first)

- **allmeta — headless, verbatim shipped code.** No browser, no server. The
  classifier functions (`mlBuildVocab`, `mlVector`, `mlSampleWeights`, `mlFit`,
  `mlPredict`, `simulateActiveLearning`, `mlBuscarP`, …) are extracted **verbatim**
  from the shipped `screen/index.html` by brace-matching and run in a Node `vm`.
  The exact shipped code path runs — we only supply a CSV loader and a seed loop
  instead of a reviewer clicking i/e. `node benchmark/run_headless.mjs`.
- **ASReview — their own code.** `asreview` v2.2 + `asreview-insights`, run via
  `benchmark/_embed/asreview_groundtruth.py`, which builds ASReview's `ELAS u3`
  pipeline directly from `asreview.models` (NaiveBayes α=3.822, Balanced ratio=1.2,
  Max querier, Tfidf+english-stopwords, `n_query=1`) and their `Simulate` loop.
  This both (a) gives the honest comparison number and (b) **cross-validates our
  harness** — allmeta's NB recipe (Cohen-15 0.369) lands on ASReview's NB
  (0.360), and the per-dataset agreement is close (e.g. Antihistamines is negative
  for *both* — it is a genuinely hard set, not an allmeta bug).
- **Metric.** WSS@95 = `0.95 − (records screened to reach 95% recall)/N`
  (Cohen/Kusa convention; 0 = no better than random screening order). Identical
  formula on both sides.
- **Protocol.** Seed = a small prior (allmeta: 10 random forced ≥1/≥1; ASReview:
  1 included + 1 excluded), then **continuous active learning — retrain after every
  record (`n_query=1`)**, rank the pool by P(relevant) (certainty/`max` query),
  reveal the top, repeat. Multi-seed for error bars.
- **Datasets.** All 15 Cohen 2006 TAR datasets + 4 SYNERGY datasets
  (Appenzeller-Herzog 2020, Kwok 2020, Wolters 2018, Bos 2018), CC-licensed; see
  `data/corpora/ATTRIBUTION.md`.

## What was imported from the TAR / ASReview literature (and verified by ablation)

Each technique was implemented in allmeta's shipped code and its contribution
measured independently. Sources:

- **Naive-Bayes ranker** — sklearn `MultinomialNB` semantics on the tf-idf matrix
  (Laplace α=3.822, class log-prior, log p(t|inc)−log p(t|exc) per term). This is
  ASReview's strong default classifier (van de Schoot et al., *Nat. Mach. Intell.*
  3:125–133, 2021; Ferdinands et al. 2020/2022 find TF-IDF+NB among the best simple
  combos). **Drives the SYNERGY / low-prevalence gain (+0.17 SYNERGY).**
- **Balanced sample-weighting** — ASReview's `balanced` balancer (successor to v1
  dynamic resampling): positives weight 1, negatives `nPos/(ratio·nNeg)`. Port of
  `asreview.models.balancers.Balanced`. Shared by every classifier.
- **Continuous (per-record) active learning** — retrain after each record, not after
  50–200 (CAL/AutoTAR: Cormack & Grossman, SIGIR 2014; *Autonomy & Reliability of
  CAL*, 2015; ASReview `n_query=1`). NB makes this affordable; **it is the Cohen
  lever (+0.055 Cohen, B→C below).** A growing-batch AutoTAR option is also shipped.
- **Certainty / `max` query strategy** — rank by P(relevant), screen the top. Already
  allmeta's strategy; relevance feedback dominates uncertainty sampling for total
  recall (Cormack & Grossman) — kept, not switched.
- **buscar target-recall stopping rule** — Callaghan & Müller-Hansen, *Syst. Rev.*
  9:273 (2020). Faithful port of `buscarR::calculate_h0` (bias=1, exact
  hypergeometric urn). New principled stopping signal; see below.
- **Sublinear tf-idf** — tested (Salton & Buckley 1988); it *hurt* Cohen (−0.05) so
  it is **not** the default. Honest negative result.

## Ablation — what each component contributed (1 seed, all 19)

| Step | config | Cohen-15 | SYNERGY-4 | All-19 | Δ vs prev |
|---|---|--:|--:|--:|---|
| **A** baseline | coarse batch, logistic reg, class-balance | 0.291 | 0.489 | 0.333 | — |
| **B** +NB | coarse batch, **NB**, balanced 1.2 | 0.292 | **0.657** | 0.369 | NB → +0.17 SYNERGY |
| **C** +continuous | **per-record**, NB, balanced 1.2 | **0.347** | 0.685 | 0.418 | cadence → +0.055 Cohen |
| **D** balance=1.0 | per-record, NB, balanced 1.0 | 0.359 | 0.666 | 0.423 | balance tuning, ~flat |
| **E** ensemble | per-record, NB+LR, balanced 1.2 | 0.342 | 0.685 | 0.414 | LR ensemble hurts NB |
| **G** AutoTAR-NB | growing batch, NB, balanced 1.2 | 0.303 | 0.664 | 0.379 | AutoTAR < per-record |
| **H** AutoTAR-LR | growing batch, LR | 0.300 | 0.495 | 0.341 | cadence barely helps LR |

**Reading the ablation.** (i) NB is the single biggest lever on low-prevalence sets
(SYNERGY 0.49→0.66). (ii) Continuous cadence is the Cohen lever (B→C, +0.055) — and
crucially, comparing **H vs A** shows cadence *alone* barely moves logistic
regression (+0.009): the win comes from NB being **cheap enough to retrain every
record**. The two levers are inseparable, exactly as hypothesised. (iii) Pure NB
beats the LR+NB ensemble here, so the shipped default is NB. (iv) Per-record beats
AutoTAR's growing batch, which beats coarse batching — finer is better.

## Per-dataset head-to-head (allmeta vs ASReview, both measured here)

allmeta = 3-seed, continuous NB, balanced ratio 1.0 (the shipped default).
ASReview = their own `ELAS u3` NB, 3-seed. Both measured in this repo.

| Dataset | Suite | N | prev | allmeta WSS@95 | ASReview-NB WSS@95 | Δ |
|---|---|--:|--:|--:|--:|--:|
| ACE Inhibitors | Cohen | 2544 | 1.6% | 0.708 | 0.770 | −0.062 |
| ADHD | Cohen | 851 | 2.4% | 0.621 | 0.504 | +0.118 |
| Antihistamines | Cohen | 310 | 5.2% | −0.043 | −0.021 | −0.023 |
| Atypical Antipsychotics | Cohen | 1120 | 13.0% | 0.273 | 0.193 | +0.079 |
| Beta Blockers | Cohen | 2072 | 2.0% | 0.504 | 0.481 | +0.023 |
| Calcium Channel Blockers | Cohen | 1218 | 8.2% | 0.393 | 0.321 | +0.072 |
| Estrogens | Cohen | 368 | 21.7% | 0.362 | 0.307 | +0.055 |
| NSAIDs | Cohen | 393 | 10.4% | 0.648 | 0.713 | −0.065 |
| Opioids | Cohen | 1915 | 0.8% | 0.260 | 0.238 | +0.022 |
| Oral Hypoglycemics | Cohen | 503 | 27.0% | 0.127 | 0.166 | −0.039 |
| Proton Pump Inhibitors | Cohen | 1333 | 3.8% | 0.267 | 0.343 | −0.076 |
| Skeletal Muscle Relaxants | Cohen | 1643 | 0.5% | 0.173 | 0.069 | +0.105 |
| Statins | Cohen | 3465 | 2.5% | 0.378 | 0.397 | −0.018 |
| Triptans | Cohen | 671 | 3.6% | 0.383 | 0.437 | −0.054 |
| Urinary Incontinence | Cohen | 327 | 12.2% | 0.482 | 0.487 | −0.005 |
| Appenzeller-Herzog 2020 | SYN | 3453 | 0.8% | 0.492 | 0.507 | −0.015 |
| Kwok 2020 | SYN | 2481 | 4.8% | 0.675 | 0.691 | −0.015 |
| Wolters 2018 | SYN | 5019 | 0.4% | 0.713 | 0.669 | +0.044 |
| Bos 2018 | SYN | 5746 | 0.2% | 0.795 | 0.866 | −0.071 |
| **Cohen-15 mean** | | | | **0.369** | **0.360** | **+0.009** |
| **SYNERGY-4 mean** | | | | **0.669** | **0.683** | −0.014 |
| **All-19 mean** | | | | **0.432** | **0.428** | **+0.004** |

> ⚠️ **These per-dataset numbers are the 3-seed historical ablation, superseded.** The
> final 2026-06-09 kaizen (balance-ratio 2 + NB alpha 2 + max-df 0.4 + unigram-only,
> re-validated on 10 fresh seeds) gives all-19 **0.447** / Cohen-15 **0.374**, ahead on
> **12 of 19** (paired Wilcoxon p=0.18, n.s.) — see the headline at the top of this file.

In this earlier 3-seed snapshot allmeta was ahead on 9 datasets, behind on 10 — a near
dead heat. Neither tool rescues Antihistamines or the very-low-count sets; we report them
with everything else.

## buscar stopping rule — the real cost of a confident stop

WSS@95 is an oracle metric (it assumes you *know* when 95% recall is hit). In
practice you need a stopping rule. allmeta ships the buscar criterion (bias=1, the
conservative exact urn): it reports the statistical confidence that 95% recall has
been reached and says "safe to stop" at p<0.05.

Measured over the 19 datasets (3 seeds, the shipped continuous-NB run): when the
rule first certifies "≥95% recall at 95% confidence", the recall **actually** achieved
is **0.995 on average (minimum 0.973)** — i.e. the rule never stops short of its
target; it is safe. The catch is the **cost**: at the conservative bias=1 setting the
mean workload saved at that confident stop is ≈**0** (you must screen almost
everything to be statistically certain). This is the honest, known behaviour of
bias=1 buscar — the WSS@95 numbers above are the *oracle* upper bound; the buscar
number is what you can defend statistically. ASReview's own guidance is the same:
a higher `bias` (a model-quality estimate) buys earlier stopping at the cost of a
small recall risk. allmeta exposes the live confidence so the reviewer chooses.

## Optional scientific-text embedding layer (our edge, kept optional)

The free in-browser core stays TF-IDF (no model download, fully offline). An
**optional** embedding layer (small local sentence model, or the agent-handoff:
export → embed → import) was measured with `benchmark/run_embed_headless.mjs`, which
runs the same active-learning loop with dense embeddings instead of TF-IDF.

**Measured result (honest, and a negative one).** On 9 Cohen datasets embedded with
a small local model (`Xenova/all-MiniLM-L6-v2`, 384-d, fully offline after a one-time
download), under the *identical* classifier + cadence (logistic regression +
AutoTAR), the head-to-head is:

| features (LR + AutoTAR, 9 Cohen sets) | mean WSS@95 |
|---|--:|
| **TF-IDF** (free core) | **0.379** |
| MiniLM sentence embeddings | 0.370 |

So on the classic Cohen drug-class reviews, sentence embeddings **do not beat
TF-IDF** — they help a few sets (Antihistamines −0.05→+0.06, ADHD +0.21) and hurt
others (Calcium-Channel-Blockers 0.21→0.07). This matches ASReview's own finding
that TF-IDF is a very strong baseline on these datasets, and it is exactly why the
**free in-browser core stays TF-IDF**. The embedding layer ships as an *option*
(for newer/heterogeneous topics where dense models tend to help, e.g. via ASReview's
`elas_l2`/`elas_h3` SVM-on-embeddings configs) — but we make no inflated claim for it
here: on this benchmark it is a wash-to-slightly-negative, and we report that
plainly. (Best of all on these 9 sets is still the shipped **TF-IDF + NB +
continuous** recipe at 0.451 — embeddings+LR do not catch it.)

## Pass 2 (2026-06-09): six more levers tested to break the tie — all negative

After the kaizen tie above, a second pass tried six additional levers drawn from the
TAR / CLEF / ASReview literature, to see if any could push allmeta past ASReview to a
*statistically significant* lead. Each was ablated on the **full 19-set** with a fast,
parity-verified harness (`benchmark/levers.mjs`, which reproduces the shipped ranker to
Δ=0 — see `levers.mjs parity`). Selection used seeds **disjoint** from the 10 validation
seeds; the shipped per-record NB is the bar to beat (1-seed screen all-19 **0.443**;
3-seed confirm **0.451**).

| Lever (best of the variants tried) | source | all-19 WSS@95 | Δ vs shipped NB | verdict |
|---|---|--:|--:|---|
| **Shipped per-record NB** (α=2, ratio=2, unigram) | — | **0.443** | — | **best** |
| Linear SVM, SGD, balanced (best: C=1, squared-hinge) | Cormack-Grossman; ASReview ELAS u4 | 0.382 | −0.061 | discard |
| Linear SVM, ASReview-u4-faithful (C=0.11, ratio 9.8, sublinear+bigram) | ASReview u4 | 0.201 | −0.242 *(p=0.0002 worse)* | discard |
| ComplementNB (best: α=2, ratio=2) | Rennie 2003 | 0.434 | −0.009 | discard |
| Rocchio relevance feedback (best: β=1, γ=0.75) | Rocchio 1971 | 0.422 | −0.022 | discard |
| χ² feature selection on NB (best: top-2000) | Yang & Pedersen 1997 | 0.431 | −0.013 | discard |
| NB + SVM probability blend (w=0.5) | stacking | 0.435 | −0.008 | discard |
| AutoTAR-faithful LR + synthetic negatives | Cormack-Grossman SIGIR 2014 | 0.288 | −0.155 *(p=0.002 worse)* | discard |
| NB α/ratio retune (8 configs; e.g. α=3 r=2) | — | 0.440 | −0.003 | discard |

**Every lever tied-low or lost; several lost significantly.** Three findings worth
recording so they are not re-litigated a third time: (i) **linear SVM is not competitive**
here — allmeta's from-scratch SGD margin-ranker is far behind NB at every C/ratio tried
(this is allmeta's SVM, not a claim about ASReview's calibrated `liblinear` SVM; but it
matches Ferdinands et al. 2020, who find TF-IDF+NB among the strongest simple combos on
exactly these Cohen sets). (ii) **ComplementNB does not beat MultinomialNB** on this
benchmark, despite being designed for class imbalance — the balanced sample-weighting NB
already gets the imbalance benefit. (iii) **No NB α/ratio retune beats the shipped α=2,
ratio=2**; a 3-seed confirmation of the closest contenders puts shipped first (0.4507 vs
nb_a3_r2 0.4458 / nb_a2_r3 0.4409), so the shipped recipe is not an over-fit of the
earlier tuning pass. **Nothing was shipped from this pass** — the shipped config is
unchanged, and the allmeta-vs-ASReview result remains the **honest statistical tie**
(allmeta nominally ahead, p≈0.18) reported above. Reproduce:
`SEEDS=1234567 node benchmark/levers.mjs grid benchmark/grids/<grid>.json`.

## Honest verdict

By replicating ASReview's recipe — **Naive Bayes + balanced weighting + per-record
continuous active learning** — and then a per-lever kaizen ablation (2026-06-09) that
kept only the measured wins, allmeta's shipped, 100%-local, no-key screening classifier
now reaches a **statistical tie with ASReview, nominally ahead**, on the standard
19-dataset benchmark with the matched per-record (`n_query=1`) cadence — which is now
allmeta's shipped default (allmeta all-19 0.447 vs ASReview 0.428; Cohen-15 0.374 vs
0.360; wins 12/19). **The lead is not statistically significant** (paired Wilcoxon
p = 0.18, 10 fresh seeds), so we report a tie with allmeta in front, not a win — a
genuine improvement from the pre-kaizen config, which was *significantly behind*
(p = 0.013, 6/19). The headline gap the old file reported (0.29 vs 0.83) was an artefact
of an **inflated, non-reproducible reference**; the real target was ~0.43 and is now met.
No cherry-picking: the hardest datasets (Antihistamines, Opioids, NSAIDs) remain hard for
*both* tools, and we report them with the rest.

ASReview reference: van de Schoot et al. (2021), *Nature Machine Intelligence*
3:125–133. ASReview source: github.com/asreview/asreview (Apache-2.0).
Reproduce: `SEEDS=101,202,303,404,505,606,707,808,909,1010 node benchmark/run_benchmark.mjs`
(allmeta) + the ground-truth script in `benchmark/_embed/` against an `asreview` install;
paired test `node benchmark/sweep.mjs pairedjson results.json`.
