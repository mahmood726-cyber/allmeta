# Exact all-subsets GOSH

`exact-enum.js` fits all nonempty subsets (singletons included), with FE or DerSimonian–Laird pooling. The page retains the original enumeration for k <= 15 and the original seeded sampling algorithm. Above 15, Auto uses a sampled preview then exact enumeration up to k=26 FE or k=25 DL; users can explicitly choose Sample or Exact. These are workload cutoffs, not time guarantees. Manual exact mode supports up to k=30 (1,073,741,823 subsets). The signed mask and bounded count/table design is deliberately limited there. DL costs more because positive-tau² subsets require fresh member weights.

Enumeration runs in a worker, terminated by Cancel or edits to its inputs. If workers are unavailable, the page processes one high-mask block at a time within approximately 40 ms slices. Quantile collection and sorting can add a pause in this fallback; the worker is preferred. Estimates of duration are advisory. A single cached result is reused only for the same effects, SEs and model.

The density uses 100 x 100 cells over the input effect range and I² 0–100, with floor and clamping. Every cell count and per-study inclusion count is exact. Quantiles are actual type-7 order statistics located by histograms and collected on a second pass, not histogram approximations. Collection refuses before allocation if the required bins contain more than four million values (32 MB of doubles). Thus concentrated data can refuse quantiles below k=30; the page reports the failure and retains its labelled sampled preview. Nonrepresentable arithmetic is refused. Summaries, density, per-study means and exports identify exact enumeration or the sample count. The separate pre-existing extras panel continues to describe its own sampled draws when refreshed.

## Oracles and replay

The new corpus has 17 configurations, each FE and DL. `generate-exact-r.R` computes independent two-pass residual formulae, keeps every subset value, and uses R type-7 quantiles. `generate-exact-metafor.R` calls metafor 5.2.1 `gosh(..., subsets=2^k-1, parallel="no")` and verifies distinct complete membership. Both assert jsonlite 2.0.0 and checkpoint each model/configuration. Reference files and the new manifest are generated from these runs; existing validation corpora and manifests are untouched.

Continuous quantities use `abs(app-ref)/max(1,abs(ref)) <= 1e-9`, fixed before comparison. Counts and grid cells match exactly. Both sides use the same type-7 quantile convention. No density-bin tolerance is allowed. Per-quantity pass counts and maximum absolute/normalised errors are recorded by the replay.

```
node gosh/tests/exact-enum.test.cjs
node gosh/tests/exact-regressions.test.cjs
node gosh/tests/exact-compare.test.cjs
node gosh/validate/replay-numeric.cjs
node gosh/validate/exact/replay.cjs --out exact-audit.json
node gosh/validate/exact/replay.cjs --plant drop
node gosh/validate/exact/replay.cjs --plant weight
node gosh/validate/exact/replay.cjs --plant grid
```

Each planted replay must report failed checks and exit nonzero. These test missing subsets, perturbed input weights and moved grid counts. Aggregate comparisons cannot guarantee detecting a 1e-6 change to one arbitrary interior estimate among millions (its mean contribution is diluted by N); no per-subset equality claim is made for the large references. The small brute-force tests compare independent exhaustive summaries and the pinned legacy replay compares individual subset fits.

metafor 5.2.1 defaults to enumeration when `2^k-1 <= 1e6` (k <= 19), and to one million sampled subsets above that. Forced enumeration is supported. This is a choice of default workload and output storage, not a limitation in the statistical method. The lane `RESULT.md` contains measured times, counts, controls, limitations and reproduction commands. Node timings cover creation, both passes and summary; metafor timings cover the `gosh()` call, whose output stores all fits and membership. R can compose these summaries in a few lines.

`hub/shared/tests/gosh-exact.spec.mjs` checks the pins, numerical controls, worker result, responsiveness/cancellation, exports, cached state, refusal and fallback. Its `GOSH_EXACT_BASE` override supports a baseline page. Every test requires the new controller/engine/comparator or exact controls absent from 3442f62; none can pass on that page. Actual browser execution and baseline failure runs remain required when the host permits launching Playwright.
