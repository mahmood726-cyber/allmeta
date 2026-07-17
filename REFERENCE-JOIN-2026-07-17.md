# The reference join — forest-plot label → ref-list → DOI/PMID → NCT

**Date:** 2026-07-17 · **Lane:** reference-join · **Status:** MEASURED, join shippable behind the stated precision gate
**Producing code:** `F:\allmeta\oa68k\refjoin.py`, `adjbatch.py`, `adjscore.py` · **Tests:** `oa68k\tests\test_refjoin.py` (23 tests, all green)
**Suite at time of writing:** `python -m pytest tests/ -q` → **211 passed, 1 skipped** (skip: `NCBI_API_KEY` unset)

---

## Headline

Mahmood was right that the reference list is the missing identity layer, and it works.
**59.1% of forest-plot labels [57.1%, 61.1%] now resolve to exactly one reference in
their own review's ref-list, at a measured precision of 100% [91.0%, 100%] (n=39).**
The raw material was already ours: **100% of the metas the vision store has read have
cached JATS carrying a `<ref-list>`** — the resolver was on disk the whole time.

Three things in the brief are **contradicted by measurement** and should not be carried
forward:

1. **Cardio is not easier — it is harder.** 45.3% [40.1, 50.6] vs non-cardio 61.4%
   [59.3, 63.5], non-overlapping. "Start with cardio" is the wrong instruction *for this
   join*.
2. **The trial acronym is not in the ref-list.** Only **2 of 19** acronym tokens (10.5%
   [3.0, 31.4]) appear anywhere in their own review's references. The acronym is a
   near-unique string, exactly as claimed — but there is nothing to match it *against*.
3. **The excluded-studies table is effectively absent.** 7/6,000 cached JATS (**0.1%**
   [0.1%, 0.2%]) carry one with reasons. The "both halves" hope does not survive this
   corpus.

And the ceiling is **not** the label→reference step. It is the registry: of 1,202 labels
resolved all the way to a PMID, only **187 (7.9% [6.9, 9.0])** reach exactly one NCT.
**964 (41.4%)** resolve to a real, identified paper that AACT has never linked to any
trial. More vision calls do not touch this, but neither does a better matcher.

---

## What I did not rebuild

`refmatch.py` **already implemented this chain** — label → ref → PMID, with the two
decisions that matter (ambiguity dropped rather than guessed; DERIVED/RESULT-only on the
AACT hop). It was referenced **only by its own test**: written, correct, never wired to a
runner, never measured. The deficit was memory, exactly as the brief warned.

`refjoin.py` **composes** it and adds only what the funnel needs, each for a stated
reason. `test_refjoin.py::test_agrees_with_refmatch` pins my candidate walk to
`refmatch.match_label` on every PMID-bearing case so the two cannot silently drift.

| Existing | Reused / status |
|---|---|
| `refmatch.py` | The matcher. Reused, pinned by test, **not** reimplemented. |
| `linkfunnel.py` | Meta-level funnel. Complementary — it counts *metas*, this counts *rows*. |
| `build_reread_list.CARDIO` | Cardio regex. Imported, not re-typed. |
| `detect3` ledgers | Already resolve ref-PMID → NCT **corpus-wide** (40,029 NCTs held). |

**The one genuinely new thing** is row-level identity. `detect3` says *"this meta cites
these 12 NCTs."* `refjoin` says *"**this row** is **that** trial."* Nothing else on disk
does that, and it is what a vision-read forest row needs to be scored against registry
ground truth.

---

## Job 1 — the funnel

Population: **2,375 deduped study-row labels across 126 metas**, from
`calls.jsonl` + `calls.shard-A.jsonl` + `calls.shard-B.jsonl` (opened read-only;
`.bak` files excluded — they are pre-repair snapshots of shard-B and would double-count
the same figure under a superseded parse). `calls.shard-C.jsonl` is FDA-review vision and
carries no forest rows.

Reproduce: `cd F:\allmeta\oa68k && python refjoin.py`

| Stage | k/n | rate | 95% CI |
|---|---|---|---|
| S1 meta's JATS cached | 2,375/2,375 | 100.0% | [99.8, 100.0] |
| S2 JATS exposes a `<ref-list>` | 2,375/2,375 | 100.0% | [99.8, 100.0] |
| **S3 label → exactly ONE ref** | **1,404/2,375** | **59.1%** | **[57.1, 61.1]** |
|   · ambiguous (**rejected, not guessed**) | 214/2,375 | 9.0% | [7.9, 10.2] |
|   · unmatched | 757/2,375 | 31.9% | [30.0, 33.8] |
| S4 matched ref carries a DOI | 1,247/2,375 | 52.5% | [50.5, 54.5] |
| S5 matched ref carries a PMID | 1,202/2,375 | 50.6% | [48.6, 52.6] |
| **S6 PMID → exactly ONE NCT** | **187/2,375** | **7.9%** | **[6.9, 9.0]** |
|   · PMID → no NCT (**ceiling**) | 964/2,375 | 41.4% | [39.5, 43.4] |
|   · PMID → >1 NCT (rejected) | 31/2,375 | 1.3% | [0.9, 1.8] |

**Distinct NCTs reached: 160.** Wilson intervals throughout — the Wald interval is
degenerate at 0/n and n/n, which is exactly where S1/S2 sit.

### By key

Dispatch is on label **shape**, not a fallback cascade, so these rates are properties of
the key rather than artifacts of ordering.

| Key | matched | ambiguous | unmatched |
|---|---|---|---|
| `surname_year` (refmatch's key) | 1,113 | 111 | 468 |
| `surname_only` (year-less labels) | 291 | 102 | 271 |
| `acronym` | 0 | 1 | 18 |

### Against the 67/283 baseline

⚠️ **Not a controlled comparison — do not quote it as one.** The brief's
`67/283 resolved, 10/283 → NCT` is flagged in the brief itself as measured by another
lane (`local_b1c44062`) with its own script and **not re-verified by me**. I did not
re-verify it either: it is a different, smaller, differently-defined label population, so
the arithmetic delta (23.7% → 59.1%) mixes a real improvement with a population change of
unknown size. **The 59.1% [57.1, 61.1] on a defined population of 2,375 is the number to
carry forward; the delta is not.**

---

## The precision gate

> *Probabilistic linkage ONLY behind a MEASURED-PRECISION gate. If precision can't be
> measured, don't ship the join.*

**Design: blind re-identification, not confirmation.** Asking an adjudicator "here is the
ref we chose — is it right?" measures agreement with a suggestion. So the adjudicators
were **never shown the matcher's answer**. Each saw the label, the review's title, and the
review's **full numbered ref-list**, and independently identified the row. `NONE` (the
study is not in the list at all) and `TIE` were first-class answers. Precision is
agreement between two parties that could genuinely disagree — and on the pre-fix matcher,
they did.

Sample: 40 cases, drawn with a pinned seed (`20260717`) from **all matched rows**, not
from the 187 that reach an NCT — conditioning on reaching a registry would sample a biased
subset (rows whose PMIDs happen to be registered) and report its precision as the whole
join's.

Reproduce: `python adjbatch.py --n 40 --batches 4 --out <dir>` then
`python adjscore.py --truth <dir>/truth.json --verdicts <dir>/verdicts.json --recheck`

| | pre-fix | post-fix |
|---|---|---|
| matcher == adjudicator | 39/40 · **97.5%** [87.1, 99.6] | 39/39 · **100.0%** [91.0, 100.0] |
| disagree (**wrong join**) | 1/40 · 2.5% [0.4, 12.9] | **0/39 · 0.0%** [0.0, 9.0] |
| adjudicator `NONE`/`TIE` | 0/40 | 0/39 |
| matcher rejects (excluded from precision) | — | 1 |
| · `surname_year` | 29/29 · 100% [88.3, 100] | 29/29 · 100% [88.3, 100] |
| · `surname_only` | 10/11 · 90.9% [62.3, 98.4] | 10/10 · 100% [72.2, 100] |

**Coverage at a stated precision: 59.1% of labels [57.1, 61.1] resolve to one reference
at a precision whose 95% lower bound is 91.0%.** With n=39 that lower bound is the honest
gate — **not** the 100% point estimate. Re-scoring used the *same* blind verdicts against
the fixed matcher; re-drawing a fresh sample after a fix would measure a different
population and invite shopping for a better number.

⚠️ **Stated limitation.** The adjudicators are independent LLM subagents that never saw
the matcher, which is far stronger than self-assessment but **is not the hand-check the
brief asked for**. Before this join feeds anything Mahmood signs, he should hand-check a
subsample. The 40 cases and their verdicts are preserved for exactly that.

---

## Two bugs found, both silent, both now pinned by regression tests

Neither raised. Both would have been reported as facts about the corpus when they were
facts about my join — the failure `build_reread_list` already records once
("cardio candidates: 0" was a missing field, not an empty corpus). I reproduced it twice
in one session.

### 1. The weld bug — `"".join(itertext())`

JATS puts no whitespace between sibling elements, so the obvious spelling welds them:

```
<surname>A</surname><given-names>A</given-names><article-title>PARADIGM-HF …
  ""-join  ->  'AAPARADIGM-HF primary results2014111'
  " "-join ->  'A A PARADIGM-HF primary results 2014 111'
```

The acronym lookbehind `(?<![A-Za-z0-9])` saw the given-name's `A` glued to `PARADIGM`
and refused the match — *the trial was right there* and it reported "acronym in no ref".
The DOI charclass had no space to stop at and swallowed the year
(`10.9999/in-text-only.2020`). **This affects every ref**, since every ref has adjacent
siblings. Fixed in `refjoin._strip`.

### 2. The gate hole — an invisible ref cannot be rejected

**This is the more serious one.** ~9.6% of refs [8.9, 10.3] are unstructured
`<mixed-citation>` with **no `<surname>` elements**. Such a ref was invisible to every
surname key — and *an invisible ref cannot be rejected as a duplicate*, so the ambiguity
gate passed and the matcher returned the wrong ref **with full confidence**.

The single pre-fix error found it. Case 25, `PMC11201327`, label `'Seid et al'`:

| ref | citation | Seid's position | structured? |
|---|---|---|---|
| `[23]` | `Seid G, Ayele M. Undernutrition and Mortality among adult TB patients…` | **first author** | **no → invisible** |
| `[26]` | `Hussien B, Hussen MM, Seid A, Hussen A…` | third author | yes → visible |

The matcher saw one candidate, called it unambiguous, and picked the mid-author paper.
The blind adjudicator picked `[23]`. **A label of `'Seid et al'` cannot distinguish two
Seid papers — the only correct answer is `ambiguous`**, which is what it now returns.

**This was not a rare edge case: 76.2% of metas [68.0, 82.8] mix structured and
unstructured refs**, so the hole was latent in three out of four reviews. Fixed by a
recall-oriented text-surname fallback (`refjoin._text_surnames`), scoped to the leading
author block so it cannot harvest surnames out of the article title. Pinned by
`test_case25_regression_mixed_structured_reflist_is_ambiguous`.

The fix improved **both** coverage and safety, which is worth stating because the two
usually trade off: matched 57.3% → 59.1% (unstructured refs became matchable *at all*),
and detected ambiguity 201 → 214 — **13 rows that were at risk of being silent wrong joins
are now rejected.**

---

## Cardio: the premise is contradicted

Reproduce: `python refjoin.py --split` · cardio = `build_reread_list.CARDIO` over the
meta title read from its own JATS front matter.

| Stage | CARDIO (n=340, 14 metas) | NON-CARDIO (n=2,035, 112 metas) |
|---|---|---|
| S3 label → ONE ref | 154 · **45.3%** [40.1, 50.6] | 1,250 · **61.4%** [59.3, 63.5] |
| ambiguous (rejected) | 31 · 9.1% [6.5, 12.7] | 183 · 9.0% [7.8, 10.3] |
| S5 PMID | 146 · 42.9% [37.8, 48.3] | 1,056 · 51.9% [49.7, 54.1] |
| S6 → exactly ONE NCT | 25 · **7.4%** [5.0, 10.6] | 162 · **8.0%** [6.9, 9.2] |

**Cardio is significantly worse at the match step (non-overlapping CIs) and no different
at the registry step.** Compared against non-cardio, not against "all" — "all" *contains*
cardio, so that contrast is diluted by construction.

**Why**, measured rather than speculated. The brief's reasoning was: cardio labels by
trial acronym → near-unique string → not fuzzy → easy. The first three are true. The
conclusion does not follow, because **the acronym is not in the reference list**:

```
PMC12402402 — "Efficacy and Safety of Tenecteplase in Acute Ischemic Stroke"
  forest rows : TIMELESS TRIAL · TEMPO-02 TRIAL · TRACE-III TRIAL · TWIST TRIAL …
  ref [1]     : Albers, G. W., M. Jumaa, B. Purdon, et al. 2024. "Tenecteplase for
                Stroke at 4.5 to 24 H With Perfusion-Imaging Selection." NEJM
```

Ref [1] **is** TIMELESS. The citation never says so. Vancouver/APA style names authors,
title and journal — the acronym survives only when the article title happens to carry it
in parentheses. **Measured: 2/19 acronym tokens (10.5% [3.0, 31.4]) appear anywhere in
their own review's ref-list.**

So an acronym label is the **worst** case for this join, not the best: it is unresolvable
by the very list that resolves everything else. It is also self-inflicted in part — the
same review's rows would resolve fine if vision had read the author-year that RevMan-style
plots print.

Two further wrinkles worth recording:
- **`TEMPO-02` (label) vs `(TEMPO-2)` (ref).** Zero-padding drift. Even where the acronym
  *is* present, the string is not identical.
- **The "acronym" class is polluted.** Of 19 acronym-shaped labels, 9 are dataset
  accessions from transcriptomics metas (`GSE80999`, `GCST90018674`, `PRJEB45911`), not
  trials at all. They will never resolve to a trial because they are not one.

**Recommendation: do not start with cardio for the reference join.** The right bridge for
acronym labels is the review's *characteristics-of-included-studies* table, which maps
study-ID → citation — not the ref-list. That is a separate instrument and is not built.

---

## Job 2 — the excluded-studies table: **no**

> *"Cochrane reviews publish an EXCLUDED-STUDIES table WITH REASONS. Do our cached JATS
> carry it?"*

Reproduce: `python refjoin.py --excluded --corpus 6000` (random sample, pinned seed
`20260717`, of the whole 175,306-file JATS cache).

Measured on the **corpus**, not on the 126 vision-read metas, because 0/126 has a CI of
[0.0%, 3.0%] — consistent with ~5,000 of the cache having one. That interval cannot tell
*rare* from *absent*, and the brief asks about our cached JATS generally.

| Measure | k/n | rate | 95% CI |
|---|---|---|---|
| phrase anywhere in the XML (**upper bound**) | 328/6,000 | 5.5% | [4.9, 6.1] |
| it captions/titles something | 65/6,000 | 1.1% | [0.9, 1.4] |
| it captions a **`<table-wrap>`** | 7/6,000 | 0.1% | [0.1, 0.2] |
| **that table has a REASON column** | **7/6,000** | **0.1%** | **[0.1, 0.2]** |

Nested deliberately: a heading is prose, a table is an object, and only a table with a
reason column is an audit trail. On the vision-read population: **1/126** headings
(0.8% [0.1, 4.4]), **0/126** tables.

**Answer: no.** At 0.1% the excluded-studies table is effectively absent from this corpus
— on the order of ~200 of 175,306 cached files. The reason is structural, not a parsing
failure: this is the **PMC OA journal-meta corpus**, and the excluded-studies-with-reasons
table is a **Cochrane CDSR** convention. CDSR is not in PMC OA.

One genuinely encouraging detail: **all 7 tables that exist carry a reason column** (7/7).
When the object is present it *is* auditable. It is simply almost never present.

⇒ **The rule-bending instrument (`local_11173cac`) does not get both halves from this
corpus.** "You cannot hide an inclusion" stands; "you cannot hide either" does not. Getting
the exclusion half requires CDSR, a different and largely paywalled source. This should be
priced as a new acquisition problem, not treated as available.

---

## Job 3 — the ref-list as a trial discovery layer: **already exhausted**

Reproduce: `python refjoin.py --discovery`

| | cardio | all |
|---|---|---|
| metas | 14 | 126 |
| distinct ref PMIDs | 688 | 5,948 |
| distinct NCTs named | 191 | 1,074 |
| **NCTs new to us** | **0** | **1** |
| (NCTs we already hold) | 40,029 | 40,029 |

The ref-lists of these 126 metas name 1,074 distinct trials and **exactly one is new**.

**Read this correctly.** It is not "the ref-lists have nothing to offer." It is that
`detect3` **already ran ref-PMID → NCT across the whole corpus** (hence 40,029 held), so
re-running that hop on 126 metas rediscovers what we have. The discovery value of the
reference list was harvested before this lane existed. Measured against our own holdings —
a claim about our holdings, which is checkable — not against the world.

**The ref-list's remaining value is identity, not discovery**, and identity is the thing
nothing else does.

---

## What this unblocks — and what it does not

**Unblocked.** A vision-read forest row can now be attached to a specific trial for
**59.1% of labels [57.1, 61.1]** at a precision ≥91.0% (95% LB). That is the join the
brief asked for, and it is what CT.gov/FDA/OA-text recovery scoring needs: a row you
cannot name cannot be scored. 160 distinct NCTs are reachable from the store as it stands.

**Not unblocked, and this is the real ceiling.** The bottleneck has moved and it is **not**
the matcher:

- **964 labels (41.4% [39.5, 43.4]) resolve to a real, identified PMID that AACT links to
  no trial.** These are correctly-identified papers of unregistered/pre-2005/non-CT.gov
  trials. No matcher improvement touches this. It is the same ceiling `linkfunnel.py`
  documents at meta level, now measured at row level.
- **757 labels (31.9%) match no reference.** The largest addressable slice is the
  **680 labels (28.6%) with no parseable year** — vision captured the author but not the
  year. That is a **vision-prompt fix, not a matcher fix**: a re-read that captures the
  year would move those from the weak `surname_only` key (291 matched / 102 ambiguous) to
  the `surname_year` key that measures 100% [88.3, 100] precision.
- **`'Zhong et al34'`** — vision flattened a **superscript citation number** into the
  label. That number is a *direct index into the ref-list*: a stronger key than any name
  match. Not exploited, because vision captured it only incidentally. **A prompt that
  captures the superscript reference number would make the join near-exact for
  numerically-cited reviews.** This is the highest-value next step and it costs one prompt
  change, not a new resolver.

**Crossref/OpenAlex were not needed and were not called.** The DOI/PMID were already in
the JATS for 52.5%/50.6% of labels. Crossref is the right resolver for the 45 labels that
matched a DOI-only ref (1,247 − 1,202); OpenAlex's metering (⚠️ $1/day free tier since
2026) was never approached because no external resolver was required to answer any
question here.

---

## Provenance and hygiene

- **The vision store was opened read-only.** `refjoin.vision_ledgers()` globs
  `calls*.jsonl`, opens `'r'`, and never writes. `.bak` files excluded (pre-repair
  shard-B snapshots — counting them double-counts figures under a superseded parse).
  Pinned by `test_vision_ledgers_exclude_bak`.
- **`F:\E156\tournament` was not touched** (read-only per standing instruction).
- **`shard-B` source_ids are figure-qualified** (`PMC12587632#…Fig2_HTML.jpg`). Joining on
  the raw string silently loses every shard-B row and *looks like* missing JATS. Pinned by
  `test_pmcid_of_strips_figure_qualifier`.
- **BACKGROUND is excluded from the AACT hop.** It is 744,555 of 1,087,352 rows (68.5%) on
  snapshot `2026-04-12` and means "this trial cited that paper", not "that paper reports
  this trial". Accepting it would fan one famous citation out to hundreds of NCTs and
  manufacture mismatches that are really linking errors. `refjoin.pmid_to_nct` filters to
  DERIVED/RESULT in the resolver, not in a caller.
- **Titles are read from each meta's own JATS front matter, not a ledger.** The first
  spelling joined `harvest`/`detect3` for a `title` field those ledgers do not have; it
  resolved **0 of 126** and `--cardio` would have reported an empty cardio corpus.
  `load_titles` now **raises** on a zero resolve rate rather than reporting silence as
  absence.

### Every number in this report

| Number | Producing command |
|---|---|
| Funnel, all keys, per-key rates | `python refjoin.py` |
| Cardio vs non-cardio | `python refjoin.py --split` |
| Label/acronym/year-less/ref-structure counts | `python refjoin.py --diag` |
| Job 2 prevalence | `python refjoin.py --excluded --corpus 6000` |
| Job 3 discovery | `python refjoin.py --discovery` |
| Precision | `python adjbatch.py --n 40 --batches 4 --out <d>` → `python adjscore.py --truth <d>/truth.json --verdicts <d>/verdicts.json --recheck` |
| 2/19 acronym-in-reflist | one-off probe; re-derivable from `--diag` + `--probe PMC12402402` |
| BACKGROUND 68.5% | `study_references.parquet`, snapshot `2026-04-12` |
| 67/283 baseline | ⚠️ **another lane's number, not re-verified by me, not a controlled comparator** |

---

## Limitations — read before quoting anything above

1. **Precision n=39.** The gate is the **91.0% lower bound**, not the 100% point estimate.
2. **Adjudicators are LLM subagents, not Mahmood.** Blind and independent of the matcher,
   but not the hand-check the brief specified. Sample preserved for hand-check.
3. **126 metas is a small, non-random population** — whatever the vision lane happened to
   read. These rates are for the vision store as it stands, not for the 67,771-meta corpus.
   S1/S2 at 100% is a property of *this* population (the vision lane read metas we had
   cached); it will not hold corpus-wide.
4. **Acronym n=19, of which 9 are not trials.** The 2/19 finding is directionally strong
   and mechanistically explained, but the interval [3.0, 31.4] is wide. It should be
   re-measured on a purpose-built cardio sample before it is treated as settled.
5. **`surname_only` precision is 10/10** — a 72.2% lower bound. It carries 291 of the 1,404
   matches (20.7%). If a consumer needs a higher floor than 72%, gate to `surname_year`
   only and take 1,113 matches instead.
6. **Job 3's "1 new NCT" is measured against our own ledgers**, which were built by the
   same ref→NCT route. It is a statement about redundancy with `detect3`, not about the
   world.
