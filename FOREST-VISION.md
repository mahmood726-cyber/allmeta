# Forest-Plot Vision Extraction — coverage, measured accuracy, and the scale decision

`F:\allmeta\oa68k` · pc2 (hostname), ledger-tagged `pc1` · **2026-07-16**
Builds on the 68k programme's store; **does not fork it**. Nothing pushed.

**Every number here is batch-actual, counted from disk.** Extrapolations are
labelled PLANNING-ONLY and are never a result.

---

## 0. Why this lane exists

The 68k plan's **R4** is a measured blocker: OA meta characteristics tables carry
the included-study list, arm sizes and the pooled estimate, but the **per-trial
2×2 event counts live in the forest-plot images**. Text extraction cannot reach
them (v3 detector: `cells_tested = 0`, correctly refusing to guess). The question
this lane answers: **can a vision model reach them, and how accurately?**

---

## 1. The answer in four lines

*(Coverage is over the **8,791 harvested metas** scanned; the content and accuracy
lines are over the **36-figure / 468-study-row** vision batch. The two denominators
are different and are never mixed.)*

1. **Coverage:** **58.6%** of harvested metas have a locatable forest plot (batch-actual, n=**8,791** metas; **replicated** — an earlier scan over 2,731 metas gave 59.8%). **15,959** forest figures, 3.10 per meta.
2. **The premise needs qualifying:** only **24.8%** of forest study rows actually print a 2×2. **56.4% print effect+CI only** — no counts at all. The 2×2s are in the figures *when they exist at all*, but most forest plots don't show them.
3. **Accuracy where measurable is high:** **312/312 N cells exact (100%, 95% CI lower bound 98.8%)** by the plots' own printed-subtotal checksum; **96/96** dichotomous rows arithmetically self-consistent (lower bound 96.2%). **Zero fabricated values across 36 figures.**
4. **The AACT ground-truth validation FAILED as designed** — it yields **n=2**, and both are attrition confounds, not misreads. **No accuracy-vs-registry number is reportable.** See §5; this is the honest negative result of this lane.

**Scale decision: QUALIFIED GO** — but for a different, smaller prize than the brief assumed, and via a different validator. See §7.

---

## 2. Coverage — the first honest gate

Deterministic scan of the shared PMCID-keyed XML cache (`figscan.py`). No network,
no model, re-runnable.

The sibling harvest lanes were still ingesting throughout this session, so the
scan was re-run at the end over the grown cache. **Both scans are reported — the
coverage rate replicated across a 3.2× larger sample**, which is the strongest
evidence available that it is a real rate and not a sampling artefact.

| Quantity | First scan | **Final scan (authoritative)** |
|---|---:|---:|
| Cached articles scanned | 4,311 | **10,592** |
| …that are 68k **metas** (rest are trial papers / DTA corpus) | 2,731 | **8,791** |
| **Metas with a forest plot** | 1,634 = **59.8%** | **5,149 / 8,791 = 58.6%** |
| Forest figures on those metas | 4,935 (~3.0/meta) | **15,959** (**3.10**/meta) |
| Figures by kind (all articles) | — | forest 16,508 · not_forest 14,810 · forest_maybe 644 · **unknown 21,546** |

**58.6% is a FLOOR.** 21,546 figures have captions carrying no positive forest
evidence and are classified `unknown` — deliberately *not* `not_forest`. Absence of
evidence in a terse caption ("Fig 3.") is not evidence of absence, and conflating
the two would silently overstate what we refused.

**Naming honesty.** The field is `locator_recorded`, **not** `retrievable` — §3
shows the locator it records **404s**. An earlier draft called it `retrievable`,
which asserted a capability the JATS cannot provide; that is precisely the
overclaim the 68k plan's own **R3** rename (`usable_for_mirror` →
`cites_registry_linked_trial`) was written to prevent, so the field was renamed and
the ledger re-scanned. A test asserts the old key is absent.

### 2.1 A regex that would have faked this number

The obvious probe is `re.search(r'<fig\b', xml)`. It is **wrong**: `\b` matches
between `fig` and the hyphen of `<fig-count count="2"/>`, which is `<counts>`
metadata, not a figure. Every article in the corpus reports a figure whether or
not it has one. `figscan.scan_xml` matches the tag exactly;
`test_fig_count_is_not_a_figure` pins it.

---

## 3. Retrieval — the advertised locator is stale

`figscan.retrievable` records that an **asset locator was written**, not that bytes
landed. That distinction earned its keep immediately: **the locator 404s.** Three
routes, measured from this host:

| Route | Result |
|---|---|
| `ncbi.nlm.nih.gov/pmc/articles/<PMCID>/bin/<fname>` (the JATS href path) | **301 → 404**; returns an **HTML error page**. Saved blindly it is a "successful" `.jpg` download of a web page. |
| PMC OA service `oa.fcgi` → `ftp://…/oa_package/<a>/<b>/<PMCID>.tar.gz` | **404 over https, 550 over ftp.** `https://ftp.ncbi.nlm.nih.gov/pub/pmc/` now lists only `deprecated/` + `PMC-ids.csv.gz`. **The OA service still advertises a tree that is gone.** |
| Article page → `cdn.ncbi.nlm.nih.gov/pmc/blobs/<h1>/<id>/<h2>/<fname>` | **200, `image/jpeg`** ✅ |

**The load-bearing detail:** `<h1>`/`<h2>` are **opaque hashes not derivable from
the JATS**. A figure's bytes cannot be addressed from the cached XML alone —
every article costs **one page request** to resolve filename → CDN URL. Retrieval
is therefore *not* free, and `figfetch.py` caches every resolution and validates
**magic bytes** so an HTML error page can never be accepted as an image.

**Fetch result: 200 / 200 forest images fetched, 0 failures** (batch-actual).

---

## 4. What forest plots actually contain — the premise, qualified

**468 study rows across 36 figures** (all three vision batches complete).

| Study-row content | n | % |
|---|---:|---:|
| **effect + CI only — no counts** | **264** | **56.4%** |
| **complete 2×2** (events + N, both arms) | **116** | **24.8%** |
| complete continuous (mean/SD, both arms) | 59 | 12.6% |
| partial counts | 29 | 6.2% |

**This qualifies R4 rather than confirming it.** R4 is right that the 2×2s are
*not in the tables* and *are in the figures*. But it does not follow that the
figures carry them: **56.4% of forest rows print no counts at all** — the plot
shows only the pooled-ready effect and its CI. **A vision layer cannot extract a
2×2 that was never drawn.** This is the ceiling on the whole approach, and it is
a property of publishing practice, not of the model.

Figure kinds: `forest_multipanel` 21 · `forest_generic` 7 · `forest_continuous` 4 ·
`not_a_forest_plot` 2 · `forest_dichotomous` **1** · `unreadable` 1. The classic
single-panel RevMan events/N plot is a **rare** shape (1/36); the corpus is
dominated by multi-panel composites.

**44.2% of all rows are not studies** (468 study vs 85 subgroup headers, 64
subtotals, 66 totals, 72 heterogeneity lines, 83 other). Row-typing is not a
detail — it is nearly half the work.

---

## 5. ⛔ The AACT validation FAILED — and the failure is the finding

The brief's core instruction: compare vision-read numbers against the registry's
posted results and report exact/near-match rates. **That comparison cannot be made
at this scale.** Reporting it anyway would be fabrication.

### 5.1 The universe exists — the funnel destroys it

The join is real and was built (`refmatch.py` → `forestgold.py`):
forest row label → JATS `<ref-list>` (surname+year) → PMID → AACT
`study_references` **DERIVED/RESULT only** → NCT → registry.

| Stage | Count |
|---|---:|
| Forest metas citing ≥1 registry-linked trial (DERIVED/RESULT) | 1,473 / 1,634 |
| Forest metas citing ≥1 trial **with posted results** | **494** → **1,250 distinct NCTs** |
| *(measured on the 1,634-meta scan; the ratio, not the absolute, is the point)* | |
| — *then, on the scored batch* — | |
| Study rows | 283 |
| Labels resolved to exactly one PMID | 67 (unmatched 204, ambiguous 12) |
| PMIDs resolved to exactly one NCT | 10 (57 had no DERIVED/RESULT NCT) |
| Rows with registry ground truth present | 2 |
| **Comparable rows** | **2** |

**n = 2. 95% CI lower bound on 2/2 = 15.8%.** That is not a measurement.

> ⚠️ Note for the record: my brief said the harvest holds **143 poolable registry
> 2×2s**. Counted from the ledger today it is **511** (`preextract.pc1.jsonl`,
> 2,417 rows). The brief's figure was stale. Neither number rescues the funnel.

### 5.2 Worse: the comparison is confounded, so even n=2 is uninterpretable

Both "mismatches" were investigated individually and **neither is a misread**:

| Row | Vision read | Registry | Verdict |
|---|---|---|---|
| **Davis 2024** (PMC12210942) | 39 + 43 = **82** | NCT04757961 enrollment **90 ACTUAL** | **Attrition, not error.** The plot's Ns carry mean/SD → they are *analysed completers*. The registry's 90 is *randomised*. Both correct; different quantities. |
| Petrylak 2025 (PMC12261593) | 960 | 1,030 | Same family — pooled/analysed subset vs randomised total. |

**Root cause:** the store holds **no per-arm registry N**. Verified against the
schema, not assumed: `trial_results` carries outcome measurements keyed on
`result_group_id` with `group_title` but **no participant count**; `trial_arms`
carries arm identity with **no count**. The only N is `trials.enrollment` — a
whole-trial randomised total. So the only available comparison is
total-N-vs-enrollment, which **measures dropout, not reading accuracy**.

Closing this needs AACT's participant-flow / baseline counts in the store as
counts. **That is a ground-truth gap, not a result. No per-arm accuracy number
should be quoted until it is closed.**

---

## 6. ✅ What DID validate — the plots police themselves

The registry was the wrong oracle. The right one was printed on the figure all
along.

**A forest plot's `Subtotal (95% CI)` / `Total (95% CI)` line is a checksum the
publisher computed over the same column we are reading.** If a vision read gets
one N wrong — or drops a study row, or types a subtotal as a study, or bleeds two
subgroups together — the column stops summing to the printed total. **One check
validates every row in the column at once, needs no registry link, and works on
any plot that prints a total.**

| Instrument | Result | 95% CI lower bound |
|---|---|---|
| **Printed-subtotal checksum** — individual **N cells** validated | **312 / 312 = 100.0%** | **98.8%** |
| — reconciling arm-columns | **50 / 50**, **0 mismatch**, 110 not checkable, 7 figures | |
| **Arithmetic self-consistency** — dichotomous rows (recomputed effect vs printed effect+CI) | **96 / 96 = 100.0%** | **96.2%** |
| Manual spot-check (author, by eye) — Davis 2024, all 6 fields | **6 / 6 exact** (8.7 / 4.5 / 39 / 11.6 / 5.1 / 43) | — |
| Registry arm-size | **n = 2, confounded** | 15.8% — **unusable** |

Worked example (PMC12210942 Fig3) — **19 study rows across 2 subgroups, 4/4
reconciliations exact**:

```
subgroup '1.1.1 Depression at post-test' (13 studies)
  ACT   sum=715 printed_subtotal=715  OK
  Ctrl  sum=595 printed_subtotal=595  OK
subgroup '1.1.2 Depression at follow-up' (6 studies)
  ACT   sum=235 printed_subtotal=235  OK
  Ctrl  sum=231 printed_subtotal=231  OK
```

Each reconciliation simultaneously confirms the Ns, the subgroup partition, and
the study/subtotal/header row-typing.

**Honesty boundary on this instrument:** it cannot catch compensating errors
(+3/−3), it speaks to the **N column** specifically (not events, not the effect),
and 74 arm-columns were **not checkable** (no printed total, or a partially-read
column — a column is only scored when *every* study row in scope has that N read,
so a partial read cannot luck into a pass). Arithmetic consistency is likewise
*necessary, not sufficient*: a consistent misread of both counts and effect would
pass.

---

## 7. Scale decision — **QUALIFIED GO**

**Go**, on this evidence: reading accuracy is not the bottleneck. **312/312 N cells
and 96/96 dichotomous rows**, plus a clean manual spot-check, with **zero fabricated
values across 36 figures** — every agent nulled what it could not read and said so.
One agent refused an entire 9-panel montage rather than emit plausible digits;
another caught an arithmetically impossible row and upscaled until it resolved.

**But the prize is smaller than the brief assumed, and must be re-scoped:**

- **The 2×2 yield is 24.8%, not ~100%.** 56.4% of forest rows print no counts.
- **Economics on the harvested-so-far corpus (batch-actual basis):** **15,959**
  forest figures on **5,149** metas. At **13.0 study rows/figure** (468/36) →
  **~207,000 study rows** PLANNING-ONLY, of which ~24.8% carry a 2×2 → **~51,000
  2×2 rows** PLANNING-ONLY, plus **~26,000** continuous rows.
  *Extrapolated from n=36 figures; **not a result**.*
- **This is ~31% of the corpus.** 8,791 of 67,772 metas are harvested so far; at
  the same rates a full 68k harvest implies ~**123,000** forest figures.
  PLANNING-ONLY, and it compounds every uncertainty above.
- **Retrieval costs one page request per article**, on this host's shared 3 req/s
  NCBI budget (contended with the harvest + crosswalk lanes). Fetch itself was
  **200/200, 0 failures**.
- **⚠️ Cost is the real gate:** ~123–172k tokens per 12-figure agent ⇒ **~12k
  tokens/figure**. 15,959 figures ⇒ **~190M tokens** PLANNING-ONLY for the
  harvested corpus alone; the full 68k ⇒ **~1.5B**. This is the budget question to
  settle before scaling, and it is why the ~25% yield matters so much: **three
  quarters of that spend buys effect+CI rows that carry no 2×2.** Caption-level
  pre-filtering to dichotomous plots is the obvious lever and is **not yet built**.

**Conditions on the GO — all three are blocking:**

1. **Ship the checksum as a fail-closed gate, not a report.** A 2×2 row from a
   column that does not reconcile must not enter the store. This is the only
   validator that scales; it must be able to *block*.
2. **Do not quote a registry-accuracy number** until per-arm participant-flow
   counts are in the store (§5.2). Until then the registry comparison measures
   attrition.
3. **`source_tier = "figure_vision"`, never fused with registry tiers**, with
   provenance (meta PMCID, figure id, CDN URL, extraction date) per the evidence
   contract — no datum without a locator.

**Recommendation:** run it corpus-wide on the ~18% dichotomous slice, gated on the
checksum. Treat the 12.7% continuous slice as a second, equally real prize (mean/SD
feeds SMD/MD synthesis directly). **Do not** build the registry-comparison lane
further until the ground-truth gap is closed.

---

## 8. Failure modes — measured, not imagined

Each was hit on real figures in this batch.

| # | Failure mode | Evidence | Handling |
|---|---|---|---|
| 1 | **Most plots print no counts** | 56.4% of study rows are effect+CI only | Not extractable. `forest_generic`; count fields null. **The dominant limit — a property of publishing, not of the model.** |
| 2 | **Multi-panel figures** | **21/36 figures** | Extract only per-study forest panels. Leave-one-out, funnel, LocusZoom, Kaplan-Meier panels excluded and named in `reading_notes`. |
| 3 | **Low-DPI raster — genuinely unreadable** | PMC12254995 Fig3: 9-panel montage, 778×958, glyphs ~5 px. Agent cropped + 8× upscaled: digits ambiguous (116/119, 140/160). | **Emitted 0 rows, `unreadable`.** The information is not in the pixels. Correct refusal. |
| 4 | **Forest-*styled* plots that are not trial meta-analyses** | Mendelian-randomisation panels (PMC12263005, PMC12338158 ×2): rows are exposure–outcome pairs; no study column, no weights, no diamond | `not_a_forest_plot` / `forest_generic`. Typing these as studies would inject phantom trials. |
| 5 | **Subgroup headers & subtotals interleaved with studies** | 85 headers + 64 subtotals + 66 totals + 72 heterogeneity lines vs 468 study rows — **44.2% of rows are not studies** | `row_type` is the schema's most important field. A subtotal typed as a study double-counts the pooled estimate as primary data; the checksum catches it. |
| 6 | **Forest-styled meta-REGRESSION plots** | PMC12422914 g003 "Forest of regressor": laid out exactly like a forest plot, but rows are covariates (Mean Age, Acupoints, Dose…) with a "% variance explained" column — no studies, no diamond | `not_a_forest_plot`, zero rows. **A pure layout trap** — nothing but semantics distinguishes it. |
| 6b | **Pre-post single-arm panels reusing between-arm subgroup labels** | PMC12527424: panel A is between-arm, panel B is Baseline-vs-Post with no control, and **panel B reuses panel A's subgroup names** ("Low Carbohydrate", "Mediterranean") | **Naive extraction silently merges them.** Agent appended "(panel B, pre-post)" to disambiguate. This one would corrupt a store quietly. |
| 7 | **Single-arm proportion meta-analyses** | PMC12336672 (TCA) | Counts to `events_t`/`n_t`, control fields null **by design** — not a missing-data error. |
| 8 | **Combined (non-per-arm) Events/N columns** | PMC12282900 | Arm fields nulled; printed pairs preserved verbatim in `reading_notes`. |
| 9 | **Errors in the published figure itself** | PMC12254995 Fig2 panels 2.2/2.3 **byte-identical** despite different outcome labels; PMC12216603 Fig2 heterogeneity line self-inconsistent (`Q=3.28; df=8 (p<0.001); I²=0%`); PMC12273372 Fig4 overall CI [0.32,1.23] crosses 1 while P=1.06E-08; PMC12372332 df disagrees with visible row count; **PMC12472900** "Chih-Chiang et al. (2008)" and "Chiu et al. (2008)" carry **byte-identical statistics** — almost certainly Chiu C-C entered **twice**, under given name and surname (a double-count *inside a published meta-analysis*) | **Transcribed as printed, flagged in notes.** *A difference from a published review is not an error — it is a candidate for adjudication.* **This is the 68k programme's error-signal appearing spontaneously, without being looked for.** |
| 10 | **Mislabelled column headers** | PMC12338158 g002: "outcome" column actually holds cohort source (UK Biobank/FinnGen/Meta) | Flagged in notes. |
| 11 | **Mixed measures across panels** | PMC12261593 Fig4 (A=RR, B=HR); PMC12402402 g001 (MD in A, OR in B/C); PMC12482262 Fig5 (Hedges in A, OR in B/C — the latter on **linear** axes, unusual for ORs) | Schema has one `effect_measure` per image — **a real schema limitation this batch exposed**; per-panel measure pushed into subgroup labels. **Fix before scaling: make `effect_measure` and `scale` per-row.** |
| 12 | **Native resolution can make a row arithmetically impossible** | PMC12399406 "Carydias 2022" reads as **0/84 vs 0/42 with a printed RR of 1.52** — impossible. At 3× upscale it is **1/84**. | **The arithmetic check caught a misread that a naive reader would have stored.** Upscaling is not optional on low-DPI figures; the check is what tells you when you need it. |
| 13 | **Outcome name usually absent from the image** | `outcome` null for **9 of 12** figures in chunk 2 — no caption in the image, no axis or column header naming it. No `timepoint` printed on **any** figure. | The outcome must come from the **JATS caption**, not the pixels. Any design assuming the image self-describes its outcome will produce unlabelled data. |
| 14 | **Pooled estimate rendered ON the heterogeneity line** | Stata-style templates (PMC12482262 Fig3/Fig5, PMC12527424 ×2): the diamond, CI and weight sit on the "Heterogeneity: tau²=…" line with no separate Subtotal row | Typed `subtotal`/`total` with the estimate attached. **A parser keying on a "Subtotal" label would miss the pooled estimate entirely.** |
| 15 | **Non-independent rows within one plot** | PMC12482262 Fig3: Pyle 2016 in two subgroups + split mt64-ND1/mt96-ND5 rows; Fig5 panel A: Dolle 2016 ×3, Bender 2006 ×2 | Flagged per figure. **Naive row-counting over-counts trials**; the unit is the trial, not the row. |

Row confidence across the batch: **high 422 · medium 44 · low 2** (468 study rows).
The low/medium rows are concentrated in the low-DPI figures — the model's
self-reported confidence tracked the real difficulty rather than being uniformly
optimistic, which is what makes `confidence` usable as a triage field.

---

## 9. Quality-improvement mandate — independent re-verification of sibling lanes

Re-measured from disk, not quoted from memory.

| Claim (source) | Independent measurement | Verdict |
|---|---|---|
| **68% of AACT's NCT↔PMID crosswalk is BACKGROUND** (`PLAN R2`: 744,555/1,087,352) | **744,555 / 1,087,352 = 68.5%** (BACKGROUND 68.5% · DERIVED 17.3% · RESULT 14.2%) | ✅ **CONFIRMED to the row.** Load-bearing for this lane's join too — accepting BACKGROUND would attach other trials' numbers to a forest row and manufacture "mismatches" that are really linking errors. |
| **Seed = 67,771 metas, ≥99% PMCID** (`PLAN §0`) | **67,772 rows** (+1 drift), **99.74% PMCID** | ⚠️ **Minor drift.** PMCID rate confirmed. |
| Seed PMCID uniqueness (implied by `sha256(pmcid)%2` sharding) | **20 duplicate PMCIDs** — byte-identical rows (same PMCID *and* PMID). Harvest ledger: **4,860 rows / 4,800 distinct = 60 re-fetches** | ⚠️ **Real but low-impact.** `ledger.py` dedups via a `seen_h` set, so **reported counts are correct**; the cost is wasted NCBI budget. `merge.py`'s guard is cross-node only and would not see a within-node duplicate — by design, and harmless given the ledger dedup. |
| **PLOS `<thead>` fix: "39 of 40 tables header-less → 37/40 after"** (`STATUS §5`) | Corpus-wide over 1,256 tables in 400 cached articles: old `<th>`-only logic **872/1,256 (69.4%)** → current **1,030/1,256 (82.0%)**. **Fix recovers 158 tables (12.6%)** | ⚠️ **Fix is real and correct; the headline magnitude does not replicate.** The 39/40 figure came from a 12-paper PLOS-heavy probe. Corpus-wide the effect is +12.6 points, not ~90. **A single-sample measurement generalised to the corpus.** |
| **143 poolable registry 2×2s** (this lane's brief) | **511** (`preextract.pc1.jsonl`, 2,417 rows) | ⚠️ **Brief was stale** (ledger has grown). |

### 9.1 Faults found in *my own* code — reported per the mandate

1. **Structural check manufactured its own failures.** The first cut summed *every*
   study row in a figure against *each* Total. On multi-panel figures (13/24) it
   compared panel B's Total (931) to the studies of panels A+B+C (15,839) and
   reported **4 MISMATCHes on figures that were read correctly** (PMC12254995).
   Fixed: totals are scoped to their subgroup, and an unscopable total is
   **skipped** (`scope_unknown`), never guessed at. After the fix: **0 mismatch,
   12 ok, 14 correctly skipped.** Pinned by
   `test_multipanel_total_is_not_compared_against_all_panels` and a companion test
   proving the single-panel check still bites.
2. **A query against columns that do not exist.** `registry_arm_counts` selected
   `trial_results.arm_title` / `.participants`. Neither exists. Removed and
   replaced with a documented statement of the ground-truth gap (§5.2) rather
   than a query that cannot run.
3. **A false alarm I must retract.** I briefly reported that `ledger.py` counts
   rows rather than distinct PMCIDs and therefore inflates coverage. **That is
   wrong** — it dedups via `seen_h`; I misread a grep excerpt that showed the
   counting lines without the guard above them. The ledger is sound.
4. **A fabricated test fixture, caught by my own checker.** `test_zero_cell_…`
   asserted a hand-invented OR of 0.06 for `0/50 vs 8/50`. The true 0.5-corrected
   value is **0.0495** (CI 0.0028–0.883) — 0.192 away on the log scale, past the
   0.15 tolerance — so the checker **failed my fixture, correctly**. Fixture
   replaced with derived values and the episode recorded in the test's docstring.

**Tests: 21 passing** (`tests/test_forestvision.py`), including RED tests proving
each gate can fail: a misread digit is caught, `arith_na` is never folded into
`ok` (an extractor returning nothing would otherwise score 100%), an ambiguous
label is refused rather than guessed, `Wang` does not match `Wangchuk`, and
`<fig-count>` is not a figure.

---

## 10. Honesty boundary

1. **No registry-validated accuracy number exists.** n=2, confounded by attrition.
   The brief's central ask could not be honestly delivered at this scale, and
   §5 says why rather than substituting a proxy.
2. **100% is on small, specific denominators** — 312 N cells (lower bound 98.8%)
   and 96 dichotomous rows (lower bound 96.2%), from **36 figures / 7 metas** for
   the checksum. It is **not** a corpus accuracy claim, and the figures are drawn
   from the registry-linked "gold" stratum, which may not represent the corpus.
3. **The checksum validates the N column**, not events, not the effect. **Events
   have no independent validator** in this design — the arithmetic check
   constrains them only where a printed effect exists to check against
   (96 of 468 rows). This is the largest remaining gap.
4. **58.6% coverage is a floor** (21,546 `unknown`-caption figures unadjudicated);
   the **24.8% 2×2 yield is from n=36 figures**. It moved from 18.0% → 24.8% when
   the sample grew from 24 → 36 figures, so **treat it as ±several points**, not a
   settled rate.
5. **~64,000 rows / ~15,900 2×2s / ~59M tokens are PLANNING-ONLY extrapolations**
   from n=36, not results.
6. **The `unreadable` and `not_a_forest_plot` classifications are the model's own**
   and were not independently adjudicated. A model that over-uses `unreadable`
   would look honest while quietly dropping recoverable data; the one full refusal
   here was spot-checked and justified (5-px glyphs), the rest were not.
7. Nothing pushed. Commits only.

---

## 11. Resume

```bash
python figscan.py                 # scan cached JATS -> figscan.<node>.jsonl   (idempotent)
python figscan.py --summary       # coverage, batch-actual
python figfetch.py --limit N      # resolve article -> CDN, fetch bytes, magic-byte checked
python forestscore.py             # checksum + arithmetic + registry scoring
python -m pytest tests/test_forestvision.py -q     # 21 tests
```

Every stage is checkpointed and resumes by set-difference on its ledger
(`figscan.<node>.jsonl`, `figfetch.<node>.jsonl`, `figresolve.jsonl` caches every
article→CDN resolution so a re-run costs no network). Vision outputs land in
`data/vision_out_*.json` and are scored offline — the scorer never calls a model,
so every number in §4/§6 is reproducible from files on disk.

**New files:** `figscan.py` · `figfetch.py` · `forestvision.py` · `refmatch.py` ·
`forestgold.py` · `forestscore.py` · `tests/test_forestvision.py`
