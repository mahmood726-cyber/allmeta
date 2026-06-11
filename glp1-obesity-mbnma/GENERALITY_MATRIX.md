# Cross-class generality matrix — the engine across outcome TYPES

The strongest test of "is this a reusable engine?" is repointing across drug classes with **different outcome
types**, and checking that the methods give *class-appropriate, honest* findings rather than repeating one
class's verdict. Each repoint changed only the **drug list + outcome term**.

| Class | Outcome type | AACT scale | Distinctive method test | Result (honest) |
|---|---|---|---|---|
| **Incretins** (obesity) | continuous biomarker (% weight) | 273+ trials, full pipeline | surrogacy weight→CV | **Surrogate FAILS** (I²_HR=0%); weight is not a validated CV surrogate |
| **PCSK9i** (lipids) | continuous biomarker (% LDL-C) | 273 trials, 102 LDL | surrogacy LDL→MACE | **Surrogate direction VALIDATED** — same method *discriminates*, not rigged |
| **SGLT2i** (cardiorenal) | hard outcome (HF/CV HR) | 1165 trials, 18 HR | class-effect homogeneity | **Flags endpoint-definition heterogeneity** (I²=87% from pooling MACE vs HF-hosp vs renal); demands disaggregation by exact endpoint |
| **Psoriasis biologics** | binary responder (PASI-90 %) | 1377 trials, 130 PASI-90 | established efficacy hierarchy | **Reproduces IL-17/IL-23 > TNF** (mean 63% vs 33%; bimekizumab top 85%), matching the Sbidian Cochrane NMA — now **full-depth** (Bayesian PASI-90 league R̂=1.0000, P(IL-17/23>TNF)=1.000 + responders-gained/NNT transport + offline dashboard) |
| **Asthma biologics** | count/rate (annualised exacerbation IRR) | 640 trials, 26 with a rate ratio | rate-NMA + transitivity on baseline rate | **All 4 agents significantly reduce the exacerbation rate** (class IRR 0.70); but **flags** the raw cross-agent ranking (tezepelumab 0.47 > reslizumab 0.58 > benralizumab 0.74 > mepolizumab 0.80, I²=96%) as **effect modification** by baseline-rate / eosinophil enrichment — not a clean "best biologic" |
| **RA biologics/JAK** | ordinal / ordered-categorical (ACR20>50>70 ladder) | 171/157/145 trials (ACR20/50/70), 4275 arm×threshold rows | proportional-odds graded-response on the ordered ladder | **Fits the ordered ladder** with one latent efficacy per agent + shared ordered cutpoints (nutpie R̂=1.0000); class-level advanced-MoA ≥ TNF holds (P(IL-6/JAK>TNF)=0.91) but **flags** the cross-agent ranking as arm-level heterogeneity (proportional-odds residual RMSE=2.0; a TNF agent leads while the class-mean favours advanced-MoA) — not a clean "best agent", the ordinal echo of the asthma flag. Full-depth (Bayesian ACR league + ACR50 responders-gained/NNT transport + offline dashboard) |

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
- **Five classes are now full-depth proofs** (league + GRADE + transport + offline dashboard), spanning **all
  five outcome types** (continuous biomarker, survival/absolute-risk, count/rate, binary/responder, ordinal),
  and the league runs on a real **Bayesian draw matrix** (CrI + P(superiority)) in each:
  - **Class 2 (PCSK9), continuous-biomarker path** — (1) full pairwise LDL **league** with **GRADE/CINeMA
    certainty**, in **both** a frequentist form (`pcsk9_league.json`: 6 Moderate / 6 Low) and a **Bayesian
    draw-matrix** form (`pcsk9_league_bayes.json`: nutpie, R̂=1.00, heteroscedastic per-agent SD — same
    bococizumab ranking, more conservative certainty as it propagates real cross-trial heterogeneity); (2)
    **transport** (`pcsk9_transport.json`) % LDL → **absolute** lowering (mmol/L) in a NHANES elevated-LDL
    target (baseline 132 mg/dL; bococizumab −2.61 → inclisiran −1.99 mmol/L); (3) **offline dashboard**.
  - **Class 3 (SGLT2), hard-outcome / survival path** — (1) a **Bayesian** HF-hospitalisation **league**
    (`sglt2_league.json`, nutpie, R̂=1.00, draws → CrI + P(superiority)), on the **single HF-hospitalisation
    endpoint** which *resolves the I²=87% composite artifact* the class-3 core repoint flagged (canagliflozin
    0.67 lead; ertugliflozin k=1 → INSUFFICIENT); (2) **transport** (`sglt2_transport.json`) HR → **ARR +
    NNT** across baseline-risk targets (NNT ~242 primary-prevention → ~45 HFrEF); (3) **offline dashboard**.
  - **Class 5 (asthma), count/rate path** — (1) a **Bayesian** exacerbation-IRR **league** (`asthma_league.json`,
    nutpie, R̂=1.00, draws → CrI + P(superiority); tezepelumab 0.48 lead, class IRR 0.61); (2) **transport**
    (`asthma_transport.json`) IRR → **absolute exacerbations averted/patient-year** across severity targets
    (~0.32 moderate → ~1.38 frequent-exacerbator — where the baseline rate *is* the class-5 effect-modifier,
    made explicit); (3) **offline dashboard**.
  - **Class 4 (psoriasis), binary/responder path** — (1) a **Bayesian** PASI-90 responder **league**
    (`psoriasis_league.json`, nutpie, R̂=1.0000, hierarchical RE on the logit response → draws → response% CrI
    + **risk-difference (pp)** contrasts + P(superiority); bimekizumab 89% lead, reproduces **IL-17/IL-23 > TNF**
    with **P=1.000**); (2) **transport** (`psoriasis_transport.json`) response → **responders gained/100 + NNT**
    vs placebo (lead NNT ~1.18; honestly, PASI-90 placebo is low/stable so NNT is dominated by the large active
    response, not the baseline); (3) **offline dashboard**.
  - **Class 6 (RA), ordinal / ordered-categorical path** — (1) a **Bayesian proportional-odds graded-response**
    **league** (`ra_league.json`, nutpie, R̂=1.0000) on the ACR20>50>70 ladder: one latent efficacy per agent +
    three shared ordered cutpoints (logit P[reach L] = θ_a − τ_L) → latent draw matrix → **log-OR** contrasts +
    P(superiority) + predicted ACR50%; class-level advanced-MoA ≥ TNF holds (P(IL-6/JAK>TNF)=0.91) but the
    engine **flags** the cross-agent ranking as arm-level heterogeneity (proportional-odds residual RMSE=2.0 —
    a TNF agent leads while the class-mean favours advanced-MoA), not a clean winner; (2) **transport**
    (`ra_transport.json`) predicted ACR50 → **responders gained/100 + NNT** vs placebo across MTX-dependent
    placebo backgrounds (the baseline moves the NNT, unlike psoriasis); (3) **offline dashboard**.
- This proves the depth stages port across **all five outcome types** (continuous biomarker, survival/absolute-
  risk, count/rate, binary/responder, ordinal), and that the league upgrades to a real Bayesian draw matrix in
  every full-depth class.
- Every class result is registry-native (AACT) and honestly bounded (small k where noted; demonstration, not
  a systematic review).

## Verdict
**A reusable, outcome-type-general engine.** Repointing across continuous-biomarker, lipid, hard-outcome,
binary-responder, count/rate, and ordinal classes took a drug list and an outcome term, and produced coherent
syntheses plus *class-appropriate, self-flagging* method behaviour. The system is not a bespoke incretin
analysis; its methods answer to the evidence in each class — and the depth stages (league + GRADE + transport +
dashboard) port end-to-end across **five** classes spanning all five outcome types (continuous-biomarker,
survival/absolute-risk, count/rate, binary/responder, ordinal), with the league running on a real **Bayesian
draw matrix** in each, and all of them now wired into `run_all.py` (stages C2–C6). See
`class2_pcsk9/GENERALITY.md` (+ `pcsk9_league` freq + `pcsk9_league_bayes` + `pcsk9_transport` +
`pcsk9_dashboard.html`), `class3_sglt2/` (`sglt2_results.json` core + `sglt2_league.json` Bayesian +
`sglt2_transport.json` + `sglt2_dashboard.html`), `class4_psoriasis/` (`psoriasis_results.json` core +
`psoriasis_league.json` Bayesian + `psoriasis_transport.json` + `psoriasis_dashboard.html`), `class5_asthma/`
(`asthma_results.json` core + `asthma_league.json` Bayesian + `asthma_transport.json` + `asthma_dashboard.html`),
`class6_ra/` (`ra_results.json` core + `ra_league.json` Bayesian proportional-odds + `ra_transport.json` +
`ra_dashboard.html`).
