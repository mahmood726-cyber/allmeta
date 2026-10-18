# Bucher indirect comparison: direction and import integrity

**Date:** 16 October 2026; review updated 18 October 2026.
**Scope:** Bucher direction, inference, import integrity and matching tests.
**Status:** scoped repair; owner requested merge after verification. Exact-head CI and review status are recorded on PR #123. This is not comprehensive app certification or independent human peer review.

## Before (reproducible original behaviour)

Original importer grouped contrasts alphabetically and selected the first two unique links in input order, while labelling the difference `A vs B`. The synthetic five-row software fixture `bucher/tests/fixtures/bucher-tiny.csv` includes two A–B, two A–C and one B–C studies, with `TE` defined as `treat1 - treat2`. The original source selected A–B and A–C and computed:

- pooled A–B = −0.2909502262443439 (SE 0.07399400733959438)
- pooled A–C = −0.4915294117647059 (SE 0.09111079228383559)
- displayed `A vs B (indirect)` = pooled A–B − pooled A–C = **+0.200579185520362**, whereas this expression is actually **C vs B**.

The prior browser test compared only the absolute value against a differently oriented R reference, so it did **not** detect the mislabeled direction. The app also selected `t_(k−2)` solely from the number of contributing trials; that df is not supported for fixed inverse-variance Bucher summaries with known SEs and did not reproduce the normal Wald reference in `bucher-tiny.R`.

## Proposed correction and numerical consequence

Explicit treatment labels A and B and common comparator C control the import. Only A–C and B–C link estimates enter the Bucher calculation. Direct A–B trials are counted/disclosed, not silently used as part of the indirect path. Direction of reversed trial contrasts is corrected before fixed-effect pooling.

On the **same five-row fixture**:

- A–C = −0.4915294117647059, SE 0.09111079228383559, k=2
- B–C = −0.22, SE 0.09, k=1
- true indirect **A–B via C = −0.2715294117647059**, SE 0.12806707801222075
- 95% *normal Wald* CI: [−0.5225362722739401, −0.020522551255471755]; two-sided p approximately 0.03398813
- two direct A–B records remain explicitly excluded from the indirect-only estimate.

These represent *different contrasts*; the change is not a numerical re-estimation of the same comparison. Interpreting the original +0.200579 as A–B would give a wrong sign/estimand.

## Fail-closed behaviour and supported scope

- Input treatment labels must be distinct, present and match the explicit A/B/C mapping; a group missing either A–C or B–C is refused.
- All typed effects and standard errors must be finite with positive, representable variance; no first-two-only selection, partial record dropping or six-decimal truncation.
- Where study IDs identify the same trial in multiple contrasts, plain Bucher is refused rather than ignoring multi-arm covariance. With missing study IDs, **independence is not verified** and this limitation is stated.
- Contrasts must share the same estimand and analysis scale; the user must judge transitivity. The app does not fit a general network or covariance model and does not validate effect modifiers.
- The original aggregate estimates can still be entered manually, with the explicit model assumptions.
- A normal CI does not guarantee appropriate coverage with small numbers of trials; a t distribution using only k−2 is not a justified general cure. For multi-arm/multiple effect modifiers/random-effects network analyses, prefer a suitable NMA.

The signed effect and variance sum follow the independent-link formulation in [Cochrane Handbook Chapter 11, section 11.2.1](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-11). The method assumes transitivity; the software cannot establish that assumption from numeric contrasts.

## Review corrections on 18 October 2026

The previous shared-suite failure was in the Bucher network test: it used comparator `control` without selecting that name in the new explicit mapping. The repaired test selects `control` and checks the signed result. No arbitrary first-two-pairs selection is restored.

Additional scoped corrections:

- Validate the entire network envelope before conversion, rejecting malformed counts, absent/duplicate IDs, multi-arm studies and unsupported measures; require exactly one converted contrast per two-arm study. Set log scale before analysis and disclose the shared 0.5 zero-cell convention.
- Reject malformed CSV quotations, extra/missing columns, fuzzy/duplicate headers and nondecimal numeric tokens. A small optional parser callback in the shared upload widget selects Bucher's strict parser; other apps retain the original parser.
- Clear results and plot on every refused import. Scale/axis changes cannot resurrect rejected results; the user must explicitly Compute retained inputs or import valid data.
- Failed imports restore all prior form fields and scale together. A refused OR/RR network cannot switch retained raw-scale summaries into ratio interpretation.
- Check all direct and indirect interval endpoints and back-transformed ratios for overflow/underflow. Evaluate the normal tail without subtracting a tiny tail from one, and format small nonzero values in scientific notation.
- Manual summaries do not establish the source trial count: it is now unknown, rather than asserted to be two. Correct the visible/accessibility label mismatches.
- Legacy saved links without treatment names must have their mapping supplied and source estimates checked before Compute; unnamed old fields are never automatically relabelled as A-C/B-C. Named saved links retain the selected estimand on reload.
- Preserve current main's repair register; the original branch's unrelated register edits are excluded from this repair.
- The shared CI checkout fetches history so current main's historical baseline replay can read its pinned commit. The integrated run exposed a missing-object failure in the newly merged proportion test; no test assertion or proportion code is changed or skipped.

## Executable verification

Fresh R 4.6.0 execution used installed `netmeta` 3.5.0, `metafor` 5.0.1 and `jsonlite` 2.0.0. `bucher/tests/fixtures/bucher-reference.R` pins these versions and regenerates `bucher-reference.json`. Seven synthetic cases cover the triangle, reversed arms, null, positive, unequal weights, named treatments and a small tail probability. Each compares independent fixed-effect link fits from `metafor::rma.uni(method="FE")` with `netmeta`'s common-effect A-B estimate on the AC/BC-only network (direct AB excluded). R's normal quantile/tail produce the CI/p reference. No random-effects or multi-arm parity is claimed.

`tests/test_bucher.py` compares the production JavaScript core against these outputs and independent 50-digit Python Decimal pooling, plus malformed-input and CSV regressions. Twenty local cases passed. The 50 focused Chromium scenarios include actual HTTP pages, pasted/file CSV, native number fields, network import, refusal/recovery, legacy sanity and JSON export. Local Chromium setup was denied localhost access before app load; no local browser pass is claimed. GitHub Actions must execute the focused suite and wider suites on the final head before merge.

Commands from repository root:

- `python -m pytest tests/test_bucher.py -q`
- `Rscript --vanilla bucher/tests/fixtures/bucher-reference.R`
- From `hub/shared/tests`: `npx playwright test --config=bucher.config.mjs --reporter=line`

| Evidence | Static or dynamic | Disclosure |
|---|---|---|
| Inputs | Static synthetic fixtures | Software regressions, not clinical studies |
| R oracle | Freshly calculated and then frozen | R/package versions pinned; regeneration script committed |
| Decimal reference | Independently calculated in tests | Signed inverse-variance means and variance sum |
| Browser result | Runtime on actual HTTP app | Must pass on final PR head; no DOM-engine mock substituted |
| Clinical assumptions | User assessment | Transitivity and independence are not proven by test success |

## Limits

Normal/Wald coverage with sparse evidence, incomplete study IDs, clinical transitivity, mobile/axe accessibility and report/receipt roundtrips still require broader review. The historical `bucher-tiny.R` checks a different orientation and is retained for existing callers; the new reference explicitly verifies A-B via C. No full-app certification is claimed. Formal/independent human review must not be inferred from automated test success.
