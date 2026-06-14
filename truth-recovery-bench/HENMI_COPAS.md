# Henmi–Copas robust CI (frontier roadmap **P1**) — port + measured head-to-head

> _Truth-first report. The port is a faithful transcription of `metafor::hc()`,
> unit-tested to numerical agreement, then scored on the known-truth harness.
> Numbers are read from `hc_reference.json` (metafor 5.0.1) and
> `validation_henmi.json` (400 reps/cell, exact harness seeding)._

## The port

`methods.henmi_copas` is a line-by-line transcription of `metafor::hc.rma.uni`
(metafor 5.0.1): the **fixed-effect** inverse-variance weighted mean as the point
estimate (H&C's argument: the FE estimator is *less* sensitive to small-study /
publication bias than the random-effects estimator, which up-weights the small,
more-selected studies), and a confidence interval whose critical value comes from
matching the first two moments of the heterogeneity statistic Q to a gamma
distribution (the `EQ`/`VQ` functions) and solving an integral of that gamma CDF
against the standard normal via `uniroot`. Registered in `ALL_METHODS`, so it
participates in the truth-recovery head-to-head.

### Numerical agreement vs R `metafor::hc()`

28 cases (none/step/copas × k∈{5,10,15,25,50} + hand-built hetero / homogeneous-
τ²=0 / k=2 edge cases), scored by `gen_hc_reference.R` and asserted in
`tests/test_henmi_copas.py`:

| quantity | max abs diff vs metafor |
|---|---|
| point estimate (FE mean) | ~1e-14 (closed form) |
| τ² | ~1e-14 |
| CI bounds (`ci.lb`/`ci.ub`) | **3.06e-6** (uniroot/quadrature tolerance) |

Reference is committed (`hc_reference.json`) so the test runs without R; regenerate
with `python gen_hc_reference.py --emit-cases && Rscript gen_hc_reference.R`.

## Measured truth-recovery (400 reps/cell, exact seeding)

Against the directly comparable pooling / small-study competitors (`validate_henmi.py`):

| regime / metric | DL | REML | PET-PEESE | TrimFill | **HenmiCopas** | NPE (gated) |
|---|---|---|---|---|---|---|
| clean `|bias|` | 0.003 | 0.003 | 0.024 | 0.004 | **0.004** | 0.009 |
| clean coverage | 0.903 | 0.903 | 0.877 | 0.862 | **0.920** | 0.961 |
| under-sel `|bias|` | 0.107 | 0.107 | 0.040 | 0.076 | **0.090** | 0.059 |
| under-sel min cov | 0.000 | 0.000 | 0.175 | 0.077 | **0.020** | 0.960 |
| primary `|bias|` | 0.086 | 0.086 | 0.037 | 0.062 | **0.073** | 0.049 |
| primary mean width | 0.325 | 0.325 | 0.689 | 0.331 | **0.417** | 0.536 |
| type-I mean reject0 | 0.284 | 0.282 | 0.175 | 0.266 | **0.203** | 0.035 |
| type-I max reject0 | 0.932 | 0.910 | 0.517 | 0.877 | **0.780** | 0.085 |

## Verdict (honest)

HenmiCopas lands exactly where the method is designed to: it is a **heterogeneity-
robust CI**, not a publication-bias *corrector*.

- **On the interval-honesty axis it improves on naive FE/DL:** clean coverage
  0.920 (vs DL 0.903) at a still-modest width (0.417), the gamma-widening doing its
  job for unmodelled heterogeneity.
- **It does not correct the selection bias of the FE point.** "Less biased than RE"
  is not "unbiased": under selection its point bias (0.090) tracks DL's (0.107),
  so under strong publication selection the (widened) interval still misses the
  truth — under-selection min-coverage collapses to 0.020 and type-I inflates
  (max 0.780, though far better than DL's 0.932).
- **It is dominated by NPE on truth-recovery** under selection (NPE: bias 0.059,
  min-cov 0.960, type-I max 0.085), as expected — NPE is a selection-aware
  corrector, HenmiCopas is not.

It is a correct, valuable **competitor/baseline** in the head-to-head — the honest
"robust-CI without bias-correction" reference point — not a contender for the
headline estimator. That is the right outcome for this port.

## Reproduce

```
python gen_hc_reference.py --emit-cases && Rscript gen_hc_reference.R   # metafor reference
python -m pytest tests/test_henmi_copas.py -q                          # agreement <= 1e-4
python validate_henmi.py --reps 400                                    # head-to-head -> validation_henmi.json
```
