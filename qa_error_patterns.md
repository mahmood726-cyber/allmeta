# RapidMeta QA — Error-Pattern Catalog (data vs PUBLISHED sources)

**Audit type:** data-integrity audit. Verifies that the *numbers* embedded in
RapidMeta apps match their cited published sources. The pooling *math* was
already validated to ≤1e-6 vs R (`benchmark/rapidmeta-validation/REPORT.md`) —
but that validation ran the reference engines on the **embedded** data, so it
proves engine==engine, **not** data==published. This audit closes that GIGO gap,
and it found the gap is real (see `smoking`).

**Method:** for each dataset with a published comparator that R reproduces
exactly (`metafor::dat.bcg`, `metafor::dat.egger2001`, `netmeta::smokingcessation`,
`metadat::dat.colditz1994`), diff every study-level value and re-derive the
pooled/network result independently in R. Truth-first: a value is only
CORRECTED when the right value is provable from the published source; otherwise
it is FLAGGED for manual review. Scripts: `benchmark/rapidmeta-validation/qa_*.R`.
Reference: R 4.6.0 metafor / netmeta / meta / metadat. Started 2026-06-24.

---

## Pattern catalog (recurring error types)

### P1 — Sampling-variance (vi) inconsistent with its own effect size  ★ most common
`yi` matches the published value exactly but the paired `vi` does not. Because
`vi` is a deterministic function of the same 2×2 counts that yield `yi`, a
matching `yi` with a mismatched `vi` is provably a transcription error — and it
mis-weights that study (here up to ~10×). **Occurrences:** ≥10 study-rows across
3 datasets (canonical `bcg` ×2; Pairwise-Pro `bcg` yi/vi ×6+; the same trials
recur). **Apps:** canonical `bcg` (→19 hero-example consumers), Pairwise-Pro.

### P2 — Wrong study-level metadata (year)
Identifier/metadata transcribed wrong while effect data is right. Canonical
`bcg` "Comstock & Webster" year **1956**→**1969**; Pairwise-Pro "TPT Madras
(1968)"→**1980**. **Occurrences:** 2. **Apps:** canonical `bcg`, Pairwise-Pro.

### P3 — Multi-arm studies silently collapsed to 2-arm (dropped arms)
Published 3-arm trials stored as a single 2-arm contrast, third arm dropped.
`netmeta::smokingcessation` has **2 three-arm studies** (28 pairwise contrasts
from 24 studies); embedded `smoking` has **0** (24 contrasts, df=21 vs 23).
**Occurrences:** 2 studies. **Apps:** canonical `smoking` → NMA hero/demo.

### P4 — Treatment labels scrambled across studies (NMA)  ★ highest severity
Arm event/n numbers trace to real studies, but the treatment **names** are
mis-assigned, so contrasts are wrong. Embedded `smoking` "Individual vs No
contact" RE OR=2.448 actually reproduces the published **Group** effect (2.465);
true Individual=2.082, Self-help 1.167 (pub 1.516), Group 1.837 (pub 2.465).
Every league cell / ranking / SUCRA flips. **Occurrences:** ~18/24 smoking
studies. **Apps:** canonical `smoking`. (Same scramble class also corrupts
HTA `bcgVaccine` and Pairwise-Pro `bcg` positions 8–13 — effects misaligned to
labels.)

### P5 — Phantom / corrupted duplicate studies
A published study appears twice — once correct, once with a corrupted count.
Smoking: S13 `95/1107,134/1031` corrupts S22's `…,143/1031` (134≠143);
S14 `15/187,35/504` corrupts S23's `…,36/504` (35≠36); S15/S24 both carry
`78/584,73/675`; S21 `8/552,19/583` matches **no** published smoking study
(origin unverified — FLAGGED). Pairwise-Pro 2×2 subset: 6th row "Comstock 1974"
= `180/16913,372/17854` is a Frankenstein (Stein's events on wrong N; correct
Colditz Comstock-1974 = `186/50634,141/27338`). **Apps:** canonical `smoking`,
Pairwise-Pro.

### P6 — Missing published studies
Real published studies absent. Four published smoking studies have no embedded
counterpart (`20/49 vs 16/43` B–C; `7/66 vs 32/127` B–D; `12/76 vs 20/74` C–D;
`9/55 vs 3/26` C–D). With P5 the embedded k=24 coincidentally equals published
k=24 while containing different studies. **Apps:** canonical `smoking`.

### P7 — False "verified" provenance claim
A dataset labelled as verified against a reference it does not match.
Pairwise-Pro `bcg` block is tagged `source: '…Verified: metafor 4.4-0'` and the
app advertises a BCG R-validation / "100% pass", yet its yi/vi are wrong
(P1+P4). The provenance label asserts correctness it doesn't have.
**Apps:** Pairwise-Pro.

---

## Datasets audited (detail)

| Dataset (app) | Comparator | Result |
|---|---|---|
| canonical `bcg` | metafor::dat.bcg | **FAIL→FIXED**: Ferguson vi 0.0786→0.1946; Rosenthal-1960 vi 0.0408→0.4154; Comstock&Webster year 1956→1969. Pooled REML RR 0.4685→0.4894. (P1,P2) |
| canonical `smoking` | netmeta::smokingcessation | **FAIL (Critical)**: P3+P4+P5+P6. Network ORs wrong (see P4). Corrected dataset staged at `benchmark/rapidmeta-validation/smoking_corrected_arms.json`; deferred to coordinate with live NMA-render session (multi-arm encoding path). |
| review-project `magnesium` | metafor::dat.egger2001 | **PASS**: all 9 trials exact. Pooled FE-OR with ISIS-4=1.028, without=0.644 — consistent with the publication-bias lesson. |
| review-project `cortico` (CD004661) | Cochrane CD004661.pub4 | **PASS (internal)**: re-derived FE-OR 0.957 [0.799,1.145] = app's stated "0.96 [0.80,1.15]". Per-trial vs Cochrane PDF not independently checked (.rda not in repo) — low-priority FLAG. |
| review-project `htn` (CD000028) | Cochrane CD000028.pub4 | **PASS (internal)**: FE-OR 0.891 [0.820,0.968], I²=0%, internally consistent. Per-trial source FLAG (low). |
| HTA `bcgVaccine` | metafor::dat.bcg / Colditz1994 | **FAIL**: effects misaligned to labels (e.g. "Aronson" carries −1.62/0.44 = Vandiviere; values −1.56,−0.54,−0.39,−0.19 match no BCG study; several latitudes wrong; pos12/13 mislabelled). Exact correct effect/se/lat known (P1,P4). CORRECTABLE — deferred (avoid stale-variant edit; log has values). |
| Pairwise-Pro `bcg` (yi/vi) | metafor::dat.bcg | **FAIL**: 6+ wrong vi; yi pos8–13 scrambled; names shifted; TPT year 1968; false "Verified" tag. CORRECTABLE — deferred (separate sub-project w/ own edit conventions; exact values in log). (P1,P2,P4,P7) |
| Pairwise-Pro `bcg` 2×2 (6-study) | metafor::dat.colditz1994 | **PARTIAL FAIL**: trials 1–5 exact; trial 6 Frankenstein (P5). CORRECTABLE — deferred. |
| canonical `thrombolytics` (Boland 2003) | none built-in | **FLAG**: no R/text comparator available; needs HTA 7:1-136 / Dias TSD2 PDF. |
| canonical `eltrombopag` (Stijnen 2010) | none built-in | **FLAG**: needs Stijnen 2010 Table 1. |
| canonical `sequential_demo`, `subgroup_demo` | — | Out of scope: explicitly synthetic, no ground truth (NOT counted as failures). |

---

## Scoreboard

Four checks per the brief: **Trials** (right studies), **Data** (right numbers),
**Display** (multipersona usability — *not assessed this data-focused pass*),
**Analysis** (pooled/network reproduces published).

| # | App / dataset | Comparator | Trials | Data | Analysis | Severity | Status |
|---|---|---|---|---|---|---|---|
| 1 | canonical `bcg` | dat.bcg | PASS | FAIL→**FIXED** | FAIL→**FIXED** | High | applied |
| 2 | canonical `smoking` | netmeta::smokingcessation | FAIL | FAIL | FAIL | **Critical** | staged+flag |
| 3 | review-project `magnesium` | dat.egger2001 | PASS | **PASS** | **PASS** | — | clean |
| 4 | review-project `cortico` | Cochrane CD004661 | PASS | PASS(int) | **PASS** | Low | clean* |
| 5 | review-project `htn` | Cochrane CD000028 | PASS | PASS(int) | **PASS** | Low | clean* |
| 6 | HTA `bcgVaccine` | dat.bcg | FAIL | FAIL | FAIL | High | flag (correctable) |
| 7 | Pairwise-Pro `bcg` (yi/vi) | dat.bcg | FAIL | FAIL | FAIL | High | flag (correctable) |
| 8 | Pairwise-Pro `bcg` 2×2 | dat.colditz1994 | PASS | FAIL(1 row) | FAIL | Medium | flag (correctable) |
| 9 | canonical `thrombolytics` | — | ? | ? | ? | Unknown | flag (no comparator) |
| 10 | canonical `eltrombopag` | — | ? | ? | ? | Unknown | flag (no comparator) |

\* per-trial source not in-repo; pooled result reproduces the app's stated value.

**Counts (this pass):** datasets checked **10** · clean **3** · failed **5**
(+2 unverifiable flagged) · **corrected & applied 1 dataset (3 values + 1 fixture)**
· staged-for-coordination **1** (smoking) · correctable-but-deferred **3** (HTA bcg,
Pairwise bcg ×2) · flagged-needs-manual **3** (thrombolytics, eltrombopag, smoking-S21).

See `qa_master_correction_log.csv` for every field-level wrong→right with source.
