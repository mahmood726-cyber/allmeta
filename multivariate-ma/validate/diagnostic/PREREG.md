# Diagnostic validation, registered before execution

2026-10-20. The population is all 69 IDs in P18LL fits.csv, joined to
population.json, jobs.json and summary.json; numerical duplicates retain their IDs.
No fit may disappear. Expected denominator: 99 (69 hard fits + 30 controls).

Mapping: P18LL (a) maps to boundary maximum when its oracle covariance is on a
boundary, otherwise unique interior maximum. All three recorded (a) fits are on
a boundary. P18LL (b) accepts boundary maximum or flat likelihood: estimates not
unique. Controls must be unique interior maximum. No likelihood adjudication of
a diagnostic disagreement. Missing, duplicate, unexpected and wrong-verdict IDs fail.

The diagnostic is observational and cannot change the selected covariance,
estimates, likelihood, optimizer settings or existing output numbers. Count
distinct starting points (five bivariate, three univariate, zero for the exact
two-study solution); retain screened and refined candidates. Count near-best
covariance clusters with absolute likelihood difference <=1e-8 and entrywise
separation >1e-6 relative to max(1, abs(best entry)). These are numerical candidate
clusters, not a claim of mathematically separate stationary points.
The default comparison is the original moment start after its 600-iteration
screen; label this budget explicitly. Two-study default comparison is null.

Zero-variance threshold: 1e-10 times max(1, mean sampling variance for that outcome).
Correlation boundary: abs(rho)>=1-1e-6. Any such boundary takes verdict precedence.
For each variance, profile at max(0, variance-h) and variance+h,
h=1e-4*max(1, variance), reoptimizing nuisance covariance parameters.
Flat: both distinct offset points change logLik by <1e-6 in absolute value.
Report offsets, likelihood changes, finite search status and central curvature;
finite searches are empirical evidence, not proof of global uniqueness.
Interior fits are flat if any profile is flat or multiple near-best clusters exist.
The absolute scale floor is intentional; this finite-tolerance label is
unit-dependent and is not structural non-identifiability.

Controls: scan pinned plus corpus in its stored configuration order, supplied fit
then stored sweep order; exclude all 69 hard IDs, numerical duplicate inputs,
non-PD sampling covariances and k<3. Use R alone to select the first 30 classified
interior and non-flat by the above variance profile rule, with a positive
observed information matrix and agreement of refined multistart mvmeta and
metafor likelihoods within 1e-6. Do not use the JavaScript verdict to select.
Record every attempted control and rejection. R control fits use four starts,
tight tolerances and nuisance-reoptimized profiles. Default-warning evidence is
a separate run using untouched mvmeta and metafor optimizer defaults on all 32
distinct hard inputs, expanded to all 69 IDs, retaining printed output, warnings,
errors and convergence metadata. Silence is not evidence of uniqueness.

Run the fixed 99-fit comparison, then force one incorrect verdict and separately
drop one fit. Both deliberately damaged outputs must fail with nonzero exit.
Run Node tests and the unchanged pinned plus replay (54,612/54,612).
Compare all preexisting fit fields exactly against the saved pre-edit engine.
Add a Playwright spec and list commands, but do not launch browsers.
Report actual agreement and all limitations, including disagreements.

## Addendum, 2026-10-21: flat-likelihood rule withdrawn after review

Everything above is the original registration and is kept unchanged. It is superseded where this
addendum says so. This addendum was written before the 297-fit R oracle comparison finished.

Why. Independent review of PR #209 (REVIEW_209, Finding 1) showed that the "flat likelihood" rule
depended on outcome units, not flatness. The rule paired a relative offset h = 1e-4*max(1, v) with an
absolute threshold |dlogLik| < 1e-6. Near a regular maximum dlogLik ~ -I*h^2/2, so for variances >= 1 a
fit was "flat" whenever k < ~400, whatever the data, and for variances < 1 whenever sum 1/(v_i+tau^2)^2 <
~400. The reviewer's probes, all with one cluster and no boundary: univariate k=10, v=0.05 was "unique";
v=0.2 was "flat" (dlogLik -1.4e-7); k=30, v=0.5 was "flat"; a bivariate k=40 fit (S_ii=0.1, rho -0.71) was
"unique" at its native scale and "flat" after y*10, S*100. All 6 simulated S_ii=0.01 datasets flipped to
"flat" at x10, and all 6 S_ii=0.5 datasets were "flat" natively. The m=3 test fixture was also "flat". The
coordinator reproduced it: the same data rescaled by 0.1 flips "flat likelihood" to "unique interior
maximum". The control selection used the same rule, and class (b) accepted either non-interior verdict, so
the registered validation could not detect this.

Change. The profile-based flatness rule and the per-fit variance profiles are removed. There are now
exactly three verdicts, with precedence boundary, then multiple optima, then interior:
- "boundary maximum": unchanged rule and thresholds (zero variance <= 1e-10*max(1, mean S_ii); |rho| >= 1-1e-6).
- "multiple near-equal optima": two or more candidates within |dlogLik| <= 1e-8 whose covariance estimates
  differ in scale-free terms: an SD differs by more than 1e-4*max(sd_a, sd_b), or a correlation by more
  than 1e-4 absolutely. Log-likelihood differences do not depend on outcome units.
- "interior maximum". The word "unique" is no longer used.
The default-start gap is null when either value is the objective's failure sentinel (>= 1e11).

Validation, replacing the 99-fit comparison above:
1. Units invariance: verdict(y*c, S*c^2) == verdict(y, S) for c in {0.01, 0.1, 10, 100}, for the 69 hard fits,
   the 30 existing controls, the m=1 and m=3 test fixtures and the Finding 1 probe designs (regenerated from
   a fixed seed in units.cjs, because the reviewer's own draws were not kept).
2. Exact R verdict per fit (oracle.R, stage "verdicts"): from R's own multistart fits (mvmeta from six
   starts and metafor rma.mv under four controls, plus the refined fit_mv estimate), R applies the same
   boundary thresholds to its refined estimate and the same scale-free distinctness rule to its candidates.
   Population: 69 hard fits + 30 controls, each at x1, x10 and x0.1 (297 fits). One expected verdict per
   fit. The class (b) "either non-interior verdict" acceptance is removed, and hard.json's old `expected`
   field is no longer read. Disagreements are reported, not adjudicated, and no threshold is tuned to remove them.
3. Engine-level mutations that must fail the 297-fit comparison: boundary variance threshold x1e4,
   correlation threshold 1e-6 -> 1e-2, skipped multiple-optima check, swapped precedence, absolute SD
   tolerance. A mutation that survives is reported, and a control fit that catches it is added
   (mutation-controls.json; its R verdict also comes from oracle.R).
4. The 30 controls were selected under the withdrawn rule. They are kept as the control population; their
   selection does not use the new rule.
