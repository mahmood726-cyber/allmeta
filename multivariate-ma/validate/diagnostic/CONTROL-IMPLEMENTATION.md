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
