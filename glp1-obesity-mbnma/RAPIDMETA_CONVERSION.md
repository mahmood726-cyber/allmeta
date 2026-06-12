# RapidMeta conversion — make every class auditable the same way

Goal: wrap each generality class in the **full RapidMeta workbench** (the same one the incretin flagship uses),
so protocol → search → screen → extract → synthesis → paper are all *checkable* in one offline-capable app.

## Mechanism (reused, not rebuilt)
`rapidmeta-kit/clone.py config.json --out review.html` stamps a per-class JSON config onto the validated
~1.2 MB RapidMeta template (`template/base_dupilumab_copd.html`) — the complete interactive engine with tabs
**protocol / search / screen / extract / analysis / paper / report**, PICO, PROSPERO, dual-screen, PRISMA,
RoB-2 autofill, GRADE SoF, CINeMA, and the Evidence Paper Studio. We only ever write configs; the engine is shared.

## Pilot — RA (class6_ra), DONE
Reproducible source (committed):
1. `ra_rapidmeta_harvest.py` → `ra_trials.json` — per-trial ACR responder table from AACT (**v2, hardened after a
   multi-person review found 4 data bugs in v1**): it picks the **latest placebo-controlled timepoint** (AACT posts
   one row per timepoint; v1 took an arbitrary one → wrong endpoint for 34/66 trials), is **unit-aware** (ACR is
   posted as a percentage OR a participant count; v1 multiplied counts as %), excludes **open-label/crossover** arms,
   requires control to be **drug-free**, and **fails closed** on implausible cells (control rate >20pp above active,
   arm N<10, events outside [0,N]). **Funnel reconciles: 4346 search → 207 ACR-reporting → 54 included** (153 excluded
   into named buckets), all 12 agents. Example fix: NCT00870467 went from a garbage 0/5-vs-103/163 to the correct
   adalimumab 110/171 (64%) vs placebo 63/163 (39%).
2. `build_ra_rapidmeta_config.py` → `ra_rapidmeta_config.json` — assembles the kit config (drug, condition,
   comparator, PICO, acronyms, 66 trials with tE/tN/cE/cN + ACR `allOutcomes`) + an honest provenance note.
3. `python clone.py class6_ra/ra_rapidmeta_config.json --out class6_ra/ra_review.html` (run in rapidmeta-kit) →
   the 1.24 MB workbench. Validated: all 7 tabs present, trial data populated, PICO/screening rendered, **0
   unfilled placeholder tokens**.

The generated `ra_review.html` + `assets/` are **gitignored** (CDN-dependent, 1.2 MB, regenerable from the
committed config — exactly how `incretin_obesity_dashboard.html` is handled). `ra_trials.json` +
`ra_rapidmeta_config.json` + the two builder scripts ARE committed and pinned by `test_ra_rapidmeta_conversion`.
`run_all.py` runs the harvest + config stages (C6d/C6e); the clone is an out-of-band kit command.

## Honesty boundary (carried into the protocol tab)
This is an **AACT-results-posted cohort**, NOT a dual-screened full systematic review. Responder counts are
derived (`events = round(ACR% × N)`); the screening funnel is the registry funnel, not a PRISMA dual-screen. The
synthesis hierarchy shown is the ordinal proportional-odds Bayesian league (`ra_league.json`), advanced-MoA ≥ TNF
with heterogeneity explicitly flagged. The RapidMeta RoB-2 / GRADE panels are for **human attestation**, not
auto-asserted.

## All five classes converted (DONE)
Each is the same three steps with a class-specific harvester. **All five outcome types now have a RapidMeta
workbench**, spanning binary / ordinal-responder, continuous, survival, and count/rate:

| Class | Outcome type | Harvester | Kit slot | Trials | Funnel (search → reporting → included) |
|---|---|---|---|---|---|
| RA (class6) | binary ACR ladder | `ra_rapidmeta_harvest.py` (shared `rm_harvest_binary`) | tE/tN/cE/cN | 54 | 4346 → 207 → 54 |
| Psoriasis (class4) | binary PASI ladder | `psoriasis_rapidmeta_harvest.py` (shared `rm_harvest_binary`) | tE/tN/cE/cN | ≥30 | — |
| **PCSK9 (class2)** | **continuous %LDL** | `pcsk9_rapidmeta_harvest.py` | `allOutcomes` md/se | 52 | 273 → 102 → 52 |
| **SGLT2 (class3)** | **survival / HR** | `sglt2_rapidmeta_harvest.py` | publishedHR/hrLCI/hrUCI | 18 | 1165 → 18 → 18 |
| **Asthma (class5)** | **count/rate IRR** | `asthma_rapidmeta_harvest.py` | publishedHR slots (labelled IRR) | 26 | 640 → 26 → 26 |
| **Oncologic imaging (class7)** | **diagnostic test accuracy (DOR)** | `build_dta_rapidmeta_config.py` (from `dta_trials.json`) | publishedHR slots (labelled diagnostic OR) | 66 | 206 → 66 |

The three non-binary harvesters are NOT thin wrappers over `rm_harvest_binary` (that module is responder-only);
each is a dedicated, type-aware harvester:
- **PCSK9** (continuous) mirrors the incretin flagship's md/se shape: active-minus-control LDL-C % change with
  `se = sqrt(se_active² + se_control²)`, per-arm SE read from the posted dispersion (Standard Error directly,
  or SD/√N, or CI-width/2·1.96). Fail-closed on missing SE or implausible md.
- **SGLT2** (survival) takes the most-precise published HF/CV-composite HR + 95% CI per trial → the kit's native
  survival forest slots. Fail-closed on implausible HR or degenerate CI.
- **Asthma** (count/rate) takes the published annualised-exacerbation IRR + CI per trial. The IRR is a
  ratio-of-rates and shares the log-ratio forest math with an HR, so it is carried in the `publishedHR` slots —
  but it is **labelled an IRR everywhere** (titles, group, PICO `out`, provenance note explicitly say "NOT a
  hazard ratio"). A test asserts the IRR labelling so it can't silently drift to "HR".
- **Oncologic imaging** (diagnostic test accuracy) summarises each study's reconstructed 2×2 as a **diagnostic
  odds ratio** (DOR = TP·TN/(FP·FN), 0.5 continuity correction only when a cell is zero), carried in the
  `publishedHR` slots and **labelled "diagnostic OR" everywhere** (the PICO `out` states it is NOT a hazard
  ratio, asserted by a test). The config builder reads `dta_trials.json` directly (the DTA harvest already
  produced the per-study 2×2), so there is no separate RM harvest step — just the config builder + `clone.py`.

Each conversion is pinned: binary classes by `test_rapidmeta_conversion`, the three non-binary classes by
`test_rapidmeta_ratio_continuous_conversion`. Harvest + config are committed `run_all.py` stages (PCSK9 C2e-f,
SGLT2 C3d-e, asthma C5d-e); the 1.2 MB workbench HTML is the out-of-band `clone.py` command, gitignored exactly
like RA/psoriasis. Validated builds: each review is ~1.19–1.22 MB with 0 unfilled placeholder tokens and no
`dupilumab`/`COPD` base-template leftovers.
