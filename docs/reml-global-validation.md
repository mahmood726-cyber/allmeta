# REML numerical review of PR #84 — 10 October 2026

The defect is confirmed. On the supplied CD006536 inputs, current `main`
returns τ² = 0, while fresh R/metafor and independent residual-contrast
calculations select τ² = **0.04495467370154**. Its REML score at zero is
positive (3.41849235); zero is not even a local likelihood maximum in this
example. The original iteration can oscillate back to zero.

The original PR repairs this example, but its zero-only 64-point search does
not reliably select a global maximum. This revision replaces that guard with
an adaptive search over the full nonnegative parameter range. It retains the
normal-normal, intercept-only REML model; it does not change the estimand,
CI method, study inputs or defaults.

## Additional failures in the original PR

| Input | Original PR τ² | Global reference τ² | Evidence |
|---|---:|---:|---|
| CD006536, `main` before PR | 0 | 0.04495467370154 | Interior log-likelihood is higher by 0.06957594 |
| Seed 84084, case 1530 | 0.00000721279806 | 0.06038711860754 | Two positive maxima; larger mode wins by 0.12975547 |
| Seed 84084, case 1917 | 0.02871909419270 | 0.76337687410810 | Two positive maxima; larger mode wins by 0.09552888 |
| Narrow competing peak, three studies | 0 | 3.81916533271494 | Peak beats zero by 0.000001, but no original grid sample does |
| Same three-study example with slightly smaller outlier | 0 | 0 | Interior peak exists but the boundary is genuinely better |

The narrow example has `yi = [0, 0, 3.825181659653519]` and
`vi = [0.0001, 0.0001, 1]`. Its positive stationary points are approximately
0.05807291 (minimum) and 3.81916533 (maximum). Merely polishing the best grid
sample misses the maximum. The regression suite preserves all these inputs.

Multiplying the CD006536 effects by 10⁻¹²⁰ or 10¹²⁰ and variances by the
square of that factor makes the original PR return `NaN`. The revised τ²
estimator preserves the correct rescaling. These extreme checks concern τ²;
they do not establish extreme-range stability of every other pooled statistic.

## Why the revised search covers competing modes

For sampling covariance `V = diag(vi)`, write
`P(t) = W - w w' / sum(w)`, where `W = diag(1/(vi+t))` and `w = W 1`.
The REML score is

```
s(t) = 1/2 [A(t) - B(t)]
A(t) = y' P(t)^2 y
B(t) = trace(P(t))
```

Since `P'(t) = -P(t)^2`, both `A` and `B` decrease. On every interval `[a,b]`,

```
(A(b) - B(a))/2 <= s(t) <= (A(a) - B(b))/2.
```

An interval with a sign-definite score has its maximum at an endpoint.
Otherwise, integrating these score bounds from both endpoints gives an upper
bound on the best likelihood anywhere inside. An interval is discarded only
when this bound cannot improve the best candidate within the stated numerical
tolerance; otherwise it is subdivided. This also checks intervals whose two
endpoint scores have the same sign, where a pair of hidden roots can exist.
Score bisection supplies candidates; it never substitutes for this interval check.

The search has a finite upper bound. In an orthonormal basis of residual
contrasts, diagonalising `H' V H` gives positive eigenvalues `lambda_j` and
contrast coordinates `z_j`. The score is
`1/2 sum [z_j²/(lambda_j+t)² - 1/(lambda_j+t)]`.
For `t >= sum(z_j²) = sum((yi-mean(yi))²)`, every term is negative. No better
maximum is omitted beyond that endpoint.

Effects are centred at the most precise study and effects/variances are
rescaled together. Weights are scaled to at most one; the REML determinant
cancels the most precise variance's logarithm analytically; a pair sum avoids
cancellation in `trace(P)` when one study dominates. Two-study and equal-
variance cases use exact closed forms. Invalid variances and unrepresentable
ranges throw `RangeError` instead of returning a plausible zero or `NaN`.

These interval arguments hold in exact arithmetic. The implementation uses
double precision, conservative rounding slack proportional to study count,
and a likelihood stopping tolerance of
`1e-11 + 64*epsilon*(k+1)*max(k, abs(best_loglik))` on the normalised scale.
This is not a formal outward-rounded interval-arithmetic certificate for all
IEEE-754 inputs. Adjacent representable endpoints terminate refinement; a
100,000-evaluation limit raises an error rather than silently accepting an
unresolved maximum. Nearly tied modes below numerical resolution cannot be
distinguished reliably. No global optimisation claim is added for ML or for
multivariate/multilevel/meta-regression engines.

## Independent reference execution and tests

- **Fresh R 4.5.1 / metafor 4.8-0**, executed with the repository's WebR
  WebAssembly runtime. This is a fresh R execution, not just stored historical
  references or SciPy calculations; it is not a native-platform R execution.
- `tests/reml_reference.R` independently diagonalises orthogonal residual
  contrasts, isolates score crossings on 4,096 positive scales, compares every
  root with zero, and obtains pooled/Wald/Hartung–Knapp results from
  `metafor::rma` at the selected τ².
- Default, damped and strict metafor iterative runs are recorded separately.
  Defaults fail to converge on all three real-review fixtures. Damping
  (`stepadj=.5`) resolves them. On the close boundary-winning example,
  metafor's default boundary likelihood tolerance accepts the inferior interior
  peak; setting `tol=1e-12` returns zero. Comparing one default fit would
  therefore be an insufficient reference check.
- Seven real/adversarial inputs match the fresh R reference for τ², pooled
  effect, SE, I², Wald CI and raw Hartung–Knapp CI to the stated test tolerance
  (`2e-8` absolute/relative). Source/input/package hashes accompany the capture.
- **3,000 seeded SciPy contrast-profile checks**, including 63 non-unimodal
  score profiles: no corrected failures; the original PR fails twice.
  Maximum corrected likelihood loss is 1.42e-14, versus a 1e-7 stress threshold.
  The finite-grid reference is a stress oracle, not a mathematical proof of
  complete root isolation. Explicit adversarial fixtures complement it.
- Unit tests cover zero, one and two studies; equal variances; identical effects;
  a tiny positive optimum; translation/permutation; scale factors 10⁻¹²⁰–10¹²⁰;
  malformed/nonfinite/zero variances; and unrepresentable ranges.
- Full repository Python suite: **404 passed, six skipped** for missing
  optional `jsonschema` / `linkedom` dependencies. The final focused core suite
  passes 24 tests. Separate app suites requiring native `Rscript` are skipped;
  the fresh WebR reference above supplies the REML check.
- A browser regression exercises the Heterogeneity Explorer's input, REML
  selection, displayed/exported estimate and prediction interval. Local
  Playwright execution is blocked before page creation by the execution
  environment's Unix-socket restriction (`socket(): Operation not permitted`).
  No browser pass is claimed. The new spec is included in existing PR CI.

## Scope and implications for reported results

The shared fix reaches callers of `AlmMaCore.tau2REML` / `pool(method='REML')`:
Heterogeneity, Influence, RMST, correlation pooling, workbench/review-project
synthesis, and the REML specifications in specification-collapse/Atlas audit
helpers. It also changes REML starting values in the selection-model engine;
that engine's later optimisation and experimental status are separate.
Loading `ma-core.js` alone does not imply an app uses this estimator.
PM/DL/FE results and the distinct NMA, dose-response multivariate, multilevel,
location-scale and DTA estimators are not changed by this patch.

Using the existing Fragility Atlas loader on the pinned Pairwise70 data gives
473 selected analysis inputs. Relative to current `main`, only CD006536 has
an absolute τ² change above 1e-7, a relative model SE change above 1e-6, or a
relative prediction-width change above 1e-6. There are no Wald CI
null-exclusion flips. No additional selected full-set review changes at the
τ² threshold relative to the original PR.

| CD006536, analysis-scale result | `main` | Corrected |
|---|---:|---:|
| τ² | 0 | 0.0449546737 |
| Pooled effect | -0.1616205712 | -0.1552607006 |
| Model SE | 0.1651924347 | 0.1719588068 |
| I² (%) | 0 | 3.57799018 |
| Wald 95% CI | [-0.485391794, 0.162150651] | [-0.492293769, 0.181772368] |
| t-based 95% prediction interval | [-0.494992401, 0.171751259] | [-0.706180391, 0.395658990] |

Its SE increases 4.10%; prediction-interval width increases 65.26%. Both Wald
CIs include zero. `reml-impact-2026-10-10.json` records exact results, the changed
input, input/loader hashes, and pinned commits. This scan uses one loader-
selected analysis per review; it does not establish the impact on all outcomes,
subgroups, leave-one-out sets, sensitivity specifications or published papers.
The loader's analysis selection, duplicated observations and scale choices
remain separate scientific questions. Previously exported REML results using
the old shared core should be recomputed when these input patterns occur.

Independent engines need separate follow-up. Function-level probes of
`Pairwiseai/app.js::estimateTau2_REML` return 0.0255054003 (marked converged)
for CD005566, against 0.0330421359. The helper
`IPD-Meta-Pro/ipd-meta-pro.html::estimateREML` returns 0.0692249085 on that same
input. They do not delegate to the shared core. Exact probes and source hashes
are in `reml-standalone-followups.json` and can be regenerated with
`scripts/audit_standalone_reml.cjs`. These probes establish numerical helper
mismatches, not which helper is active in every browser workflow. They are not
repaired by this PR; avoid describing this change as suite-wide validation.

## Reproduce

```bash
python -m pytest tests/test_ma_core_tau2.py tests/test_reml_global.py -q
python scripts/validate_reml_global.py --cases=3000
node scripts/validate_reml_reference.cjs   # native R with metafor installed
node scripts/audit_standalone_reml.cjs
cd tests/playwright
npm ci
npx playwright install chromium
npx playwright test reml-global.spec.mjs heterogeneity-qprofile.spec.mjs
```

For the executed WebR reference (run from the repository root):

```bash
npm install --prefix /tmp/allmeta-reml-reference ws
curl -fL https://repo.r-wasm.org/bin/emscripten/contrib/4.5/digest_0.6.39.tgz \
  -o /tmp/allmeta-reml-reference/digest_0.6.39.tgz
NODE_PATH=/tmp/allmeta-reml-reference/node_modules \
  node scripts/validate_reml_reference.cjs --webr \
  --digest=/tmp/allmeta-reml-reference/digest_0.6.39.tgz
```

The fresh reference capture and stress summary are versioned under
`tests/fixtures/`. The stress script can compare the original PR module using
`--compare-module=/path/to/original-ma-core.js`; it records that file's hash.

## Review and release state

The local review branch combines original PR #84 (`296cc4996b...`) with current
`main` (`e47acf19f1...`) without conflicts. GitHub's live initial check reported
#84 cleanly mergeable, unlike the earlier supplied status. Publication of this
revision updates the review branch only. Maintainer review and PR CI remain
required before any merge.

The final GitHub check shows PR #83 closed and unmerged (closed at
2026-10-10T21:25:12Z), with its draft flag retained and no auto-merge configured.
It is left in that held state. Its stated paper
finalisation / coordinated archive prerequisites are not established by this
numerical review. This work does not merge, tag, deploy or release either PR.

References:
- [metafor `rma.uni` documentation](https://wviechtb.github.io/metafor/reference/rma.uni.html),
  especially starting values, convergence, step adjustment and boundary checks.
- [metafor implementation](https://github.com/wviechtb/metafor/blob/master/R/rma.uni.r).
- [PR #84](https://github.com/mahmood726-cyber/allmeta/pull/84) and
  [held release PR #83](https://github.com/mahmood726-cyber/allmeta/pull/83).
