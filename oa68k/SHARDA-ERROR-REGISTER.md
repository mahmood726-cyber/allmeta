# Shard-A error register — what the plots themselves reveal

**2026-07-16.** Candidates surfaced while reading 64 forest figures with vision.
Every entry is keyed to an `image_sha256` in `data/visionstore/calls.shard-A.jsonl`;
the full verbatim reading lives in that record's `raw_response`.

**Two tiers, and the difference is not cosmetic.** CONFIRMED means *I opened the
image and checked it myself*. CANDIDATE means a reading worker flagged it and
nobody has independently checked it. A candidate is a lead, not a result. Do not
cite a candidate as a finding.

---

## CONFIRMED-1 — a published DTA figure prints the same panel twice; the sensitivity plot does not exist

**PMC12784543**, `12936_2025_5680_Fig3_HTML.jpg` — malaria diagnostic-test
accuracy meta-analysis, 15 studies.

The caption states:

> "Forest plots displaying pooled sensitivity (A) and specificity (B) … A
> (sensitivity) illustrates the true positive rate of the diagnostic tests,
> whereas (B) (specificity) displays the true negative rate."

Both panels are the **same specificity plot**. Verified directly against the
pixels — panels A and B agree on every one of these:

    column header      "Specificity (95% CI)"        both panels
    x-axis label       "Specificity"                 both panels
    pooled line        "Pooled Specificity = 0.82 (0.80 to 0.83)"
    heterogeneity      "Chi-square = 636.87; df = 14 (p = 0.0000)"
    inconsistency      "I-square = 97.8 %"
    study estimates    all 15 identical (Abiodun 0.82 … Sheyin 0.98)

**No sensitivity data appears anywhere in the image.** For a DTA review,
sensitivity is half the result — it is missing from the figure that claims to
show it.

**Why this one matters beyond the paper.** A caption-trusting extractor reads
"A = sensitivity", takes panel A's numbers, and emits **specificity values as
sensitivity**. Pooled Se and Sp both become 0.82. Nothing downstream can detect
it: the numbers are internally consistent, in range, and carry a plausible I².
This is a silent corruption that a text/caption pipeline cannot see and vision
catches for free — the figure contradicts its own caption, and only the pixels
know.

Bivariate/HSROC models fitted on that pair would be fitted on a duplicated
margin. Per the standing DTA rule, threshold effects are assessed on
corr(logit(Se), logit(1-Sp)); with Se := Sp that correlation is an artefact.

---

## CANDIDATES — flagged by a reading worker, NOT independently verified

Each is stored verbatim in the cited record's `reading_notes`. Listed so they are
findable, not so they can be quoted.

| # | Record | Flag |
|---|---|---|
| C-1 | PMC12584374 `Fig3` | Marso 2016 prints `1.11 (1.07, 1.61)` — the point estimate is not centred in its own CI on a log scale. Worker re-read at 5x to exclude an OCR misread of `1.31`; printed digits read `1.11`. |
| C-2 | PMC11545497 `Fig4` | Kenya subtotal `0.64 [0.19, 1.09]` — upper bound exceeds 1 for a **proportion**. Rwanda `0.55 [0.16, 0.95]` similarly wide. |
| C-3 | PMC11545497 `Fig4` | Zambia subtotal prints Stata missing-value dots (`I² = .%, p = .`) yet still yields a CI (0.52, 0.57) **narrower than either contributing study's CI** — anomalous for a 2-study pool. |
| C-4 | PMC12294781 | 11 rows from 4 studies: each study contributes 1yr/2yr/3yr rows **plus its own "overall" row**, and Q(10) shows all 11 were pooled as independent — a pooled estimate double-counted alongside its own components. |
| C-5 | PMC12294781 | Mosha 2024 prints all four 2x2 cells as **0** yet carries RD −0.08 [−6.90, 6.73] and weight 0.17% — internally impossible. |
| C-6 | PMC12837111 `Fig4` panel D | Degenerate pooled CI `1.00 [0.00; 1.00]` while all five contributing rows are ~1.00 with tight CIs — likely complete separation. |
| C-7 | PMC12837111 `Fig3` panel D | I² = 7.7% (p = 0.3682) printed alongside τ² = 1.7882 — hard to reconcile. |
| C-8 | PMC12582816 `g005` | Panels B and C print the **same SE (0.2069)** for Zhou H 2024 under different log[HR] values. |
| C-9 | PMC12602456 | Same alteplase arms (330/329) labelled "Hill et al **2025**" in g002 but "**2020**" in g005/g006; in g002 the row label says 2025 while its own Year column prints 2020. |
| C-10 | PMC12590296 panel C | Columns headed "Total experimental **events**, No." hold **arm sizes** (357 of 484). Header contradicts contents. |
| C-11 | PMC12784543 `Fig5` | Caption says "diamond symbols indicate each study's estimated DOR"; in the image studies are **squares** and the lone diamond is the **pooled** estimate. A caption-driven parser would ingest the pooled diamond as a study row. |
| C-12 | PMC11201327 `Fig17` | **Verified against the pixels.** Pools k=2 — Tesfaye 2021 OR 3.09 (1.92, 4.97) and Feleke 2019 OR 0.41 (0.34, 0.51), whose CIs do not overlap and point opposite ways — into Overall 1.12 (0.15, 8.04) at **I² = 98.3%, p = 0.000**. A pooled estimate from two studies that disagree this completely carries no information; the CI spans a 50-fold range. Standing rule: never DerSimonian-Laird at k<10. The figure also declares a `% Weight` column and prints no weights, so the weight checksum is unavailable. |
| C-13 | PMC13141270 `Fig8` | Prints `tau² = 0.00, I² = 100.00%, H² = 336872.22` beside `Q(4) = 16.47` — mutually impossible (Q=16.47 on df=4 implies I² ≈ 76%; tau²=0 implies I² = 0%). The weight checksum passes exactly (100.00), so the *reading* is corroborated and the defect is in the published heterogeneity block. |
| C-14 | PMC12548209 `Fig2` | Prints `I-squared = 1.00` on a **fraction scale, not %** — a parser emits `i2_pct = 1.0` (meaning 1%) when the true value is 100%. Also prints effect sizes ~5–10.4 for **ITN utilization**, a proportion that cannot exceed 1. The worker left `i2_pct` null rather than convert. |

---

## The pattern across all of them

**Not one of these is detectable from the paper's text.** They are contradictions
between a figure and its caption, or a figure and its own arithmetic. The corpus
has been mined for text; these live only in the pixels.

And note which way the errors run: **captions lie about figures** (CONFIRMED-1,
C-11, C-10), and **figures fail their own internal arithmetic** (C-2, C-3, C-5,
C-6, C-7). Both classes are invisible to a pipeline that trusts a caption and
never recomputes.

## What must not happen next

- **Do not promote a candidate to a finding without opening the image.** The one
  entry that survived that step (CONFIRMED-1) started as a worker flag too, and
  a different worker flag in the same run turned out to be *our own misread*, not
  the paper's error (see `SHARDA-FINDING-confidence-vs-checksum.md`: `n_c` 174 vs
  149, emitted at `confidence: "high"`).
- **Do not correct the ledger.** These records are evidence of what the model
  said about what the paper printed. Corrections belong in an analysis layer keyed
  on `image_sha256`.
