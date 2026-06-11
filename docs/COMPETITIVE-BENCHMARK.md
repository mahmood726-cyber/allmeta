# allmeta — competitive benchmark & improvement roadmap

> Drafted 2026-06-10. Competitor capabilities grounded in current (2025–26)
> public sources (cited at the bottom); allmeta capabilities grounded in the
> repo (`hub/projects.js`, the `sr-*` pipeline, `shared/`). Honest by design:
> where a competitor leads, it says so; where allmeta overclaims, it doesn't.

## 1. What allmeta is today

113 internal browser-only apps (see `hub/projects.js` for the live count). Category weight:

| Area | Apps | Notes |
| --- | --- | --- |
| Evidence synthesis / pooling | 40 + 15 | pairwise, multilevel, multivariate, dose-response, rare-events… |
| Network meta-analysis | 13 | incl. component-NMA, multiplicative-NMA, inconsistency, CINeMA |
| Publication / reporting bias | 8 | Egger/Peters, PET-PEESE, trim-fill, copas, limit-MA, ROB-ME |
| Risk of bias | 7 | RoB2, ROBINS-I, INSPECT-SR, living RoB pool |
| Sensitivity / heterogeneity | 6 + 5 | GOSH, influence, spec-collapse, leave-one-out |
| SR pipeline | — | Design → Search → Screen → Extract → RoB → Synthesis → GRADE → Report |
| DTA / TSA / prediction | 3 | bivariate/HSROC, trial-sequential, clinical prediction |
| Integrity / provenance | — | TruthCert signing, signed review-bundle, self-auditing capsules |

**Structural differentiators (no single competitor combines these):**
1. **100% browser, offline, no account, no server, free.** Every cloud SR tool
   (Covidence, Rayyan, DistillerSR, Nested Knowledge) and even the R-shiny
   meta-analysis tools (MetaInsight) require a server/host. allmeta runs from a
   static file, data never leaves the device.
2. **Method breadth.** RevMan Web has no NMA; Covidence/Rayyan have no synthesis
   stats at all. allmeta ships NMA, DTA, TSA, dose-response, multilevel,
   component/multiplicative NMA in-browser, R-validated to ≤1e-6.
3. **Cryptographic provenance.** TruthCert signing + a SHA-256-chained, HMAC-
   signed `review-bundle` that pinpoints a tampered stage. No competitor offers
   tamper-evident, signed end-to-end reviews.
4. **Frontier integrity methods.** spec-collapse (multiverse false-robustness),
   INSPECT-SR (trustworthiness), ROB-ME (missing evidence), POTH, fragility,
   E-value — grounded in 2024–26 papers; ahead of the field.
5. **KM-curve reconstruction** (figure → pseudo-IPD) — something Elicit and the
   cloud tools explicitly cannot do (figure extraction).

## 2. The competitive landscape (2025–26)

### Screening & review management
| Tool | Model | AI screening | Extraction | Living | Cost |
| --- | --- | --- | --- | --- | --- |
| **Covidence** | cloud, Cochrane-endorsed | RCT classifier (ML, >99.5% sens, trained on 280k records) + active-learning relevance sort | AI auto-populate (DOI+PDF, human-verified) | no | $240–450/yr/reviewer; inst. $3k–12k |
| **Rayyan** | cloud | zero-shot relevance, AI Analyzer/Reviewer | Auto-Extract (premium; relatively weak) | no | generous free tier |
| **DistillerSR** | cloud, enterprise | deterministic AI (dedup/classify/screen) | **generative AI human-in-loop full-text extraction + summarization**; Embase integration; auditable | partial | enterprise $$ |
| **EPPI-Reviewer** | web | priority/"smart" sorting | yes | partial | paid |
| **Nested Knowledge** | cloud | yes | yes | **only true living/updatable tool**; auto search updates + evidence mapping | paid |
| **allmeta `screen`** | **browser/offline** | TF-IDF active-learning (both reviewers train), buscar 95%-recall stop, cross-validated AUC, BYOK LLM suggestions | deterministic + BYOK AI batch; **no in-browser PDF text extraction** | `living-meta`/`living-rob-pool` (manual update) | **free** |

### Synthesis & certainty
| Tool | Model | Pairwise | NMA | DTA/TSA | GRADE | Reproducible |
| --- | --- | --- | --- | --- | --- | --- |
| **RevMan Web** | cloud (Cochrane) | yes (REML default, HKSJ, Q-profile as of Jan 2025) | **no** | no | via GRADEpro | yes |
| **metafor / meta / netmeta** (R) | code | yes (gold standard) | yes | yes | partial | yes (code) |
| **MetaInsight** | R-shiny, hosted | — | yes (netmeta + gemtc/BUGSNET), point-and-click, seeded | no | yes (server) |
| **CMA / JASP / Stata** | desktop | yes | some | some | no | varies |
| **allmeta** | **browser/offline** | yes (R-validated 1e-6) | **yes (13 apps)** | **yes** | grade-sof + CINeMA | yes + **signed** |

### AI-assisted extraction (the hot frontier)
- **Elicit**: ~81.4% extraction accuracy vs 86.7% human (n.s.) on one domain;
  **cannot extract from figures**, searches not reproducible, English bias.
- **Covidence / DistillerSR**: generative auto-populate, human-verified.
- **allmeta**: deterministic extract + optional BYOK LLM batch (honest, but
  less automated; no validated in-browser grounded extraction yet).

## 3. Where allmeta leads vs lags

**Leads:** offline/privacy/free; method breadth (esp. NMA + DTA + TSA where
RevMan/Covidence have nothing); cryptographic provenance (unique); frontier
integrity methods (unique); KM-curve IPD reconstruction; self-auditing capsules.

**Lags:** (a) screening AI maturity — no pre-trained RCT classifier like
Covidence's 99.5%-sensitivity model; (b) **no in-browser PDF full-text
ingestion/extraction** in the pipeline (extract is RIS/CSV/JSON only; the
PDF/regex extractor is a separate server tool); (c) automated **living-review**
search-update monitoring (Nested Knowledge owns this); (d) real-time multi-user
cloud collaboration (inherent trade-off of offline-first; partially addressed by
the new serverless folder-sync, Chromium-only); (e) direct database integration
(DistillerSR↔Embase).

## 4. Prioritized improvement opportunities

Scored for **leverage** (closes a real competitor gap or extends a unique
strength) against the hard constraints (browser-only, CDN-free, no server, R-
validated, signed). Ordered by recommended sequence.

### P0 — close the biggest pipeline gap: in-browser PDF ingestion + grounded extraction
- **Gap:** Covidence/DistillerSR ingest PDFs and auto-populate; allmeta's
  `extract` takes only RIS/CSV/JSON. This is the single most-cited reason users
  "move to another tool."
- **Build:** vendor `pdf.js` (offline, no CDN) into `extract/` to pull text +
  tables from an uploaded PDF, feed the existing deterministic extractor, and
  let the BYOK LLM path fill gaps **with span-grounding** (quote the source
  sentence per extracted value — directly answers Elicit's "not reproducible"
  weakness and the citation-misattribution risk). Keep everything client-side.
- **Why allmeta wins:** offline + grounded + signed extraction beats Elicit's
  cloud, ungrounded, non-reproducible extraction on exactly the axes a
  methodologist cares about.

### P1 — ship a pre-trained, offline RCT/study-design classifier
- **Gap:** Covidence's RCT classifier (99.5% sens) is a headline feature; our
  `screen` has active-learning but no cold-start classifier.
- **Build:** train a small logistic/linear model on public abstracts (Cochrane
  RCT corpus is open), export weights as a tiny JSON, run inference in-browser
  (no server). Surfaces a cold-start "likely RCT" score before any screening
  decisions, complementing the existing buscar active-learning.
- **Why allmeta wins:** same capability, offline, transparent weights (vs a
  black-box cloud model) — and signable.

### P1 — living-review update monitor (the Nested Knowledge gap)
- **Gap:** no automated "has new evidence appeared?" loop.
- **Build:** extend `living-meta` with a saved search + a manual/scheduled
  re-run that diffs against the stored record set and flags new hits, re-pools,
  and re-signs the bundle (provenance chain already supports this). Uses the
  RapidMeta live PubMed/CT.gov backend that already exists in the portfolio.
- **Why allmeta wins:** living reviews **with a signed, reproducible audit trail
  per update** — beyond what Nested Knowledge offers.

### P2 — lean into the unique moat (positioning + small features)
- **Signed-review as the product:** make the `review-bundle` signature a
  first-class export from every pipeline stage and surface a public verifier.
  No competitor can match tamper-evident evidence synthesis.
- **Integrity-by-default:** auto-run spec-collapse / INSPECT-SR / ROB-ME / POTH
  on a completed synthesis and put their verdicts in the GRADE/report stage —
  turning frontier methods into a one-click trustworthiness panel.
- **"Verify in R" opt-in:** the deferred WebR button — lets a skeptic re-run the
  pooling in real metafor/netmeta in-browser, cementing the R-parity claim.

### P2 — collaboration & scale polish
- Reference import to 100k (Covidence parity) — stream/chunk parsing in
  `screen`/`extract`; today's in-memory parse caps lower.
- Promote the serverless folder-sync from Chromium-only toward a documented
  team workflow; keep the air-gapped export as the universal fallback.

## 5. One-line strategic read
allmeta should **not** chase Covidence/Rayyan on cloud collaboration or
managed-service polish. It should win on the axes no competitor occupies:
**offline + free + the broadest validated method set + cryptographically signed,
reproducible, integrity-checked evidence.** The P0/P1 items (PDF+grounded
extraction, offline RCT classifier, signed living updates) close the few real
capability gaps without surrendering that moat.

## Sources
- Covidence features/pricing/ML: [covidence.org/blog (ML)](https://www.covidence.org/blog/from-manual-to-machine-how-covidences-ml-is-streamlining-systematic-reviews/), [researchgold comparison](https://researchgold.org/blog/covidence-alternatives-systematic-review-tools)
- DistillerSR / EPPI-Reviewer AI: [distillersr.com](https://www.distillersr.com/), [hifivestar 2025 comparison](https://blog.hifivestar.com/posts/top-systematic-review-software-2025), [PROSPERO/PubMed protocol 40589599](https://pubmed.ncbi.nlm.nih.gov/40589599/)
- Nested Knowledge / living review: [nested-knowledge SR-of-SR](https://about.nested-knowledge.com/2021/10/14/sr-of-sr/)
- Rayyan: [rayyan.com](https://www.rayyan.com/), [leaveit2ai review](https://leaveit2ai.com/ai-tools/academic-research/rayyan.ai)
- Elicit accuracy/limits: [Cochrane ESM 2025 (Bianchi) 10.1002/cesm.70033](https://onlinelibrary.wiley.com/doi/full/10.1002/cesm.70033), [SAGE proof-of-concept 10.1177/08944393251404052](https://journals.sagepub.com/doi/10.1177/08944393251404052)
- RevMan Web 2025 / GRADEpro: [revman.cochrane.org/info/features](https://revman.cochrane.org/info/features), [Cochrane Statistics newsletter Jan 2025](https://methods.cochrane.org/statistics/news/issue-3-january-2025-newsletter)
- MetaInsight: [crsu-metainsight.le.ac.uk](https://crsu-metainsight.le.ac.uk/MetaInsight/), [JRSM 2019 10.1002/jrsm.1373](https://onlinelibrary.wiley.com/doi/abs/10.1002/jrsm.1373)
