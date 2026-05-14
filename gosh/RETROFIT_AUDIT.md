# gosh — Cycle 2.8 Task 2 retrofit audit

**Date:** 2026-05-14
**Auditor:** Cycle 2.8 implementer subagent
**Method:** full source read (219-line single-file app, pre-retrofit)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | Data entry is a raw `<textarea id="src">` with `effect, SE, label` per line. No `<input type="file">` anywhere. Wire `csv-upload.js` so users can upload a CSV with `study,yi,vi` (or `sei`) columns. |
| Chart download | absent | GOSH scatter is `<svg id="plot">` built via `innerHTML`. No download button. Wire `chart-download.js`. |
| Axis controls | absent | Plot axes auto-computed from data. No min/max inputs. Wire `axis-controls.js`. |
| Results export | absent | Summary stats computed but not exportable. Wire `results-export.js`. |
| URL state | absent | No `location.hash`, `URLSearchParams`, `pushState`, or `replaceState` anywhere. Wire `url-state.js`. |
| Reset/undo | absent | No reset button and no undo stack. Wire `reset-undo.js`. |
| Tooltips | absent | No `data-gloss` attributes; only `../shared/glossary.js` linked (wrong path). Wire `tooltips.js` with `data-gloss` on key terms (I², GOSH). |

## Modules to wire in (all 7 absent)

- `csv-upload.js` — textarea only; no CSV file input; accepts `study,yi,vi` or `study,yi,sei` columns
- `chart-download.js` — no download buttons; GOSH scatter SVG inline
- `axis-controls.js` — no axis range inputs (both x and y axes)
- `results-export.js` — no export; summary stats computed but not downloadable
- `url-state.js` — no shareable URL; no persistence
- `reset-undo.js` — no reset button and no undo stack
- `tooltips.js` — no glossary integration

## Modules to skip

None — all 7 are absent and need wiring.

## R-parity

**Engine:** All-subset meta-analysis (GOSH — Olkin, Dahabreh, Trikalinos 2012).
For each non-empty subset of size >= 2:
- FE: inverse-variance pooling `mu = sum(w_i * y_i) / sum(w_i)`, `w_i = 1/SE_i²`
- DL RE: DerSimonian-Laird tau² added to each study's variance
- I²: `max(0, 100*(Q-df)/Q)` where `Q = sum(w_i*(y_i-mu_FE)²)`, `df = k-1`
- For k <= 15: full enumeration of `2^k - 1` non-empty subsets (skipping size-1)
- For k > 15: random sampling with seeded xoshiro128** PRNG (advanced-stats.md rule)

**Canonical reference:** `metafor::gosh(rma.uni(yi, vi, method="FE"), progbar=FALSE)`

**R-parity scope:** Full enumeration (k=5, 26 subsets) is deterministic — exact matching is possible.
Tests verify:
  (a) Subset count: 26 (metafor and JS both skip size-1 subsets)
  (b) Median FE estimate: 0.2217 at tol=1e-4
  (c) Full-k FE estimate: 0.2254 at tol=1e-6 (closed-form IV — exact)
  (d) Min/max range bounds
  (e) I² in [0, 100]

- **Cycle 7.2 override removed**: the `kind: non-numerical` override for `gosh` is
  retired from `triage/triage-overrides.yaml`.
- Fixture: `tests/fixtures/gosh-tiny.csv` (5 rows: `study,yi,vi`;
  effects 0.15–0.45, variances 0.0049–0.0324; varied precision).
- R script: `tests/fixtures/gosh-tiny.R` (metafor::gosh() + rma.uni()).
- Values captured 2026-05-14 (R 4.5.2, metafor 4.x):
  - `n_subsets = 26`    (k=5 full enumeration; size >= 2 filter)
  - `median_est = 0.2217261558338`   (FE, median across 26 subsets)
  - `q25_est    = 0.2047081408179`
  - `q75_est    = 0.2615342255235`
  - `min_est    = 0.18`              (size-2 subset: S04 + S01)
  - `max_est    = 0.3565384615385`   (size-2 subset with high-effect pair)
  - `median_i2  = 0.0`              (fixture is near-homogeneous)
  - `full_k_est = 0.2254227851625`  (all-k FE pool)
  - `full_k_i2  = 0.0`
- Pure-Python formula tests: 13 unit tests cover FE pooling, subset counting,
  median/min/max matching R, SE positivity, size distribution checks.

## Engine parameterisation notes

The k>15 random-sampling branch uses a seeded xoshiro128** PRNG (same seed every
run) for reproducibility across sessions. This matches the `metafor::gosh()` default
behaviour of sampling a fixed number of random subsets when full enumeration would
be computationally infeasible. The `n_subsets` parameter visible when k>15 defaults
to 5,000 (metafor default is 10,000; lower for browser speed).

## Browser sanity

Verified via `gosh/tests/sanity.spec.mjs` (Playwright on Chromium) after retrofit.
