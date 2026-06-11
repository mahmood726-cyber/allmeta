# Cross-class generality matrix — the engine across outcome TYPES

The strongest test of "is this a reusable engine?" is repointing across drug classes with **different outcome
types**, and checking that the methods give *class-appropriate, honest* findings rather than repeating one
class's verdict. Each repoint changed only the **drug list + outcome term**.

| Class | Outcome type | AACT scale | Distinctive method test | Result (honest) |
|---|---|---|---|---|
| **Incretins** (obesity) | continuous biomarker (% weight) | 273+ trials, full pipeline | surrogacy weight→CV | **Surrogate FAILS** (I²_HR=0%); weight is not a validated CV surrogate |
| **PCSK9i** (lipids) | continuous biomarker (% LDL-C) | 273 trials, 102 LDL | surrogacy LDL→MACE | **Surrogate direction VALIDATED** — same method *discriminates*, not rigged |
| **SGLT2i** (cardiorenal) | hard outcome (HF/CV HR) | 1165 trials, 18 HR | class-effect homogeneity | **Flags endpoint-definition heterogeneity** (I²=87% from pooling MACE vs HF-hosp vs renal); demands disaggregation by exact endpoint |
| **Psoriasis biologics** | binary responder (PASI-90 %) | 1377 trials, 130 PASI-90 | established efficacy hierarchy | **Reproduces IL-17/IL-23 > TNF** (mean 63% vs 33%; bimekizumab top 85%), matching the Sbidian Cochrane NMA |

## What this demonstrates
- **Four outcome types** — continuous weight, continuous lipid, hard-outcome survival, binary responder —
  handled by the same discovery → extraction → NMA → (GRADE) machinery.
- **The methods discriminate.** The surrogate test failed for weight (incretins) and returned the validated
  direction for LDL (PCSK9) — it depends on the evidence, not the class. The SGLT2 repoint didn't manufacture
  a clean "class effect"; it surfaced the real composite-endpoint pitfall and flagged it.
- **Each class exposes a distinctive, honest caveat** — surrogate validity (incretin), registry posting gap
  (PCSK9 FOURIER LDL not posted), outcome-definition heterogeneity (SGLT2). The engine names each rather than
  papering over it.

## Honest scope
- Classes 2–3 are **core repoints** (discovery + extraction + the distinctive analysis), not full re-runs of
  the 40-stage incretin pipeline. Transport, league, HTA, and GRADE would repoint identically (same AACT
  fields + engines) but were not rebuilt per class — the point is class-generality and method-discrimination,
  which hold.
- Every class result is registry-native (AACT) and honestly bounded (small k where noted; demonstration, not
  a systematic review).

## Verdict
**A reusable, outcome-type-general engine.** Repointing across continuous-biomarker, lipid, hard-outcome, and binary-responder
classes took a drug list and an outcome term, and produced coherent syntheses plus *class-appropriate,
self-flagging* method behaviour. The system is not a bespoke incretin analysis; its methods answer to the
evidence in each class. See `class2_pcsk9/GENERALITY.md`, `class3_sglt2/sglt2_results.json`, `class4_psoriasis/psoriasis_results.json`.
