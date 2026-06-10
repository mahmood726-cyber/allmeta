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

## Honest verdict (answering "is it as good as published metas?")
- **Synthesis methodology:** at or ahead of typical published obesity NMAs (model-based
  dose-response + POTH + dual frequentist/NUTS-Bayesian + externally-validated extraction).
- **SR process:** not publication-grade *standalone* — but RapidMeta supplies the missing
  apparatus (search/screen/RoB-2/GRADE/CINeMA/PRISMA) with human attestation, off-the-shelf.
- **Therefore:** this project + a RapidMeta wrapper = a publication-grade dose-response NMA.
  The remaining work is process (run the screening, attest RoB-2/GRADE), not new method-building.
