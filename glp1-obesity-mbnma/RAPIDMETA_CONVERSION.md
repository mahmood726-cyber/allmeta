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
1. `ra_rapidmeta_harvest.py` → `ra_trials.json` — per-trial ACR responder table from AACT. For each trial it
   finds a control arm (placebo/control) and the primary active arm, reads ACR50 (fallback ACR20/70) % and per-arm
   N (from `outcome_counts`), and derives responder events `= round(ACR% × N)`. **Funnel: 4346 search hits → 207
   ACR-reporting trials → 66 with a usable active-vs-control pair** (all 12 agents represented).
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

## Rollout to the other four classes (next)
Each is the same three steps with a class-specific harvester:
- **PCSK9** (continuous %LDL) — reuse the incretin continuous-outcome harvest shape (md/se), control = placebo/statin.
- **SGLT2** (survival/HR) — per-trial HF-hosp events or published HR; the kit's `publishedHR`/`kmAnchors` slots fit.
- **Psoriasis** (binary PASI-90) — identical to RA: derive responder events from PASI-90 % × N.
- **Asthma** (count/rate IRR) — exacerbation rate-ratio; map to the kit's binary/continuous slot or carry the IRR.

Pattern is proven; rolling out is mechanical (one harvester per class + one config builder), then `clone.py` each.
