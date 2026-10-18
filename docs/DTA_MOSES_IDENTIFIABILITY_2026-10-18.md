# Scoped Moses–Littenberg identifiability repair

Base inspected: `7899ce599bfdedecd4d13b8f35540d129906fb95` (18 October 2026).
This change concerns only the Moses SROC transformation and undefined threshold
Spearman correlation. It does not certify the DTA app or change the bivariate,
meta-regression, Deeks, input parser, correction policy, or other estimators.

## Derivation and intended behaviour

Let y = logit(Se), z = logit(FPR), D = y-z and S = y+z. The existing unweighted
regression fits D = A1+B1*S. Solving for y gives
`y = A1/(1-B1) + (1+B1)/(1-B1)*z`.
If FPR is constant, z=c, so D=S-2c and B1=1 exactly. The transformed SROC
coefficients are undefined. Floating-point calculations can instead yield a slope
one ulp below one and huge finite coefficients. Constant S also makes the OLS
regression unidentified. Rank correlation is undefined if either rank vector has
zero variance; returning zero wrongly describes an absence of association.

The engine raises DTAError on unresolved S variation, a slope indistinguishable
from one, or nonfinite transformed coefficients. Undefined Spearman correlation
returns null. The UI catches refusals, shows their reasons and exports them in
`errors`, with null alpha/beta/rho as applicable. The refused curve and its numeric
cards are absent; plot exports label Moses SROC unavailable. Other independently
computed models and study points remain visible. A horizontal SROC from constant
sensitivity remains estimable; only its correlation is undefined.

The numerical resolution floor is 64 * Number.EPSILON times the relevant scale
(max(1, |S|) or max(1, |B1|)). This is an explicit conservative rounding guard,
not a clinical threshold. Near-singular cases within that floor now refuse.
No numerical formula or operation order changes for accepted ordinary cases.

## Evidence and commands

All constructed test rows are synthetic mathematical examples, not clinical
findings. The prior conversation's /mnt/data artifacts were unavailable on this
host; this repair was reconstructed from inspected main bytes.

- `node --test dta-sroc/tests/moses-nonidentifiability.test.cjs`: engine refusals,
  defined horizontal curve, zero-cell policies, small-k behaviour, and 3,000
  configurations compared bit-for-bit with the unchanged-main fingerprint.
  The baseline records source commit, source SHA-256, seed and output SHA-256.
- `python dta-sroc/tests/moses-geometry.py`: independent 60-digit Decimal identity
  and zero rank-variance derivation. This does not call the JavaScript estimator.
- From `hub/shared/tests`, `npx playwright test --config dta-moses.config.mjs`:
  seven genuine app-URL Chromium cases, using visible controls and real JSON,
  CSV and SVG downloads; valid/refused/recovered states and absence of stale
  estimates/curves are asserted. No injected DOM or replacement engine.
- From `hub/shared/tests`, `npx playwright test dta --workers=1`: existing stored
  reference, bivariate, region, adapter and DTA UI regressions plus the new tests.
- `python scripts/lint_repo.py`, `python scripts/ground_citations.py`,
  `python scripts/drift_sweep.py`: shipped-asset and existing consistency gates.

Fresh reference execution used R 4.6.0 and **mada 0.5.12**, not a replayed oracle.
Set `RSCRIPT` to an installed Rscript and optionally `DTA_R_LIBRARY` to its library,
then run `node dta-sroc/tests/moses-reference.cjs <evidence-directory>`.
The harness asserts mada 0.5.12, records input hashes, the comparison, raw R
outputs, warnings and sessionInfo. It matches the original logit Se/logit FPR
orientation, unweighted OLS, correction 0.5, and all/single/none rules.
The eight estimable configurations agree on A1/B1/A2/B2 within absolute 1e-6;
all seventeen Spearman comparisons agree, including R NA versus JS null.
The nine singular configurations intentionally refuse. In the fresh R run mada
itself yielded huge coefficients for constant FPR and roundoff-constant S; these
are disclosed disagreements supported by the independent identity above, not
claims that the app generally outperforms R. Supplying an explicit FPR grid to
mslSROC avoids an earlier constant-break failure in R's plot-grid construction.

## Collision and merge boundaries

All open PR heads, changed files, reviews and CI were inspected before editing.
PR #116 changes parsing/import and PR #133 adds the optional plus panel; neither
branch is modified or merged here. #133 was already conflicting with main at
inspection. The repair register and hub catalogue are inspected, not promoted.
The existing hourly schedules are untouched. There is no release operation.

Focused CI, shared-tests, full playwright and lint must pass at the proposed head.
`docs/ALLMETA_APP_BY_APP_QUALITY_GATES.md` also requires manual methodological
review and owner approval for a statistical merge. Owner approval is present in
the task; no human review is asserted. Agent source review, mathematical checks
and CI do not manufacture that review. A merge, if eligible, must be a single
normal merge guarded by the exact expected head. Any OpenAI safety rejection of
a GitHub write ends all GitHub mutations for the cycle.

| Component | Static or dynamic | Disclosure |
|---|---|---|
| Counterexample counts and seeded corpus | Static synthetic test inputs | Never clinical output |
| Main numerical fingerprint | Static measured baseline | Recomputed from pinned main source before editing |
| 64-epsilon resolution floor | Static numerical guard | Newly refused domain stated above |
| Coefficients, errors, plots, exports | Dynamic | Actual production engine and browser flow |
| R outputs | Dynamic at reference execution | Version asserted; disagreements retained |
| CI, PR review and merge readiness | Dynamic | Recheck live head; no certification claim |
