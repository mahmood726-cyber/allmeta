# Cardiometabolic generality — the engine on the obesity flagship's two siblings

> **Scope note (2026-06-12):** This repo is a **GLP-1/GIP obesity dose-response NMA** (see `SPEC.md`). The
> generality repoints are deliberately restricted to the **two cardiometabolic siblings** of the obesity
> flagship — **PCSK9** (lipids) and **SGLT2** (cardiorenal) — both of which GLP-1 agents directly affect and
> which sit in the same metabolic neighbourhood as obesity. Three earlier immunology repoints (psoriasis /
> asthma / RA) and an off-topic diagnostic-test-accuracy class were **removed** to keep the repo focused on the
> obesity question (see `DTA_CLASS_REVERTED.md` and the audit in the commit history). What remains is not a
> "general engine across all of medicine" claim — it is the obesity NMA plus two genuinely adjacent
> cardiometabolic cross-checks.

The point of keeping PCSK9 and SGLT2 is a *discrimination* test: the same registry-native pipeline, repointed by
changing only the **drug list + outcome term**, should give class-appropriate, honest findings — not repeat the
obesity verdict, and not manufacture a clean winner where the evidence is mixed.

| Class | Outcome type | AACT scale | Distinctive method test | Result (honest) |
|---|---|---|---|---|
| **Incretins** (obesity) — *the project* | continuous biomarker (% weight) | 273+ trials, full pipeline | surrogacy weight→CV | **Surrogate FAILS** (I²_HR=0%); weight is not a validated CV surrogate |
| **PCSK9i** (lipids) | continuous biomarker (% LDL-C) | 273 trials, 102 LDL | surrogacy LDL→MACE | **Surrogate direction VALIDATED** — the *same* method discriminates (LDL is a validated surrogate, weight is not), so it is not rigged |
| **SGLT2i** (cardiorenal) | hard outcome (HF/CV HR) | 1165 trials, 18 HR | class-effect homogeneity | **Flags endpoint-definition heterogeneity** (I²=87% from pooling MACE vs HF-hosp vs renal); demands disaggregation by exact endpoint |

## What this demonstrates
- **The methods discriminate, they don't pattern-match.** The surrogate test *failed* for weight (incretins)
  and returned the *validated* direction for LDL (PCSK9) — the verdict depends on the evidence, not the class.
  The SGLT2 repoint did not manufacture a clean "class effect"; it surfaced the real composite-endpoint pitfall
  and flagged it, then resolved it by restricting to one exact endpoint (HF hospitalisation).
- **Drug-name harvesting, not keyword dragnet.** Each repoint searches AACT by specific drug name
  (evolocumab/alirocumab/inclisiran/bococizumab; empagliflozin/dapagliflozin/…), so the cohort cannot be
  contaminated by off-topic conditions — the failure mode that sank the removed DTA class.

## Full-depth slices (both kept classes)
Each kept class carries the same depth stages as the incretin flagship — league + GRADE/CINeMA certainty +
transport + offline dashboard — and the league runs on a real **Bayesian draw matrix** (CrI + P(superiority)):
- **Class 2 (PCSK9), continuous-biomarker path** — full pairwise LDL **league** with GRADE/CINeMA certainty in
  **both** a frequentist (`pcsk9_league.json`) and a **Bayesian draw-matrix** form (`pcsk9_league_bayes.json`,
  nutpie R̂=1.00, heteroscedastic per-agent SD — bococizumab lead, more conservative certainty as it propagates
  cross-trial heterogeneity); **transport** (`pcsk9_transport.json`) % LDL → absolute lowering (mmol/L) in a
  NHANES elevated-LDL target; **offline dashboard**. RapidMeta workbench conversion (continuous md/se).
- **Class 3 (SGLT2), hard-outcome / survival path** — a **Bayesian** HF-hospitalisation **league**
  (`sglt2_league.json`, nutpie R̂=1.00) on the **single HF-hospitalisation endpoint**, which resolves the
  I²=87% composite artifact the core repoint flagged (canagliflozin lead; ertugliflozin k=1 → INSUFFICIENT);
  **transport** (`sglt2_transport.json`) HR → ARR + NNT across baseline-risk targets (NNT ~242 primary-
  prevention → ~45 HFrEF); **offline dashboard**. RapidMeta workbench conversion (survival HR).
- Every result is registry-native (AACT) and honestly bounded (small k where noted; demonstration-grade
  cross-checks, not full systematic reviews). Class-level external validation against PubMed-verified published
  NMAs (Jiang 2025 for PCSK9, Tsapas 2020 for SGLT2) is in `class_concordance.py` → `class_concordance.json`
  (2/2 concordant).

## Verdict
**The obesity engine is not bespoke — but the claim is now appropriately modest.** Repointing onto its two
cardiometabolic siblings (lipids, cardiorenal) took a drug list and an outcome term and produced
class-appropriate, self-flagging behaviour: a *failed* surrogate test for weight vs a *validated* one for LDL,
and an honestly-flagged composite-endpoint pitfall for SGLT2. That is the right scope for an obesity NMA — two
adjacent cross-checks that stress-test the method without pretending to be a general-purpose evidence engine.
See `class2_pcsk9/GENERALITY.md`, and the league/transport/dashboard JSONs in `class2_pcsk9/` and `class3_sglt2/`.
