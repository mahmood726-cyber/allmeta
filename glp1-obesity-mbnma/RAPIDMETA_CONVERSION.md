# RapidMeta conversion — make each kept class auditable the same way

Goal: wrap the obesity flagship and its two cardiometabolic sibling classes in the **full RapidMeta workbench**,
so protocol → search → screen → extract → synthesis → paper are all *checkable* in one offline-capable app.

> **Scope note (2026-06-12):** Conversions are kept only for the **cardiometabolic** repoints — **PCSK9**
> (continuous %LDL) and **SGLT2** (survival HR). The earlier immunology conversions (psoriasis / asthma / RA)
> were removed with their classes when the repo was refocused on the GLP-1 obesity question.

## Mechanism (reused, not rebuilt)
`rapidmeta-kit/clone.py config.json --out review.html` stamps a per-class JSON config onto the validated
~1.2 MB RapidMeta template — the complete interactive engine with tabs **protocol / search / screen / extract /
analysis / paper / report**, PICO, PROSPERO, dual-screen, PRISMA, RoB-2 autofill, GRADE SoF, CINeMA, and the
Evidence Paper Studio. We only ever write configs; the engine is shared.

## The two kept conversions

| Class | Outcome type | Harvester | Kit slot | Trials | Funnel (search → reporting → included) |
|---|---|---|---|---|---|
| **PCSK9 (class2)** | continuous %LDL | `pcsk9_rapidmeta_harvest.py` | `allOutcomes` md/se | 52 | 273 → 102 → 52 |
| **SGLT2 (class3)** | survival / HR | `sglt2_rapidmeta_harvest.py` | publishedHR/hrLCI/hrUCI | 18 | 1165 → 18 → 18 |

Each is a dedicated, type-aware harvester:
- **PCSK9** (continuous) mirrors the incretin flagship's md/se shape: active-minus-control LDL-C % change with
  `se = sqrt(se_active² + se_control²)`, per-arm SE read from the posted dispersion (Standard Error directly,
  or SD/√N, or CI-width/2·1.96). Fail-closed on missing SE or implausible md.
- **SGLT2** (survival) takes the most-precise published HF/CV-composite HR + 95% CI per trial → the kit's native
  survival forest slots. Fail-closed on implausible HR or degenerate CI.

Each conversion is pinned by `test_rapidmeta_ratio_continuous_conversion`. Harvest + config are committed
`run_all.py` stages (PCSK9 C2e-f, SGLT2 C3d-e); the 1.2 MB workbench HTML is the out-of-band `clone.py` command
(`python clone.py <class>_rapidmeta_config.json --out <class>_review.html` in rapidmeta-kit), gitignored and
regenerable from the committed config. Validated builds: ~1.19–1.22 MB with 0 unfilled placeholder tokens and no
`dupilumab`/`COPD` base-template leftovers.

## Honesty boundary (carried into the protocol tab)
These are **AACT-results-posted cohorts**, NOT dual-screened full systematic reviews. Effect measures are
derived from posted results; the screening funnel is the registry funnel, not a PRISMA dual-screen. The
synthesis hierarchy shown is each class's Bayesian league (`pcsk9_league_bayes.json` / `sglt2_league.json`). The
RapidMeta RoB-2 / GRADE panels are for **human attestation**, not auto-asserted.
