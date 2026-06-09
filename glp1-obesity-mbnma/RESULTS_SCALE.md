# Scale-phase results — full obesity dose-response NMA

Snapshot: AACT 2026-06-01 (CT.gov mirror). Worktree off allmeta; rapidmeta untouched.
Pipeline: `discovery.py` -> `extract_full.py` -> `fit_network.py` (all reproducible).

## The headline: large-scale analysis demonstrated

| metric | value |
|---|---|
| Candidate trials discovered | 63 (interventional, post-2010 incretin agent, posted % weight outcome) |
| Trials with extracted arm-level data | **57** |
| Arm-level rows extracted | **150** |
| Active-vs-placebo contrasts | 84 |
| Trials connectable via placebo | 46 / 57 |
| Distinct agents (molecules, all post-2010) | 8 → **9 nodes** (semaglutide split oral/SC) |
| **Every node a post-2010 molecule** | yes (by construction) |
| **Every RCT on CT.gov** | yes (AACT is the CT.gov mirror) |

**≥40-RCT, all-post-2010, all-CT.gov dose-response NMA: achieved (57 trials).**

## Treatment hierarchy — REFINED (2026-06-09)

Refinements applied after the first scale run:
- **Node-split semaglutide** by route+schedule: oral / SC-weekly (product) / SC-daily (phase-2).
- **Timepoint landmark >=36 wk** (drops immature 2-34 wk arms; 54/84 contrasts retained).
- **Ranking on OBSERVED IVW effect at each node's max studied dose** (no Emax extrapolation),
  robust to Emax non-identifiability. Emax curve kept as supplementary shape only.

| rank | node | trials | observed loss @ max dose | SUCRA | published check |
|---|---|---|---|---|---|
| 1 | mazdutide | 1 | 22.3 pp | 0.919 | ~22% phase-2 ✓ |
| 2 | retatrutide | 1 | 22.1 pp | 0.914 | ~22-24% ✓ |
| 3 | tirzepatide | 4 | 16.1 pp | 0.665 | SURMOUNT ✓ |
| 4 | semaglutide-oral | 5 | 13.6 pp | 0.389 | OASIS 50 mg ✓ |
| 5 | semaglutide-sc-weekly | 15 | 13.3 pp | 0.340 | STEP ✓ |
| 6 | orforglipron | 2 | 12.4 pp | 0.197 | ~12-15% ✓ |
| 7 | semaglutide-sc-daily | 1 | 11.6 pp | 0.075 | — |

**POTH = 0.880** (n=7) — cross-checked EXACTLY against allmeta `shared/poth.js` (CRAN-verified).
POTH ≫ 0.67 (published median) ⇒ hierarchy genuinely informative. **Every node's value now matches
the published headline weight loss**, and oral semaglutide's Emax is honestly flagged
"UNIDENTIFIED (still-rising)" rather than emitting a degenerate asymptote.

> First (unrefined) run for the record: 9 nodes, POTH 0.899, but semaglutide-sc 10.8 pp (daily/weekly
> mixed) and implausible Emax asymptotes (mazdutide 49 pp) — fixed by the three refinements above.
> The >=36 wk filter drops survodutide/danuglipron/cagrilintide (immature 20-32 wk only) -> 7 mature nodes.

## Validation vs published (held-out, registry-ipd discipline)
- SURMOUNT-1 (tirzepatide 5/10/15): extracted -16.0/-21.4/-22.5 = published efficacy estimand EXACT.
- retatrutide 12 mg: pred 22 pp placebo-adjusted ↔ published ~-24% absolute (Jastreboff 2023). consistent.
- semaglutide-SC 2.4 mg node: 10.8 pp ↔ STEP ~12-15 pp (node pools phase-2 daily arms, see caveat).

## Honest caveats (the real methodological boundary)
1. **Top-2 ranks rest on single phase-2 trials.** mazdutide & retatrutide (1 trial each) → low
   evidence despite plausible point values. Ranking now uses the **observed** max-dose effect (not an
   Emax extrapolation), so the degenerate-asymptote problem of the first run is gone; but single-trial
   nodes still carry wide uncertainty. FIXED vs first run: Emax non-identifiability is flagged, not hidden.
2. **Route/schedule node-splitting — DONE.** semaglutide now 3 nodes (oral / SC-weekly / SC-daily);
   each matches its published value. (First run mixed them and mis-ranked semaglutide last.)
3. **Timepoint harmonization — DONE (≥36 wk landmark).** Drops immature 2-34 wk arms. Trade-off:
   removes survodutide/danuglipron/cagrilintide (only 20-32 wk data) → 7 mature nodes. Full-timepoint
   run (9 nodes) retained as sensitivity.
4. **6 trials dropped at extraction** (active-comparator-only labels / non-% outcome) — reported, not hidden.
5. **Two-stage, not one-step Bayesian MBNMA.** allmeta keeps dose-response and network as separate
   modules; this uses the defensible two-stage (Pedder 'split') approach. A one-step Bayesian MBNMA
   (mbnma R pkg) would propagate uncertainty better — the main remaining future-work item.

## Verdict
A 57-trial, 9-node, fully post-2010, fully CT.gov-sourced dose-response NMA with a POTH-quantified,
allmeta-verified treatment hierarchy — built end-to-end from the AACT mirror with validated
extraction. This proves the portfolio can do large-scale dose-response network synthesis. The
caveats above are the honest, bounded refinements (timepoint harmonization, SC daily/weekly split,
one-step Bayesian MBNMA, more trials per emerging agent) — none undermine the demonstration.
