# IPD secondary plot fidelity — 12 October 2026

Follow-up to plot-repair PRs #93, #96, #97 and #98. Baseline main: `5d63417dc501d15028023079120be3d57515b639`.

## Confirmed defects

1. The network analysis calculated a full rank-probability matrix, but the persistent rankogram/cumulative plots instead drew formula-generated shapes from SUCRA. The table invented first/last-rank probabilities from the sorted position, and labelled SUCRA/100 as a P-score. Its headline retained an example treatment and 87.3%.
2. The enlarged survival view created a canvas but called a nonexistent renderer behind an absent result-field guard. It did not reuse the actual Kaplan–Meier curves drawn in the main plot.
3. Bayesian trace/posterior canvases were not repainted from saved chains when revisiting their panel or resizing.

Corrected baseline run **38224852411**, artifact **11736500087**, reproduced all three UI failures at 1280px and 390px (six deliberately failing cases). For a synthetic connected four-treatment network, the old table displayed about 47% first-rank probability while its own simulated result was about 81%. These are illustrative Monte Carlo values, not published clinical results. The first exploratory run also contained two test-fixture mistakes (a select treated as a text input and omitted synthetic variable mappings); those were corrected before attributing the six baseline failures to the app.

## Repair

`src/secondary-plot-adapters.js` is embedded in the delivered single-file HTML. Both ranking plots, the table and headline now use the same complete computed probability matrix. Input validation checks finite probabilities and row/column totals. The numerical ranking-direction selector reverses the actual distributions without resampling. Summary scores alone are never used to invent a rankogram.

The ranking display explicitly distinguishes numerical ordering from clinical benefit. This engine's binary contrasts use minus log odds ratios. Disconnected, unsupported survival and multi-arm designs without established covariance handling receive an explicit prerequisite instead of fabricated cross-component or multi-arm rankings. The underlying network fitter and rank sampler are unchanged.

Survival zoom is bound idempotently by mouse and keyboard. It redraws the same saved curves/options, supports resizing and downloads the actual enlarged image. Bayesian redraw uses existing chains, not a new MCMC run. Cached plots are tied to their result objects and input data; changed data invalidate the relevant display rather than silently retaining previous curves.

## Final evidence

Actions **38226877499**, artifact **11737050326**: **196 passed, zero failed, zero skipped, zero flaky, no retries**, Chromium over HTTP at desktop/mobile-sized viewports:

- `secondary-nma-pro.json`: six unchanged NMA Pro save/reopen and redraw checks, run with one worker.
- `secondary-and-native.json`: 156 passes — 14 new secondary plot checks plus 142 existing flagship/catalogue checks.
- `secondary-prior-runtime.json`: 34 earlier IPD diagnostic, fitted-display/export and browser-R checks.

The new cases check displayed probabilities, actual chart coordinates, two different distributions with equal SUCRA, direction reversal, unsupported-design explanations, stale-input invalidation, original-versus-enlarged survival curve equality and byte-exact downloaded PNG identity. Repaint checks require no refitting/resampling and unchanged input/configuration/results. The final mobile rankogram and cumulative plot screenshots were inspected.

An earlier combined three-worker run **38225657240** passed all ten then-existing new cases but had one existing NMA Pro five-second loading-overlay timeout (157/158). No NMA Pro source or assertions were changed. The final run isolates its six cases and runs the other groups with two workers; all pass. This timing issue is disclosed, not counted as a repaired NMA numerical defect.

## Limits

These tests establish the exercised display/data-preservation paths, not universal model validity, MCMC convergence, causal interpretation, clinical benefit, all optional workflows or every browser. Rendering the stored ranking matrix does not independently validate the statistical model producing it. Multi-arm/disconnected eligibility messages are intentional safeguards, not successful computations. HTA's separate beginner/advanced plot workflows require their own repair; this PR does not certify them.

Temporary patch builders and the branch-only write-enabled workflow were removed after successful testing. Retained regression tests are discoverable by the normal Playwright workflow.

Reproduce from `tests/playwright`:

```sh
npx playwright test nma-pro-session-plots.spec.mjs --workers=1 --retries=0
npx playwright test secondary-plot-fidelity.spec.mjs flagship-plot-rendering.spec.mjs catalog-svg-plots.spec.mjs --workers=2 --retries=0
npx playwright test remaining-plots.spec.mjs remaining-runtime-plots.spec.mjs ipd-fitted-display.spec.mjs --workers=2 --retries=0
```
