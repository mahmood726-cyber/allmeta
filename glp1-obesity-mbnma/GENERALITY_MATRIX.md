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
| **Asthma biologics** | count/rate (annualised exacerbation IRR) | 640 trials, 26 with a rate ratio | rate-NMA + transitivity on baseline rate | **All 4 agents significantly reduce the exacerbation rate** (class IRR 0.70); but **flags** the raw cross-agent ranking (tezepelumab 0.47 > reslizumab 0.58 > benralizumab 0.74 > mepolizumab 0.80, I²=96%) as **effect modification** by baseline-rate / eosinophil enrichment — not a clean "best biologic" |

## What this demonstrates
- **Five outcome types** — continuous weight, continuous lipid, hard-outcome survival, binary responder, and
  count/rate (incidence-rate ratio) — handled by the same discovery → extraction → NMA → (GRADE) machinery.
- **The methods discriminate.** The surrogate test failed for weight (incretins) and returned the validated
  direction for LDL (PCSK9) — it depends on the evidence, not the class. The SGLT2 repoint didn't manufacture
  a clean "class effect"; it surfaced the real composite-endpoint pitfall and flagged it. The asthma repoint
  found a real, significant rate reduction for every agent yet refused to read a "best biologic" off a league
  confounded by baseline-rate effect modification.
- **Each class exposes a distinctive, honest caveat** — surrogate validity (incretin), registry posting gap
  (PCSK9 FOURIER LDL not posted), outcome-definition heterogeneity (SGLT2), and rate-ratio effect modification
  by baseline rate / eosinophil enrichment (asthma). The engine names each rather than papering over it.

## Honest scope
- Classes 4–5 are **core repoints** (discovery + extraction + the distinctive analysis), not full re-runs of
  the 40-stage incretin pipeline. Transport, league, HTA, and GRADE would repoint identically (same AACT
  fields + engines) but were not rebuilt per class — the point is class-generality and method-discrimination,
  which hold.
- **Two classes are now full-depth proofs** (league + GRADE + transport + offline dashboard):
  - **Class 2 (PCSK9), continuous-biomarker path** — (1) full pairwise LDL **league** with **GRADE/CINeMA
    certainty** (`pcsk9_league.json`, same domains as `nma_league.py`: 6 Moderate / 6 Low / 12 comparisons,
    bococizumab lead); (2) **transport** (`pcsk9_transport.json`) mapping % LDL reduction → **absolute**
    lowering (mmol/L) in a real NHANES elevated-LDL target (baseline 132 mg/dL; bococizumab −2.61 → inclisiran
    −1.99 mmol/L); (3) **offline dashboard** (`pcsk9_dashboard.html`). Honest bound: frequentist normal
    contrast (no Bayesian draws for this class); transport assumes the % reduction is population-transportable.
  - **Class 3 (SGLT2), hard-outcome / survival path** — (1) a **Bayesian** HF-hospitalisation **league**
    (`sglt2_league.json`): hierarchical RE on log-HR (nutpie, R̂=1.00) with every contrast from a **posterior
    draw matrix** (CrI + P(superiority)), restricted to the **single HF-hospitalisation endpoint** which
    *resolves the I²=87% composite artifact* the class-3 core repoint flagged (canagliflozin 0.67 lead;
    ertugliflozin k=1 → INSUFFICIENT); (2) **transport** (`sglt2_transport.json`) HR → **ARR + NNT** across
    baseline-risk targets (NNT swings ~242 primary-prevention → ~45 HFrEF, the baseline-risk message); (3)
    **offline dashboard** (`sglt2_dashboard.html`). This proves the depth stages port across *outcome types*
    (continuous biomarker **and** survival/absolute-risk), and that the league upgrades to a real Bayesian
    draw matrix.
- Every class result is registry-native (AACT) and honestly bounded (small k where noted; demonstration, not
  a systematic review).

## Verdict
**A reusable, outcome-type-general engine.** Repointing across continuous-biomarker, lipid, hard-outcome,
binary-responder, and count/rate classes took a drug list and an outcome term, and produced coherent syntheses
plus *class-appropriate, self-flagging* method behaviour. The system is not a bespoke incretin analysis; its
methods answer to the evidence in each class — and the depth stages (league + GRADE + transport + dashboard)
port end-to-end across **two** classes spanning a continuous-biomarker and a survival/absolute-risk outcome,
with the SGLT2 league running on a real Bayesian draw matrix. See `class2_pcsk9/GENERALITY.md` (+ `pcsk9_league`,
`pcsk9_transport`, `pcsk9_dashboard.html`), `class3_sglt2/` (`sglt2_results.json` core + `sglt2_league.json`
Bayesian depth + `sglt2_transport.json` + `sglt2_dashboard.html`), `class4_psoriasis/psoriasis_results.json`,
`class5_asthma/asthma_results.json`.
