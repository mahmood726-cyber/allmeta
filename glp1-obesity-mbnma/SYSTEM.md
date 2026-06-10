# Registry-native evidence-synthesis system — reusable framework

This project is not just one analysis; it is a **reusable, reproducible pipeline** for registry-native
dose-response network meta-analysis with completeness recovery and population transportability. This file
documents the system, how to run it end-to-end, and how to point it at a new drug class / condition.

## What the system does (stages → scripts)
| stage | does | script | key output |
|---|---|---|---|
| 0. policy | data-source contract (AACT/CT.gov + PubMed abstracts only) | `DATA_SOURCES.md` | — |
| 1. discover | find registry trials for the agent set with posted % outcomes | `discovery.py` | candidates.csv |
| 2. extract | arm-level data (dose/N/mean/dispersion), QC, node-split | `extract_full.py` | arms_full.csv |
| 3. validate | extraction vs published primaries (PubMed abstracts) | `validate_pubmed.md`, `fit.py` | — |
| 4. synthesize | dose-response MBNMA (freq) + NUTS Bayesian + POTH | `fit_network.py`, `pymc_onestep.py` | ranking.json |
| 5. completeness | ghost detection (AACT×PubMed) + multi-strategy MEDLINE delta | `run_medline_compare.py`, `fix1_*` | medline_*.json |
| 6. transitivity | population/effect-modifier map; INSPECT-SR robustness | `workstream_C_*`, `workstream_D_*` | transitivity.csv |
| 7. benefit-risk | efficacy vs adverse events (registry-native) | `workstream_H_*` | benefit_risk.json |
| 8. transport | Bayesian one-step NMR internal transport + multi-target atlas | `pymc_bayesian_transport.py`, `pymc_agent_gamma.py`, `workstream_*atlas*` | bayesian_transport.json |
| 9. robustness | out-of-sample transport validation + joint sensitivity | `fix2_*`, `fix3_*` | transport_*.json |
| 10. synthesis | completeness ⊕ transportability unification | `workstream_synthesis.py` | synthesis.json |
| 11. report | self-contained continuous report + paper | `build_continuous_report.py`, `PAPER.md` | continuous_report.html |
| 12. human layer | screening / RoB-2 / GRADE attestation | RapidMeta (`GAP_CLOSURE.md`) | dashboard |

## Run end-to-end
`python run_all.py` orchestrates stages 1–11 from the pinned AACT snapshot, in dependency order, and
prints a status line per stage. Each stage is independently re-runnable. Bayesian stages use the compiled
nutpie backend (fast, no g++). Stage 12 (human attestation) is interactive in the RapidMeta dashboard.

## Reuse for a new drug class / condition
The system is parameterised; to apply it to, e.g., SGLT2 inhibitors in heart failure:
1. Edit the agent alias map + condition keywords in `discovery.py` (the only domain-specific block).
2. Set the outcome filter (% change in the relevant continuous endpoint) and the timepoint landmark.
3. Choose the effect modifier(s) for transport (here: diabetes; binary pure-strata = valid IPD-free) and
   the authoritative target distribution(s) for stage 8.
4. Run `run_all.py`. Everything downstream (extraction, MBNMA, ghost detection, transport) is generic.
The synthesis engine, ghost detector, transport, POTH, and validation are condition-agnostic; only
discovery + the modifier/target choices are topic-specific.

## Design principles (why it is "future-of-synthesis" shaped, honestly)
- **Registry-native, not literature-only** — recovers unpublished + mis-indexed evidence a search misses.
- **Reproducible / living** — pinned snapshot, seeded RNG, one command; re-run as the registry updates.
- **Target-transportable** — effects mapped to authoritative real-world populations, validated, IPD-free-valid
  only where the modifier structure permits (binary pure strata).
- **Human–AI division of labor** — machine: search/extract/pool/transport; human: screening/RoB-2/GRADE.
- **Honest by construction** — extraction validated vs source; assumptions flagged; adversarially reviewed
  twice; complement to systematic review, not a replacement.

## Provenance & limits
Single pinned AACT snapshot (2026-06-01); PubMed abstracts only; no IPD; not a systematic review without the
human-attested layer. See `PAPER.md` §Limitations and `ROBUSTNESS_FIXES.md`.

## Extension — time-to-event outcomes (registry-ipd)
The continuous (weight) pipeline above is complemented by a parallel **time-to-event** track via
`registry-ipd` (C:\Projects\registry-ipd), a registry-native KM->pseudo-IPD survival engine with
calibrated-uncertainty ensembles. Same AACT source, same reproducibility discipline.
| stage | does | engine |
|---|---|---|
| S1 harvest | pull KM curves for incretin CVOT/renal trials (20 HR-trials in AACT) | registry-ipd `harvest/` |
| S2 reconstruct | KM -> pseudo-IPD Cox HR / RMST / median (+95% calibrated CrI) | registry-ipd `src/engine.js` |
| S3 survival NMA | pool reconstructed HRs across the incretin network | (next-phase) |
| S4 joint view | weight loss (MBNMA) × hard outcomes (CV/renal) benefit-risk | benefit_risk + survival |
This is the clinically decisive axis (MACE/CV-death/kidney), recovered registry-natively. See
`INTEGRATION_registry_ipd.md`. Capability + target established; the full survival NMA is a bounded next build.
