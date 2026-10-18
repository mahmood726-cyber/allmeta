# Host update 3: GLMM numerical diagnosis

Decision: **(b), explicitly label the affected inputs**. No estimator, tolerance, quadrature setting, reference number or refusal rule was changed. Whole-corpus cross-runtime numerical parity remains unmet. The later Host decision accepts a strict documented-exceptions contract: every configuration runs and the failing IDs and fields must equal this documented set exactly; all 27 comparisons remain failures. The labels disclose known failures; they are not a numerical repair or a claim that other input counts have been independently validated.

## Trace of the three smallest failures

Smallest means retained study count, then configuration ID lexicographically: Chiarito aspirin vascular death (k=7), P2Y12 vascular death (k=7), and aspirin myocardial infarction (k=8). Both paths are binomial-logit random-intercept fits: metafor::rma.glmm(PLO) constructs cbind(x, n-x), fits the common-effect and saturated GLMs, then invokes lme4::glmer with `0 + X.fit + (1 | study)`. The meta::metaprop(PLOGIT, GLMM) native trace reaches the same glmer call and reproduces metafor's parameters and Hessian. These are not independent numerical solvers.

There is no Laplace-versus-seven-point mismatch: both runtimes initialise at theta=1 with nAGQ=0, then jointly optimise theta and the fixed intercept with nAGQ=7. Both use bobyqa, maxfun=100000, rhoend=1e-9; the second stage uses rhobeg=2e-4. No user starting values are passed. Stage-two starts (theta, beta) are respectively (0.922387254317805, -4.00024720050635), (1.01295238124455, -4.08736961659359), and (0.875481032643640, -3.85861111365842). The fitted tau2 values are approximately 0.855, 1.030 and 0.771, so these three are not zero-variance boundary fits.

Both use tolPwrss=1e-7, boundary.tol=1e-5, gradient tolerance 0.002, Hessian tolerance 1e-6 and singular tolerance 1e-4. They compute derivatives with lme4::deriv12(delta=1e-4). vcov.merMod uses twice the fixed-effect block of the inverse deviance Hessian. The app takes this SE from rma.glmm; its confidence limits are normal Wald limits and its prediction limits use t_(k-1). Neither interval uses profiling.

The exact numerical divergence is in the small-step finite-difference Hessian evaluated at slightly different bobyqa endpoints, not a different app estimator. For the three smallest cases the final deviance values agree within about 1.5e-12, while their Hessian beta-beta entries are (native/webR): 14.7031154632568/14.7029848098755, 12.0418477058411/12.0419487953186, and 18.3663120269775/18.3665161132812. Inverting those Hessians reproduces the discrepant SEs. Finite differences divide differences of almost equal objective values by h^2=1e-8; tightening bobyqa does not remove that sensitivity.

Holding each runtime's fitted parameters fixed and using diagnostic h=1e-3 makes the cross-runtime SE differences smaller than 1e-6 for every one of the 23 affected configurations. This is a sensitivity experiment, not a replacement reference. It also moves the native SE beyond the prescribed tolerance in many cases (including the first three), so changing h cannot honestly be called agreement with the unchanged default R outputs. The diagnostic trace also records h=1e-2 and Richardson Hessians; it does not claim a preferred estimate or greater accuracy than R. Dong TIO-HH has additional within-runtime step sensitivity (native SE at h=1e-3 is about 0.311689 rather than 0.323627 at h=1e-4), reinforcing the decision not to adopt a global step change from this experiment.

A further common-parameter experiment removes the different endpoints: at each native optimum and its four axial offsets of 1e-4, native/webR objective values differ by at most 1.78e-14, 1.78e-14 and 8.18e-14 for the three smallest cases. See `host3-common-objectives.json`. This locates the large SE discrepancy in the finite-difference/inversion stage at the runtime-specific optimum, rather than a materially different likelihood. It does not assign causality to a particular compiler or package commit.

## Refusal differences

Chiarito P2Y12 stroke returns bobyqa code 3 only in webR; Collins control stillbirth returns code 3 only in native R. The message is `bobyqa -- a trust region step failed to reduce q`. Their positive fitted tau2 values are about 0.925 and 0.047; the observed mismatch is optimiser termination, not the application's all-zero/all-one boundary guard. The app's unchanged warning policy correctly refuses the runtime that emits this convergence warning. No warning was suppressed to make statuses agree. The evidence establishes a runtime-sensitive termination artefact; it does not establish a clinically or mathematically unidentifiable model.

## Every affected configuration

The following values are extracted from the retained R traces; `host3-summary.json` retains the fits, warnings and all diagnostic step results. Duplicate BCG/Colditz inputs are kept as separate source configurations.

| Configuration | Classification | Absolute SE difference, h=1e-4 | Absolute SE difference, h=1e-3 |
|---|---|---:|---:|
| `dat.chiarito2020::aspirin.vdeath::aspirin.total::all` | finite-difference Hessian | 1.64230128e-06 | 3.73700844e-08 |
| `dat.chiarito2020::p2y12.vdeath::p2y12.total::all` | finite-difference Hessian | 1.68051573e-06 | 1.81225857e-07 |
| `dat.chiarito2020::aspirin.mi::aspirin.total::all` | finite-difference Hessian | 1.83436413e-06 | 4.18771021e-08 |
| `dat.chiarito2020::p2y12.mi::p2y12.total::all` | finite-difference Hessian | 1.02065479e-06 | 7.77946796e-09 |
| `dat.chiarito2020::p2y12.stroke::p2y12.total::all` | bobyqa termination | 1.09614726e-06 | 5.72677166e-08 |
| `dat.collins1985b::stb.xci::fup.nci::all` | bobyqa termination | 9.7879782e-08 | 6.16259999e-09 |
| `dat.chiarito2020::aspirin.death::aspirin.total::all` | finite-difference Hessian | 2.29731103e-06 | 2.85112471e-08 |
| `dat.chiarito2020::p2y12.death::p2y12.total::all` | finite-difference Hessian | 4.9896765e-06 | 2.45569761e-08 |
| `dat.collins1985b::pre.xci::pre.nci::all` | finite-difference Hessian | 1.64330017e-06 | 3.27924828e-08 |
| `dat.dong2013::death::randomized::TIO-HH` | finite-difference Hessian | 1.05360924e-06 | 4.15179585e-08 |
| `dat.bcg::cpos::cpos+cneg::all` | finite-difference Hessian | 1.64452267e-05 | 4.17575591e-07 |
| `dat.bcg::tpos::tpos+tneg::all` | finite-difference Hessian | 1.21007828e-05 | 5.14401524e-08 |
| `dat.colditz1994::cpos::cpos+cneg::all` | finite-difference Hessian | 1.64452267e-05 | 4.17575591e-07 |
| `dat.colditz1994::tpos::tpos+tneg::all` | finite-difference Hessian | 1.21007828e-05 | 5.14401524e-08 |
| `dat.egger2001::ai::n1i::all` | finite-difference Hessian | 1.10216769e-06 | 3.03731643e-09 |
| `dat.egger2001::ci::n2i::all` | finite-difference Hessian | 1.1423101e-06 | 2.12617051e-08 |
| `dat.graves2010::ai::n1i::all` | finite-difference Hessian | 9.60295191e-06 | 1.52326768e-07 |
| `dat.graves2010::ci::n2i::all` | finite-difference Hessian | 1.31115762e-05 | 5.03168859e-08 |
| `dat.axfors2021::control_arm_event::control_arm_total::all` | finite-difference Hessian | 1.28583899e-06 | 3.76070898e-08 |
| `dat.axfors2021::hcq_arm_event::hcq_arm_total::all` | finite-difference Hessian | 1.88930862e-06 | 2.25841177e-08 |
| `dat.nissen2007::cont.death::cont.total::all` | finite-difference Hessian | 1.24564291e-06 | 3.63394457e-08 |
| `dat.obrien2003::cases::total::all` | finite-difference Hessian | 7.04558853e-06 | 1.20854428e-07 |
| `dat.tian2009::deaths::n::Control` | finite-difference Hessian | 3.95074452e-06 | 1.66672105e-07 |

## Why 4,352 native checks passed

`check-plus.mjs --runtime-log` consumes the native R log generated from exactly the browser script, then compares each result against both native package references. It does not start a browser or use WebAssembly. Thus it measured native-script parity twice (metafor and meta), not webR parity. The browser uses the same buildScript function, but R 4.5.1/metafor 4.8-0/lme4 2.0-1 instead of native R 4.6.0/metafor 5.2-1/lme4 2.0-6. Package/runtime versions alone were an earlier hypothesis; the traces now locate the divergent Hessian and optimiser termination. They do not isolate which compiled dependency or floating-point operation first diverges.

## Reproduction and scope

`trace-glmm.R` is instrumentation only: it traces glmer and optwrap, retains their actual fitted model/deviance function, and differentiates after the fit has completed. The first scratch trace accidentally shadowed the locked stats::fitted binding and is invalid; use the corrected native/browser final logs only. The corrected all-failures browser diagnostic passed (1 test, 23 cases). The later three-case common-parameter diagnostic also passed after normalising CRLF to LF before handing source text to webR. Earlier common-parameter attempts returned empty output or the captured CR parse error; they are not numerical evidence. Its first-stage start values were affected by R reference aliasing; the later common-parameter trace copies the start at function entry, while stage-two starts and fit/Hessian evidence in the final logs remain valid.

The opt-in `proportion-ma-plus-diagnostics.spec.mjs` selects failed cases from this directory and accepts GLMM_DIAGNOSTICS=1 (optionally GLMM_DIAGNOSTICS_SMALL=1 for the three smallest). Run with the lane-private Playwright configuration on port 8109. The trace records package versions and .libPaths(). The diagnostic test is not the strict live parity gate.

The UI recognises the multiset of event/total pairs for these 23 source configurations, regardless of labels or row ordering. This is a warning catalogue, not a fit lookup, and it does not supply estimates or override refusals. UI audit checks the warning; JSON exports carry a `validation` record; offline replay checks that record. Unmatched inputs are explicitly marked as not independently verified. The offline panel and same-runtime live panel retain their narrower meanings.

| Item | Static or dynamic | Evidence |
|---|---|---|
| Runtime settings and tolerance | Static, unchanged | plus-core.js |
| Input warning catalogue | Static, evidence-derived | plus-parity.js; host3-comparison.json |
| Fits, warnings and Hessian experiments | Dynamic R evaluations, archived | host3-summary.json; lane final diagnostic logs |
| Current fit and refusal | Dynamic bundled R, unchanged | plus-ui.js |
| Current warning and exported assessment | Dynamic exact count-multiset match | plus-parity.js; audited DOM/export tests |

No research identifiers or clinical findings are inferred. Configuration IDs and count pairs are checked against the existing metadat-derived corpus by `check-plus-diagnostics.mjs`.
