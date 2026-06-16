# Real-scale NPE retrain (SE-matched) — frozen, grid-validated deliverable

**One line.** Widening the NPE training SE prior from `[0.1, 0.7]` to `[0.1, 3.0]`
— at the *same* corpus size as the canonical model — closes the out-of-support
over-confidence on real log-OR data **without regressing** the 55-cell
known-truth grid, at a measured ~14–18% in-support width cost. The real-scale
model is now a committed, grid-validated artifact (`sbi_model_realscale.pkl`),
selected via `SBI_MODEL_PATH` for large-SE corpora.

All numbers below are real seeded measurements (base_seed=20260611,
1000 reps/cell; train_seed=777123). Reproduction commands at the bottom.

---

## 1. Why

The canonical NPE (`sbi_model.pkl`) is trained on study SE ∈ [0.1, 0.7] (typical
of standardized mean differences). Real log-OR meta-analyses run far larger:

| Pairwise70 study-level SE | value |
|---|---|
| median | 1.741 |
| 90th pct | 2.032 |
| 99th pct | 2.828 |
| max | 2.828 |
| fraction > 0.7 | 0.712 |
| fraction > 3.0 | 0.000 |

So 71% of real studies sit beyond the canonical training support, and the full
real set is largely out-of-distribution. The consequence (REPORT §10): on the
full Pairwise70 set the canonical NPE / Unified-frozen intervals stay *narrower*
than REML and reject 0 *more* often than REML — residual over-confidence OOD.

`se_hi = 3.0` brackets **100%** of real study SEs (max 2.83) with margin, so it
is the right widened upper bound — confirmed from the data, not guessed.

## 2. What was trained

`sbi_model_realscale.pkl` — identical trainer, seed and corpus size to the
canonical model; the **only** change is the SE prior support.

| | canonical | real-scale |
|---|---|---|
| n_train / n_cal / n_val | 160k / 60k / 12k | 160k / 60k / 12k |
| train_seed | 777123 | 777123 |
| SE prior support | [0.1, 0.7] | **[0.1, 3.0]** |
| PIT KS (SBC) | 0.0305 | 0.0295 |
| post-conformal val coverage (target 0.95) | 0.953 | 0.953 |

Because corpus size and seed match, any difference downstream is attributable to
the prior, not to data volume. (The earlier prototype was trained at 35k/15k —
under ¼ the data — and is superseded by this full-scale retrain.)

## 3. Grid re-validation (55-cell known-truth) — MUST NOT regress

Re-scored on the IDENTICAL grid by swapping only the NPE per-rep dump
(`perrep_npe_realscale.json`); the PartialID dump is model-independent and
reused. Seed parity verified: degeneracy counts and selection fractions are
byte-identical across all 55 cells, so only the NPE intervals change.

Pass bar (REPORT §7): coverage of the true μ **≥ 0.90 on every cell** AND
type-I (reject-0 at μ=0) **≤ 0.07 everywhere**.

| config | model | min cover (55 cells) | worst type-I | mean width |
|---|---|---|---|---|
| NPE-alone (s=1.00) | canonical | 0.886 ✗ | 0.073 ✗ | 0.510 |
| NPE-alone (s=1.00) | **real-scale** | **0.903 ✓** | **0.049 ✓** | 0.584 |
| **Unified gated ×1.15 (frozen)** | canonical | **0.927 ✓** | **0.054 ✓** | **0.587** |
| **Unified gated ×1.15 (frozen)** | **real-scale** | **0.936 ✓** | **0.032 ✓** | **0.671** |

- **No regression.** Real-scale Unified-frozen holds ≥0.90 on every cell
  (min **0.936**, up from 0.927) with worst type-I **0.032** (down from 0.054).
  No cell falls below the bar; the worst-case margins actually improve.
- The wider prior even lifts **NPE-alone** over the bar on its own (canonical
  NPE-alone fails: 0.886 / 0.073 → real-scale 0.903 / 0.049).

### Where the width tax lands (Unified-frozen, per scenario family)

| scenario | min cover canon → real | mean width canon → real |
|---|---|---|
| none | 0.958 → 0.936 | 0.576 → 0.683 |
| step_weak | 0.988 → 0.992 | 0.596 → 0.702 |
| step_strong | 0.927 → **0.965** | 0.666 → 0.676 |
| copas_weak | 0.974 → 0.978 | 0.559 → 0.663 |
| copas_strong | 0.969 → 0.994 | 0.540 → 0.632 |

**Honest tradeoff.** The in-support intervals widen ~14% on average (mean width
0.587 → 0.671; per-cell median +18%). The tax is concentrated on the EASY cells
(none / copas / step_weak), where the canonical model was over-covering anyway.
On the HARD strong-step cells — the canonical failure mode — the width barely
moves (0.666 → 0.676) while coverage *rises* (0.927 → 0.965). So the prior
widening spends width where there was headroom and shores up coverage where it
mattered. Ten of 55 cells see a small coverage decrease (all remain ≥ 0.936,
down from canonical over-coverage near 0.98) — less over-insurance, not a breach.

## 4. Real-data re-validation (Pairwise70, OOD) — does the gap actually close?

No known truth on real data; this is a descriptive comparison to REML (the
common anchor, width 1.092 on the full set). Full set = 434 reviews
(median study SE ≈ 1.74).

**Full set (n=434):**

| method | median width canon → real | frac excl 0 canon → real | contains REML |
|---|---|---|---|
| REML (anchor) | 1.092 | 0.295 | 1.00 |
| NPE | 0.591 → 0.841 | 0.429 → 0.353 | 0.96 |
| **Unified-frozen** | **0.690 → 0.975** | **0.369 → 0.288** | 0.99 |
| Unified-union (fallback) | 1.581 → 1.588 | 0.180 → 0.175 | 1.00 |

The deployed Unified-frozen interval widens from 63% to **89%** of REML's width,
and its reject-0 rate falls to **0.288 ≈ REML's 0.295** — the over-confidence is
essentially eliminated, not papered over. Crucially the real-scale model **tracks
REML's honest width (0.975 ≈ 1.092)** rather than overshooting it like the
parameter-free union fallback (1.58), while still containing the REML point on
~99% of reviews. The point also lands closer to REML (median |dev| 0.055 →
0.025), since the wider prior de-biases less aggressively far from support.

**In-support subset (median study SE ≤ 0.7, n=136):** the real-scale model is
~12% wider than canonical (Unified-frozen 0.764 → 0.857; NPE 0.630 → 0.709) with
near-identical significance calls (frac excl 0 0.404 → 0.397) — the same
in-support precision cost seen on the grid, on real data.

## 5. Frozen decision

**Keep `sbi_model.pkl` (canonical) as the in-support default**; it is tighter and
passes the grid. **Ship `sbi_model_realscale.pkl` as a committed, grid-validated
artifact**, selected via `SBI_MODEL_PATH`, as the recommended estimator when the
observed median study SE exceeds the canonical support (~0.7) — e.g. log-OR-scale
corpora.

Rationale from the measurements:
- The real-scale model is a **strictly better OOD fix than the union fallback**:
  it tracks REML's honest width (0.975 vs union's 1.58 overshoot) and removes the
  over-rejection, while the union merely inflates width.
- It does **not** regress the grid (passes ≥0.90 / ≤0.07 on all 55 cells), so the
  swap is provably safe on in-support data too.
- But it costs ~12–18% width in-support, so it should not universally replace the
  canonical default for the SMD-scale domain the canonical model was tuned for.

`unified.unified()` already reads `SBI_MODEL_PATH`; `sbi.recommended_model_path()`
returns the right artifact for a given median study SE so callers can auto-select.

## 6. Reproduction

```bash
cd truth-recovery-bench

# 1. retrain (SE-matched, only the prior changes); ~20 min, 4 cores
python train_sbi.py --se-hi 3.0 --n-train 160000 --n-cal 60000 --n-val 12000 \
       --out sbi_model_realscale.pkl
#   -> sbi_model_realscale.pkl, sbi_diagnostics_realscale.json

# 2. re-dump NPE per-rep on the 55-cell grid with the real-scale model; ~35 min
SBI_MODEL_PATH=$PWD/sbi_model_realscale.pkl \
  python dump_perrep.py --methods NPE --reps 1000 --procs 4 \
         --out perrep_npe_realscale.json

# 3. grid before/after (reuses the model-independent PartialID dump)
python validate_realscale.py --npe perrep_npe.json           --tag canonical
python validate_realscale.py --npe perrep_npe_realscale.json --tag realscale

# 4. real-data re-run + section
cd real_data
SBI_MODEL_PATH=$PWD/../sbi_model_realscale.pkl \
  python run_realdata.py --tag realscale --out realdata_results_realscale.json
python build_section.py

# 5. regenerate REPORT.md (adds §7.1, refreshes §10)
cd ..
python report.py --results results_merged.json --out REPORT.md
```

Committed artifacts: `sbi_model_realscale.pkl`, `sbi_diagnostics_realscale.json`,
`validation_canonical.json`, `validation_realscale.json`, this file, and the
refreshed `REPORT.md` / `real_data/realdata_section.md`. Per-rep dumps
(`perrep_*.json`) and `realdata_results_*.json` are regenerable and gitignored.
