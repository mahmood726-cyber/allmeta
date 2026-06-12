# GLP-1/GIP Obesity Dose-Response NMA — feasibility spec

**Goal:** Demonstrate large-scale dose-response network meta-analysis (MBNMA) where
(1) ≥40 RCTs, (2) **every treatment node is a molecule first developed after 2010**,
(3) **every RCT is registered on ClinicalTrials.gov** (verified via the AACT mirror).
Primary estimand: **% change in body weight** vs placebo, modelled as a dose-response
surface per agent within one connected network.

## Feasibility — VERIFIED against real assets (2026-06-09)

| Constraint | Status | Evidence (AACT snapshot 2026-06-01) |
|---|---|---|
| ≥40 RCTs | **CLEARED** | 795 next-gen GLP-1/GIP interventional NCTs; **108 with arm-level weight/BMI results posted** on CT.gov |
| All treatments post-2010 | **CLEARED by construction** | node set = placebo + {semaglutide ~2012, tirzepatide ~2018, retatrutide ~2022, orforglipron ~2020, survodutide, mazdutide, cagrilintide}. Dulaglutide (~2008) intentionally EXCLUDED to keep the claim unimpeachable |
| All RCTs on CT.gov | **CLEARED by construction** | AACT *is* the CT.gov mirror; the 108 have results posted there |
| Method available | **CLEARED** | allmeta MBNMA engine: linear/quadratic/Emax/Hill/exponential/power dose models + exact/composite-likelihood NMA; `shared/dose-response.js` R-validated vs `dosresmeta` |

## Static vs dynamic (anti-overclaim disclosure)

| Component | Status |
|---|---|
| Trial supply counts (795 / 108) | DYNAMIC — live AACT query, reproducible |
| Node-set = post-2010 only | STATIC — curated drug list (this file) |
| MBNMA engine | REUSED, static — allmeta `nma-dose-response-app/` |
| Dose-response pooling | REUSED, R-validated — allmeta `shared/dose-response.js` |
| Arm-level extraction layer | NET-NEW — to build (this project) |
| Timepoint/outcome harmonization | NET-NEW — the genuine hard part |

## Portfolio recon (rules.md compliance)
- **Reused:** allmeta `nma-dose-response-app/` (MBNMA engine), `shared/dose-response.js`
  (RCS + linear, dosresmeta-verified), `shared/poth.js` (rank-uncertainty, required by
  advanced-stats rule), `shared/multiplicative-nma.js`; `aact-kit` (CT.gov data access).
- **Related prior repos:** `Obesity_NMA_LivingMeta` (finerenone living-metas) — pairwise,
  not dose-response; this is net-new on the dose-response axis.
- **Net-new:** CT.gov → arm-level `{agent, dose, n, mean Δweight%, sd}` extraction +
  harmonization + the curated post-2010 obesity network.

## Full pipeline — every layer reuses a validated portfolio asset

| Stage | Asset reused | What it gives | Net-new for obesity |
|---|---|---|---|
| 1. Search + screen | `allmeta/prisma-screen`, `citation-dedup`, `citation-chaser`; `rct-extractor-v2` dual-validator | PRISMA-tracked included set (defensible, not a raw AACT grep) | obesity search terms; human-triage capacity at 5–10× predicted includes (dual-LLM 92%-false-include bias, lessons.md) |
| 2. Extract arm-level | AACT `outcome_measurements` (108 trials, posted) **+** `rct-extractor-v2` (MD/SMD + `*_arm_data.py` pattern) for publication-only trials | `{agent, dose, n, Δweight%, sd}` per arm | new `obesity` specialty profile + `obesity_arm_data.py` (copy `malaria_arm_data.py`) |
| 3. Validate extraction | **`registry-ipd/VALIDATION.md` methodology** (held-out ground truth, Wilson CIs, paired tests, honest "doesn't generalise" reporting) | credibility layer: extracted-vs-published accuracy table | weight-specific validation harness |
| 4. Synthesize | `allmeta/nma-dose-response-app` MBNMA + `shared/dose-response.js` + `poth.js` + `multiplicative-nma.js` | Emax/Hill/spline dose-response surface, POTH ranking, consistency | curated post-2010 network |

### Honest caveats on the reused assets
- **registry-ipd is time-to-event (KM-curve survival reconstruction), NOT continuous.** Our endpoint
  is % weight change. We reuse its **validation discipline and harvest/cohort/validate harness
  pattern**, NOT its reconstruction engine. Do not claim registry-ipd "extracts weight."
- **rct-extractor-v2 extracts MD/SMD and has arm-level modules** (`hiv_arm_data.py`,
  `malaria_arm_data.py`) + a built-in dual-validator screening — so it covers stage 1 screening AND
  stage 2 publication-side extraction. Quality targets already encoded: coverage ≥95%, FP ≤2%,
  point-within-10% ≥98%. An obesity profile must hit those before trusted.
- **allmeta screening is browser-based** (`prisma-screen/index.html`); dual-LLM screening over-includes
  (92% of residual errors), so size downstream human triage accordingly.

## Data contract (per arm, what extraction must yield)
`{ studyId(NCT), agent, dose(mg, numeric), n, response(mean % weight change),
   responseVar(sd^2/n or from CI), timepointWeeks }`
- Reference arm: placebo, dose = 0.
- Engine input schema (allmeta dose-response): `{ dose, response, n, responseVar }` per arm,
  grouped by study + agent. ≥3 dose groups per agent enables Emax/Hill; else linear.

## Known hard parts (where "large-scale" is won/lost)
1. **Timepoint harmonization** — STEP ~68wk, SURMOUNT ~72wk, phase-2 ~26-36wk. Pick a
   primary (e.g. ~68wk ± window) + sensitivity at end-of-treatment.
2. **LS-MEAN vs MEAN** — prefer LEAST_SQUARES_MEAN (MMRM) when present; record which.
3. **SD recovery** — AACT often posts SE/CI not SD; convert, null-out if source ambiguous
   (lessons.md: HR/CI same-source rule generalises).
4. **Dose label parsing** — "2.4 mg", "15 mg QW", titration arms → numeric maintenance dose;
   negation guard (lessons.md negated-counts).
5. **Negative = weight LOSS** — sign convention must be explicit in the contract.

## Done = (this feasibility phase)
- [x] Feasibility verified at all 4 layers
- [x] Isolated worktree off allmeta (rapidmeta untouched)
- [x] **Extraction layer built + unit-tested (2026-06-09):**
  `rct-extractor-v2/src/specialties/obesity_arm_data.py` — per-arm % weight-change
  extractor (agent node + numeric mg dose with negation guard, SD-recovery from
  SE/CI, sign=negative-is-loss, LS-mean vs mean, timepoint, engine-row projection
  dropping unverified rows). 15/15 tests in `tests/test_obesity_arm_data.py`.
- [x] **Stage-3 validation harness built + self-tested (2026-06-09):**
  `validate_extraction.py` — registry-ipd discipline (source-cited hand-verified
  gold set for STEP 1 + SURMOUNT-1, Wilson-CI coverage + within-1pp accuracy,
  tiered verdict, honest "illustration not automated result"). Self-test: extractor
  matched 2/2 STEP-1 gold arms within tolerance; honest-fails with no source text.
- [ ] **BLOCKED — run the prototype on the ~10 flagship trials.** Requires AACT
  access wired in this environment: `aact_kit.resolve_aact_location()` currently
  FAILS (no AACT_DSN/SQLITE/ZIP/TSV_DIR/CSV_DIR; no snapshot under
  `C:\Users\mahmo\AACT\YYYY-MM-DD\`). Wire the 2026-06-01 snapshot, then: pull the
  108 weight-result NCTs from AACT `outcome_measurements`, run the extractor on
  publication text for the rest, validate vs the gold set, harmonize timepoints.
- [ ] Full extraction → ≥40-trial table → MBNMA fit (allmeta dose-response) →
  POTH-reported ranking.
