# Severity-gated correction (frontier roadmap **P1.1**) — measured result

> _Truth-first report. This is the inference-time fix that `ROBUST_RETRAIN.md`
> identified as the correct next lever after two full robust-SBI retrains failed
> to remove the clean-data tax without collapsing coverage. Numbers below are read
> directly from `validation_gate.json` (A/B at **800 reps/cell**, exact harness
> seeding); nothing is hand-typed. It is a **wrapper/gate on the committed
> `sbi_model.pkl`, not a retrain.**_

## The problem (restated from ROBUST_RETRAIN.md)

The trained NPE applies a learned **downward** de-biasing residual even when the
data show **no** observable selection. On clean (`none`) data that residual is a
pure tax: NPE `|bias|` ≈ 0.055 vs DerSimonian–Laird's ≈ 0.003 (DL is unbiased
with no selection). Two global retrains confirmed the objectives are in direct
tension under any fixed training mixture: making the correction milder cut the
tax but collapsed coverage under strong selection; keeping coverage kept the tax.

## The fix — inference-time, severity-gated, point-only

Reuse the selection-severity score the estimator **already computes** for its
Mondrian conformal bins (`train_sbi._sev_proxy` — a funnel/Egger + p-step-
fingerprint scalar) and dial the NPE point back toward the unbiased DL estimate
when that severity is low:

```
g       = smoothstep((sev - S0) / (S1 - S0))      # S0=2.0, S1=6.0  (in [0,1])
mu_gate = DL_mu + g * (NPE_mu - DL_mu)            # clamped into the conformal interval
```

`g → 0` on clean data (recover DL's near-zero bias); `g → 1` under strong
selection (keep the full NPE correction). **Crucially the gate touches ONLY the
point estimate — the conformal interval, τ² and SE are returned verbatim** — so
coverage, interval width and type-I error are *mathematically identical* to the
ungated NPE on every cell. The only price is a rise in the point bias under
selection (still far below DL's), reported honestly below.

### Why point-only (and why not recentre / blend the interval)

The diagnostic in `diag_sev.py` shows severity does **not** cleanly separate
`none` from weak selection (`step_weak`/`copas_weak` overlap `none` heavily), and
under strong selection at μ=0 the step fingerprint collapses (`p_bin_lo ≈
p_bin_hi`), so `_sev_proxy` *under-detects* it. `explore_gate.py`/`_gate2.py`
confirmed that **recentring** the interval on the gated point restores
lopsidedness but inflates type-I catastrophically at `step_strong`, μ=0 (reject-0
up to 0.45), and **blending** toward DL's narrow interval loses coverage. Keeping
the NPE interval verbatim sidesteps both failure modes by construction — the
clean-data tax is a *point* problem, so it gets a *point* fix.

The gate is on by default and fully reproducible / disable-able via env
(`SBI_GATE=0` recovers the exact ungated estimator; `SBI_GATE_S0`, `SBI_GATE_S1`
retune the band). The thresholds were chosen on the known-truth grid
(`explore_gate4.py`), not on any single dataset.

## Measured before/after (known-truth harness, 800 reps/cell, exact seeding)

`old` = ungated NPE (committed `sbi_model.pkl`); `gated` = same artifact + gate.
Unified inherits the gated NPE point. ✅ = moved the intended direction,
· = unchanged (by construction), ⚠️ = honest regression.

| metric | NPE old | NPE gated | Δ | DL ref |
|---|---|---|---|---|
| **clean-data tax** `|bias|` (none) | 0.056 | **0.010** | **−0.046 ↓ ✅** | 0.002 |
| clean width (none) | 0.524 | 0.524 | 0.000 · | 0.355 |
| clean coverage (none) | 0.962 | 0.962 | 0.000 · | 0.910 |
| under-sel mean `|bias|` | 0.026 | 0.058 | +0.032 ↑ ⚠️ | 0.106 |
| under-sel mean coverage | 0.987 | 0.987 | 0.000 · | 0.626 |
| under-sel **min coverage** | 0.963 | 0.963 | 0.000 · | 0.003 |
| primary mean coverage | 0.982 | 0.982 | 0.000 · | 0.682 |
| primary min coverage | 0.944 | 0.944 | 0.000 · | 0.003 |
| primary mean width | 0.536 | 0.536 | 0.000 · | 0.325 |
| type-I mean reject-0 | 0.035 | 0.035 | 0.000 · | 0.290 |
| type-I **max reject-0** | 0.074 | 0.074 | 0.000 · | 0.924 |
| stress mean coverage | 0.978 | 0.978 | 0.000 · | 0.238 |
| stress min coverage | 0.941 | 0.941 | 0.000 · | 0.000 |

## Verdict (templated against the numbers above)

- **Clean-data tax — the headline goal: SOLVED.** `|bias|` 0.056 → **0.010**, an
  **82% cut**, landing one Monte-Carlo step from DL's 0.002. Where the two global
  retrains could only reach 0.040 (v1, at the cost of OOD coverage) or 0.052 (v2,
  no real cut), the gate reaches 0.010 with **zero** coverage cost.
- **The hard constraints — coverage / width / type-I: provably untouched.** Every
  one of those rows is identical to two-decimal precision because the gate is a
  point-only transform (the tiny Unified-side wiggles in `validation_gate.json`
  come only from the gated point changing which replications trip Unified's
  disagreement-widening — NPE itself is byte-identical). Under-selection
  min-coverage stays 0.963 (≥0.90 bar); type-I max stays 0.074.
- **The honest cost.** Under selection the mean point `|bias|` rises 0.026 → 0.058
  — because on weak-selection replications that *look* clean to any observable
  severity score, the gate pulls the point toward the (mildly biased) DL estimate.
  This is the irreducible price of not being able to distinguish weak selection
  from no selection by funnel geometry alone. It is still **roughly half of DL's
  0.106**, and the *interval* on those replications is unchanged, so coverage is
  fully protected. We report it rather than tune it away.

**Bottom line:** the severity gate does exactly what the retrain could not — it
removes the clean-data tax surgically (−82%) while leaving the entire coverage /
type-I / width profile of the production estimator mathematically intact. It is
the recommended default (`SBI_GATE=1`).

## Reproduce

```
python validate_gate.py --reps 800                 # full A/B -> validation_gate.json
python -m pytest tests/test_severity_gate.py -q     # interval-identity + de-bias invariants
# config provenance:
python diag_sev.py        # severity vs scenario (separation diagnostic)
python explore_gate4.py   # point-only gate sweep used to freeze S0=2.0, S1=6.0
```
