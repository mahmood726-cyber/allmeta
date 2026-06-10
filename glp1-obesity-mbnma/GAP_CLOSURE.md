# Closing the gap to publication-grade — via RapidMeta's existing SR workflow

Earlier I listed what this dose-response NMA lacks vs a publishable systematic review.
Every one of those gaps is already built in **rapidmeta-kit** (read-only survey; not modified).
RapidMeta's pattern is **AI proposes -> human attests/corrects** — the human checks I described.

| Gap (vs published MA) | RapidMeta component | Human-in-the-loop |
|---|---|---|
| Multi-DB search beyond AACT | protocol + **search tab** (PubMed efetch) | analyst sets protocol/terms |
| Dual screening + PRISMA flow | `living-review.js` (auto-screen) + `prisma-flow.js` + `prisma-checklist.js` | **attest/correct each include/exclude** |
| Risk of bias (RoB-2) | `rob2-autofill.js` — 5 domains auto-filled from abstract+AACT, confidence-flagged | **attest/correct each domain** |
| Certainty of evidence | `grade-sof.js` (GRADE SoF) + `cinema-certainty.js` (CINeMA for NMA) | analyst rates down/up |
| Trustworthiness | `inspect-sr-panel.js` (INSPECT-SR — my advanced-stats rule) | reviewer judgement |
| Publication / small-study bias | `comparison-adjusted-funnel.js`, allmeta `egger.js` | interpret |
| Editable extraction + re-pool | editable extraction grid + live re-pooling | **attest each datum** |
| Cochrane/RevMan output | `cochrane-export.js` | — |
| Ranking + uncertainty | `nma-sucra.js` + `poth.js` (already used here) | — |

## How this project plugs in
- **What this repo already produced (the synthesis core):** registry-native AACT extraction
  of 57 trials / 150 arms, externally validated vs PubMed (validate_pubmed.md), a frequentist
  two-stage MBNMA + a NUTS-certified Bayesian MBNMA, POTH ranking, sensitivity network.
- **What RapidMeta wraps around it (the SR process):** PRISMA-tracked search+screening,
  RoB-2, GRADE/CINeMA, INSPECT-SR, publication-bias, Cochrane export — each with human attestation.
- **Bridge:** feed `arms_full.csv` (and the agent/dose/outcome contract) into a rapidmeta-kit
  config as the extraction table; the dose-response/NMA engine is shared (allmeta vendor modules
  are the same ones rapidmeta-kit bundles). The dashboard then renders screening->RoB->GRADE->PRISMA.

## WIRED + RUN (2026-06-10)
- `build_rapidmeta_config.py` mapped `arms_full.csv` -> `rapidmeta_config.json`
  (38 trials, 84 continuous arm-outcomes; md = active-placebo % weight change, se;
  rob = 'some-concerns' placeholders for human attestation via rob2-autofill).
- `clone.py` (rapidmeta-kit, UNMODIFIED; output written to this worktree) built
  `incretin_obesity_dashboard.html` (1.27 MB full interactive RapidMeta engine).
- `smoke_test.py` (headless Chrome): **PASS** — renders, 8 tabs, data visible,
  **0 SyntaxError/Uncaught**. (SEVERE logs are benign file:// fetch failures for
  optional benchmark/baseline JSONs; resolve over HTTP.)
- Result: the full attested SR workbench (Screening / RoB-2 / GRADE / CINeMA /
  PRISMA tabs) now wraps our extracted obesity dose-response cohort. Open the HTML
  to attest RoB-2 + rate GRADE; that is the remaining human-in-the-loop step.

## Integration status — definitive (2026-06-10)
Drove the dashboard headless through the attested workflow (walkthrough.py). Findings:
- **SR process runs + populates:** include -> Extract & Verify -> selecting an outcome
  (e.g. "tirzepatide 15 mg vs placebo") fills Study Characteristics with the 4 matching
  trials + RoB, and the heterogeneity engine computes (I2=0.0, Q df=3, tau2).
- **Pooled POINT estimate = NaN.** The only base template the kit ships is
  `template/base_dupilumab_copd.html` (BINARY); `clone.py` hard-codes it (no `--base`).
  The card pools "Risk Ratio" and needs event counts; our outcomes are CONTINUOUS
  (md/se). The base has continuous code (resolveEffectMeasure/isContinuous/poolWith) but
  it is not the default path for a cloned config, and realData lives in a separate object
  from `state.trials`, so headless forcing of MD pooling is not reliably reachable.
- **Conclusion:** a clean continuous MD pool needs a CONTINUOUS base template added to
  rapidmeta-kit (kit enhancement — out of scope; kit must not be modified here). Meanwhile
  the continuous dose-response synthesis is already done correctly by THIS repo's engine
  (`fit_network.py` two-stage + `pymc_mbnma.py` NUTS): pooled MD per node, ranking, POTH.
- **So the division of labour is:** RapidMeta = SR governance shell (screening/RoB-2/GRADE/
  CINeMA/PRISMA, runs on the data); this repo = the validated continuous-outcome synthesis.
  Unifying them = build a continuous base in the kit, then feed `arms_full.csv` as here.

## Honest verdict (answering "is it as good as published metas?")
- **Synthesis methodology:** at or ahead of typical published obesity NMAs (model-based
  dose-response + POTH + dual frequentist/NUTS-Bayesian + externally-validated extraction).
- **SR process:** not publication-grade *standalone* — but RapidMeta supplies the missing
  apparatus (search/screen/RoB-2/GRADE/CINeMA/PRISMA) with human attestation, off-the-shelf.
- **Therefore:** this project + a RapidMeta wrapper = a publication-grade dose-response NMA.
  The remaining work is process (run the screening, attest RoB-2/GRADE), not new method-building.
