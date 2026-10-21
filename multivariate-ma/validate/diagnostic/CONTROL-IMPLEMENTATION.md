# R optimizer implementation note, before the final control selection

The first R control run was stopped after 79 candidates (3 accepted). The
original tightly configured metafor nlminb frequently returned convergence=1
even for Berkey's interior reference fit. Its audit and log are retained as
controls-initial.json and oracle-initial.log. No JavaScript control verdicts
were evaluated in that selection.

The registered mapping, profile offsets, tolerances, information criterion,
ordering and 30-control denominator are unchanged. To avoid excluding controls
solely because a single secondary optimizer fails, the final R selection
restarts at the beginning and tries metafor in this fixed order:

1. nlminb, rel.tol=x.tol=1e-12, iter.max=10000, eval.max=20000;
2. optim BFGS, reltol=1e-12, maxit=10000;
3. nlminb, rel.tol=x.tol=1e-10, iter.max=10000, eval.max=20000.

Stop at the first successful fit agreeing with the independent refined
multistart mvmeta likelihood within 1e-6. Retain every error, warning and
likelihood. No fit that fails all attempts qualifies. This changes the
secondary optimizer implementation, not the pre-registered diagnostic mapping.
The untouched-package-default warning run is retained without alteration.

## Addendum, 2026-10-21

The control selection above used the flat-profile rule, which was withdrawn after review because it
depended on outcome units (see the PREREG.md addendum of the same date, and REVIEW_209 Finding 1). The
30 selected controls and every audit record are kept as they are. They are no longer described as "non-flat"
controls, only as R-selected fits with positive observed information and agreeing refined mvmeta/metafor
likelihoods. Their expected verdicts now come from `oracle.R verdicts` (oracle-verdicts.json) at x1, x10
and x0.1, not from the selection.

R implementation of the verdict stage: mvmeta REML (bscov "unstr", maxiter 10000, reltol 1e-13) from six
starts: package default; the fit_mv moment start diag(max(var(Y) - mean S_ii, 1e-4)); that start x0.1 and x10;
that start with correlation +0.9 and -0.9. Then metafor rma.mv (struct "UN", REML) with default control and
the three controls listed above. Every successful fit becomes a candidate, together with the refined
fit_mv estimate (nlminb plus Newton polish, with zero and two-study adjudication). The boundary is judged on
the fit_mv estimate. The fit_mv start has an absolute 1e-4 floor. It only affects starting values.
