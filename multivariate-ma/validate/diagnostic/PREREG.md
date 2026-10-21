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
