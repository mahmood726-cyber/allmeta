# copas — Cycle 2.8 Task 1 retrofit audit

**Date:** 2026-05-14
**Auditor:** Cycle 2.8 implementer subagent
**Method:** full source read (234-line single-file app, pre-retrofit)

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | Data entry is a raw `<textarea id="src">` with `effect, SE` per line. No `<input type="file">` anywhere. Wire `csv-upload.js` so users can upload a CSV with `study,yi,sei` columns. |
| Chart download | absent | Sensitivity curve is `<svg id="plot">` built via `innerHTML`. No download button. Wire `chart-download.js`. |
| Axis controls | absent | Plot y-axis domain is auto-computed from CI extremes. No min/max inputs. Wire `axis-controls.js`. |
| Results export | absent | Sensitivity grid is rendered to `<tbody id="body">` but no export button. Wire `results-export.js`. |
| URL state | absent | No `location.hash`, `URLSearchParams`, `pushState`, or `replaceState` anywhere. Wire `url-state.js`. |
| Reset/undo | absent | No reset button and no undo stack. Wire `reset-undo.js`. |
| Tooltips | absent | No `data-gloss` attributes. Wire `tooltips.js` with `data-gloss` on key terms. |

## Modules to wire in (all 7 absent)

- `csv-upload.js` — textarea input only; no CSV file input
- `chart-download.js` — no download buttons; SVG sensitivity curve inline
- `axis-controls.js` — no y-axis range inputs
- `results-export.js` — no export; sensitivity grid computed but not downloadable
- `url-state.js` — no shareable URL; no persistence
- `reset-undo.js` — no reset button and no undo stack
- `tooltips.js` — no glossary integration

## Modules to skip

None — all 7 are absent and need wiring.

## R-parity

**Engine:** Simplified Copas selection model (Copas 2000 parameterisation).
For each gamma step:
- Selection probability: `p_i = Phi(a - gamma / se_i)`
  where `a` is found by binary search so that `mean(p_i) = 1 - pUnobs`
- HT-reweighted adjusted pooled estimate:
  `sum(w_i/p_i * te_i) / sum(w_i/p_i)` where `w_i = 1/se_i^2`
- SE of adjusted estimate: `sqrt(1 / sum(w_i/p_i))`
- At gamma=0: standard FE inverse-variance pooling

**Canonical reference:** `metasens::copas()` (full MLE over gamma0/gamma1 grid)

**R-parity scope:** The JS HT approximation != metasens MLE; exact adjusted-estimate
matching is not possible. Tests verify:
  (a) Unadjusted FE matches R te_fe at tol=1e-4
  (b) Copas-adjusted direction: te_adj < te_re (attenuation)
  (c) Copas slope > 0 (small-study effect in fixture)
  (d) rho_bound = 0.9999 (model completion confirmed)

- **Cycle 7.2 override removed**: the `kind: non-numerical` override for `copas` is
  retired from `triage/triage-overrides.yaml`.
- Fixture: `tests/fixtures/copas-tiny.csv` (10 rows: `study,yi,sei`;
  effects 0.12–0.55, SEs 0.07–0.20; varied precision to trigger selection detection).
- R script: `tests/fixtures/copas-tiny.R` (metasens::copas() + meta::metagen()).
- Values captured 2026-05-14 (R 4.5.2, metasens):
  - `te_re   = 0.248973119064`   (DL RE pooled, unadjusted)
  - `se_re   = 0.032431596631`
  - `tau2_dl = 0.0005030100235`  (near-homogeneous fixture)
  - `te_fe   = 0.246944262521`   (FE pooled)
  - `se_fe   = 0.031411004650`
  - `te_adj  = 0.216959372226`   (Copas MLE-adjusted; −13% vs RE)
  - `se_adj  = 0.035016325088`
  - `slope   = 0.477176161301`   (positive: small-study effect)
  - `rho_bound = 0.9999`
- Pure-Python HT formula tests: additional 8 unit tests cover pnorm,
  binary-search, monotone attenuation, selection probability bounds.

## Engine parameterisation notes

The JS engine implements the "sensitivity across gamma" Copas variant from
Copas & Shi (Biostatistics 2000). It is NOT the full bivariate MLE (which
metasens::copas implements). The HT reweighting is a pedagogical approximation
that shows the direction of adjustment without requiring grid MLE. The footer
disclaimer ("Simplified implementation") is intentionally honest about this.

## Browser sanity

Verified via `copas/tests/sanity.spec.mjs` (Playwright on Chromium) after retrofit.
