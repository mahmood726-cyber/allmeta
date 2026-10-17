# Bucher indirect comparison: direction and import integrity

**Date:** 16 October 2026  
**Scope:** `bucher/index.html` and standalone `bucher/contrast-engine.js`.  
**Status:** candidate fix pending complete CI and owner merge approval. Not comprehensive app certification.

## Before (reproducible original behaviour)

Original importer grouped contrasts alphabetically and selected the first two unique links in input order, while labelling the difference `A vs B`. The five-row fixture `bucher/tests/fixtures/bucher-tiny.csv` includes two A–B, two A–C and one B–C studies, with `TE` defined as `treat1 - treat2`. The original source selected A–B and A–C and computed:

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

The signed effect difference/variance and R comparator formulas are standard Bucher independent-link calculations. References: Bucher et al., *J Clin Epidemiol* 1997; EU HTA practical guideline for direct and indirect comparisons; R `netmeta` multi-arm guidance.

## Executable verification

- `hub/shared/tests/bucher-direction-integrity.spec.mjs`: actual Chromium import, orientation reversal, trial-identity, CSV failure, stale cache, ratio/normal interval and export cases.
- The older `hub/shared/tests/bucher-sanity.spec.mjs` and `bucher/tests/sanity.spec.mjs` now compare the actual *directed* A–B estimate rather than merely matching absolute values.
- `bucher/tests/fixtures/bucher-direction.R` provides an independent, **base-R script** to rerun the corrected direction from `bucher-tiny.csv`. Providing a script or stored R reference does **not** mean fresh R was executed in this change.
- CI checks and complete test counts should be recorded from actual GitHub Actions after the PR is created. No test passing results are assumed from source inspection.

## Outstanding gates

Normal/Wald inferential coverage for very small k, imported study identity completeness, network transitivity, full valid CSV grammar and the shared parser's known structural/lexical defects, rare numerical boundaries, mobile/axe accessibility, R live comparison on this corrected orientation, and receipt/report roundtrip. The portfolio register must not mark this app fully certified.
