# Independent one-click validation audit

Audit of the live GitHub Pages applications on 11 October 2026, following PRs #91 and #92. Repository baseline: `c97928ddc64b224c0b20c7ce0ef2e03fc9f36dd6` (also preserves the merged NMA Pro plot fix). The deployed widget reports generated build metadata `44a9e29…`; this stamp is not proof that every deployed file comes from that commit.

## Observed live browser results

Each published corpus button was clicked in the live interface. Four available current-analysis R buttons were clicked first on the default example and again after editing the actual input textarea. These are observed calculations, not conclusions inferred from documentation.

| Application | Live reference on default / altered data | Published corpus replay | Software / scope |
|---|---|---|---|
| Screen | Unavailable | 29/29 comparisons; 19 datasets × 10 seeds = 190 simulator runs | Shipped JavaScript against published rounded benchmark values; Python/ASReview is not executed |
| Dose-response MA | 21/21 / 21/21 | 724/724 combinations; 576 fits and 148 matching refusals | Live dosresmeta 2.2.0, mixmeta 1.2.2 |
| DTA SROC | 25/25 / 25/25 | 855/855 checks; 105 configurations, 80 fits and 25 matching refusals | Live mada 0.5.12; current-data meta-regression was silently excluded and is now explicitly unavailable |
| NMA | 31/31 / 31/31 | 410/410 checks; 26 analyses, 24 fits and 2 matching refusals | Live netmeta 3.4-0; archived reference netmeta 3.7-0 |
| Heterogeneity | 18/18 / 18/18 | 131,781/131,781 numerical checks; separate 120,720 rendered numbers, zero display failures | Live metafor 4.8-0; archived reference metafor 5.2-1 |

Live R sessions reported **R 4.5.1 (2025-06-13), webR 0.5.5**. Corpus replay never launches R or Python. Heterogeneity covers 88 meta-analyses and 704 configurations: 28 DL refusals below ten studies, 676 numerical configurations. The DTA corpus includes 732 fitted-quantity and 18 Moses–Littenberg checks, in addition to configuration checks. NMA counts a maximum discrepancy over each numerical family, rather than each scalar matrix cell. The five denominators therefore have different units and must not be pooled as one validation rate.

Altered-data probes:

| Application | Actual edit | Observed changed quantity |
|---|---|---|
| Heterogeneity | Trial A effect −0.20 → 1.20 | tau² 0.029359373089013083 → 0.2874217850685642; pooled effect −0.2067529461052701 → −0.031802147323613215 |
| Dose-response MA | First log effect −0.223144 → −0.123144 | Fitted coefficient −0.004458860760508299 after edit |
| DTA SROC | First TP count 85 → 95 | Summary sensitivity 0.8139017014760898 after edit |
| NMA | First contrast −0.22 → −0.52 | Q 3.35248330687657 after edit |

These checks establish that the available live paths use edited inputs, within their declared quantity and method scopes. They do not establish correctness for every possible input or quantity shown elsewhere in an application.

## Verified defects and review changes

1. **Failure diagnostics could disappear.** The shared widget assumed one diagnostic per failed check. Dose-response counts combinations, which can fail several quantities. A minimal reproduction with two checks and two diagnostics for one failed combination produced only `Invalid check accounting from adapter`, with no discrepancy table. Failed-check counts are now distinct from diagnostic rows; invalid accounting preserves available evidence. DTA coverage failures are reported separately rather than corrupting numerical accounting.
2. **DTA meta-regression could produce a misleading live PASS.** Selecting the shipped smoking example with its `type` covariate displayed a meta-regression, but the live adapter and R script compared the intercept-only fit. The live interface returned 25/25 PASS. The review change states the live scope and refuses covariate fits. Existing corpus meta-regression validation is retained.
3. **PASS remained after input edits.** A second heterogeneity edit left the previous 18/18 PASS visible. The widget now snapshots inputs and comparisons, rejects edits during an R fit, and clears completed results after data/settings changes, including programmatic import/load/reset updates.
4. **Reference labels overstated the independent calculation.** Corpus controls/table headers now explicitly identify JavaScript replay and stored references. Screen names Python and its unavailable live oracle. Re-execution links are identified as instructions/runs, not a browser action that starts an independent reference pipeline.
5. **Display failures could accompany an overall PASS row.** Rendered-number and coverage failures now appear as explicit FAIL rows. Comparison tolerances must also be finite and nonnegative, with a supported comparison kind.
6. **Screen omitted build metadata.** It now loads the existing build-info script. This is labelled a generated stamp, not independently verified deployed identity.

No analysis-engine formulas, stored references, hash pins, package binaries, scientific tolerances, release version or publication status are changed.

## Package-version investigation

Fresh reference fits were run through the repository's pinned webR runtime and verified package archives, using the reference R scripts from the corresponding reproducible repositories. This is **separate reference execution**, not a second JavaScript corpus replay.

For heterogeneity, metafor 4.8-0 was fitted on all 88 corpus analyses and all eight estimator selections. The 704 configuration acceptance/refusal statuses matched, including 28 DL refusals whose documented substitute is PM. The **6,876 publication-contract primary summary/Q-profile quantities** (676 offered fits, excluding refused DL selections) all matched the stored metafor 5.2-1 references at the stricter corpus tolerance of 1e-9. Maximum normalized relative difference: **1.1643530010540232e-15**; maximum absolute difference: **5.861977570020827e-14**. This investigation did not independently refit every leave-one-out or Baujat quantity; the browser replay tested those against their archived values.

NMA fresh-reference fitting and comparison are being completed. Final evidence and commands will be added before the audit is marked complete.

Agreement with an archived publication reference bounds the observed effect of the older runtime on these data. It is not a controlled experiment changing only one package: the browser uses R 4.5.1 and vendored dependencies, while the NMA archive declares R 4.6.0, netmeta 3.7.0 and meta 8.5.0. It also does not establish equivalence for methods or inputs outside this investigation.

## Verification

Baseline repository Python tests: `python -m pytest tests/ -q` → **383 passed, 6 skipped**. Skips were unavailable optional jsonschema/linkedom dependencies. Browser regression tests are in `hub/shared/tests/validation-audit.spec.mjs`; existing framework, integration and per-app tests are updated for truthful labels. They cover multiple diagnostics per failed combination, unexpected engine refusals, incomplete coverage, invalid accounting, rendered failures, injected R discrepancies, stale results, unavailable DTA scope, Screen disclosure and real R execution after altered inputs.

The review branch is a draft proposal. It must not be merged, released or deployed without the owner's approval. Final CI results will be recorded here.
