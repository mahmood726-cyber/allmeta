# allmeta — "best, most-tested MA suite in the world" roadmap

> Living plan, written 2026-05-30. Tracks what is DONE and the prioritised work to
> finish. Companion to `PROGRESS.md` (session notes) and `GOVERNANCE.md` (the quality
> bar: every methodology claim needs a cited reference + a committed R-parity test).

## Guiding principles
1. **Correctness is provable, not asserted.** Every number a user sees is backed by a
   committed parity/regression test vs established software (metafor / meta / netmeta /
   mada / robumeta / bayesmeta / netmetareg). No "matches R" claim without a test.
2. **Everything is portable.** Every chart downloads in multiple formats; every analysis
   exports a readable Methods + Results report plus machine-readable JSON/CSV.
3. **Accessible by default.** WCAG 2.1 AA; no critical axe violations.
4. **Offline-first, single-file, no telemetry.**

---

## Audit (2026-05-31) — fan-out correctness workflow
A 6-family adversarial audit (13 agents) flagged 32 candidates; verification confirmed
**5, filtered 25 false-positives** (the suite's math held up). All 5 fixed + tested:
- **proportion-ma** (BUG): "Fixed-effect only" silently ran DerSimonian-Laird (`effTau =
  tauEst==='FE'?'DL'`), so FE returned the RE result under heterogeneity. Fixed → tau2=0
  FE pool; verified vs hand FE logit pool. `c758519`
- **forest-plot** (BUG): exported `pool.ci_lb/ci_ub` read undefined fields (poolRE_PM
  returns lo/hi) → report showed "95% CI: NA" + broke live R-verify. Fixed. `ddece6f`
- **bayesian-nma** (robustness): disconnected networks threw an uncaught singular-matrix
  error; added a connectivity guard + try/catch. `4959848`
- **rare-events-glmm** / **gosh** (coverage): added CM.AL + DL-branch parity tests. `444a4ad`
- Uncertain/declined: nma RE-coverage (verifier found the RE branch IS tested — false);
  p-curve p-uniform delta is heuristic + untested numerically (low; future).

## DONE (verified, shipped)
- **Vendor SRI (CI-green, 2026-05-31):** the xlsx `.min.js` committed as LF (sha384-vtjasyid)
  but 3 live consumers (IPD-Submission, Pairwiseai bundle, Truthcert1 production) pinned the
  stale CRLF hash (ZmG1) → browsers blocked it → Excel export dead + red `playwright` CI.
  Repointed all 3 to the served LF hash; .gitattributes binary prevents recurrence. BOTH CI
  workflows (playwright + shared-tests) now green.
- **Correctness sweep (15+ commits):** genuine fixes in p-curve χ² tail, forest-plot &
  HTA prediction intervals (t_{k-1}), rare-events GLMM default, cumulative-subgroup
  between-group Q centre, rve-meta CR1 claim, bma-tau-priors uniform-prior weight bug,
  pubbias Harbord/Peters. Validations vs R: multi-outcome-ma (rma.mv), personalised-te
  (blup), nma-meta-reg (netmetareg). Capability: Q-profile I²/τ² CI on heterogeneity +
  forest-plot. All with committed parity specs.
- **Accessibility:** all critical axe violations eliminated; shared accent + amber tokens
  fixed (WCAG AA); nma-pro-v2 dark-mode text tokens fixed. Total axe violations 56 → ~33.
- **Chart export (every chart, multi-format):** `hub/shared/chart-export-auto.js` auto-adds
  SVG/PNG/JPG (+PDF when jsPDF present) to every non-Plotly chart; rolled out to ~30 apps.
- **Methods + Results report:** `results-export.js` emits a readable .md/.txt report
  (auto-built from each app's own title/description/methods footer + computed results);
  live in **38 apps** — the 20 original `resultsExport` apps + 11 accessor-ready apps +
  mcid/median-to-mean/powerma/gosh-metareg/km-reconstructor + bayesian-mcmc/bayesian-nma.

---

## NEXT — finish the suite-wide features (high priority)

### A. Methods+Results report — status
The shared report is live in **38 apps**. **nma-dose-response-app** is the one analysis
app NOT on the shared report, but it is NOT a gap: it ships its OWN richer native exports
(JSON `#exportJson`, CSV `#exportSummaryCsv`, GRADE profile, LaTeX table). It now also
exposes `window.__almLastNmaDR()` (reads the per-treatment summary table) so the shared
report CAN be wired later — the only blocker is that its complex fixed-UI layout overlaps
the auto-mount placement, so the export bar needs a curated mount location (its results
panel) rather than the generic before-footer spot. Low priority (already export-complete).
RoB/screening tools (rob2, robins-i/e, amstar-2, quadas-2, prisma-*, cerqual, cinema) could
export their judgement state as a report — lower priority (categorical assessments).

### B. PDF everywhere + Plotly multi-format
- ✅ **PDF everywhere (DONE 2026-05-31, `be90e01`):** chart-export-auto.js now lazy-loads
  the vendored jsPDF from its sibling vendor/ dir on the first PDF click, so every non-Plotly
  chart (~30 apps) downloads as SVG+PNG+JPG+PDF with no per-app change. (No Plotly apps exist
  in the suite, so the Plotly multi-format sub-item is moot.)
- Plotly apps (HTA, bayesian-mcmc, bayesian-nma, nma-dose-response) keep their modebar;
  configure `toImageButtonOptions` + add an SVG/PDF export so they match the SVG apps'
  multi-format parity. (chart-export-auto intentionally skips Plotly.)
- Add **canvas** coverage verification: a few apps render to `<canvas>` (the injector
  handles PNG/JPG/PDF for canvas) — add a canvas-source case to `chart-export.spec.mjs`.

### C. Make the export bars discoverable & consistent
- Standardise placement (currently the report bar mounts above the footer; the chart bar
  sits above each plot). Consider a single "Export ▾" affordance per app (chart formats +
  data + report) for a consistent UX.
- Add a "Copy to clipboard" alongside download for the Methods+Results text.

---

## NEXT — correctness depth (high priority, governance-critical)
1. ✅ **rare-events exact conditional CM.EL (DONE 2026-05-31, `e50d6c5`):** implemented the
   true conditional noncentral-hypergeometric likelihood (Fisher NCHG, Stijnen 2010) with
   adaptive Gauss-Hermite + ML, verified vs `metafor::rma.glmm(model="CM.EL")` to ~1e-7 on
   θ/τ² (~1e-3 on SE) across heterogeneous + near-homogeneous datasets. Added as a third
   model option (UM.FS stays default); more robust than metafor's CM.EL optimiser on very
   sparse data. The home-grown CM.AL profiled approximation is left in place (disclosed
   anticonservative, used by 3 Python test files). `rare-events-cmel-parity.spec.mjs`.
2. ✅ **rve-meta CR2 (DONE 2026-05-31, `955342a`):** implemented the CR2 bias-reduced
   sandwich + per-coefficient Satterthwaite df AND the HTJ CORR-model τ² moment estimator
   (the old engine used plain DL, coinciding with robumeta only at τ²=0). Symmetric
   inverse-sqrt via a new Jacobi eigensolver (CORR weights are constant-within-cluster, so
   the annihilator block is symmetric). Verified vs `robumeta::robu(small=TRUE)` to ~1e-11
   on τ², β̂, CR2 SE and df across homogeneous + heterogeneous datasets; `rve-meta-cr2-parity.spec.mjs`.
   CR1 retained via `{method:"CR1"}`. (HIER working model still R-only.)
3. **Untested-branch audit (continue):** dta-sroc Moses-Littenberg SROC verified vs R lm()/cor() incl. zero-cell CC branch (`54ade18`, was UI-only) — no bug. Keep spot-checking each effect-measure / sub-method
   in parity-covered apps against meta/metafor (this vein found the subgroup-Q and Harbord/
   Peters bugs). Next candidates: NMA measure branches, DTA LR/DOR edge cases, GLMM RR/RD.
4. ✅ **I²/τ² Q-profile CI extracted (DONE 2026-05-31, `aba63d5`):** `shared/heterogeneity-ci.js`
   (`window.AlmHetCI`) is now the single source; heterogeneity + forest-plot delegate to it
   (dead inline χ² helpers removed), and **workbench** shows the I²/τ² CI as a new consumer.
   Verified vs `metafor::confint`; `workbench-qprofile-ci.spec.mjs` locks it. Remaining
   poolers cumulative-subgroup (shows a *between-subgroup* I², different decomposition) and
   multilevel-ma (two variance components, no single I²) are NOT clean drop-ins — deferred,
   each needs its own model-appropriate CI rather than the simple-RE Q-profile.

---

## NEXT — accessibility (medium priority)
1. ✅ **nma-dose-response-app dark theme (DONE 2026-05-31, `ce0644a`): 22 → 0 axe contrast nodes.** Fixed by re-asserting the app's dark design tokens on html:root so the shared OS-scheme app-style.css can't clobber them (both sheets resolve dark), + light panel headings + explicit wizard-card text. Regression spec pins zero. [former root-cause note below]
   ROOT CAUSE (diagnosed
   2026-05-30): the app has an always-dark UI **mixed with some white-background regions**,
   AND it links `hub/app-style.css` whose `body { color: var(--ink) !important }` follows the
   **OS** colour-scheme — under a LIGHT OS, `--ink` resolves to dark `#202927` and paints dark
   text on the app's dark surfaces. A blanket `--ink`/body override flips the failure to
   light-text-on-white in the white regions, so it needs a **per-surface audit**: give each
   panel/region an explicit text colour matching its own background, and either stop inheriting
   app-style.css's body colour or set the app to a fixed scheme. (Done: `.pill` badge fixed —
   explicit light text on its dark bg, 10.2:1.)
2. **Structural landmarks:** HTA (9) + nma-dose-response (15) have content outside
   landmarks ("region"). Wrap content in `<main>`/`<section>` with roles.
3. **focus-studio** "contrast" flags are an axe gradient-background limitation (text is
   actually readable) — confirm and suppress via a solid fallback bg, or accept as FP.
4. Add `hub/shared/tests/a11y-sweep` as a CI gate that fails on any NEW critical violation.

---

## NEW capabilities to lead the field (medium/long term)
- **One-click reproducible R script** from every app (the "Verify in R" deep-link exists for
  some; make it universal and round-trip: app → R script → same numbers).
- **PRISMA-2020 + GRADE evidence-profile export** as a single bundle (the bus already moves
  pooled results to grade-sof; add a "export full SoF + PRISMA flow + forest" report).
- ✅ **Shared numeric core (FOUNDATION DONE 2026-05-31, `4673f6f`):** `shared/ma-core.js`
  (DL/PM/REML τ², IV random/fixed pool, HKSJ ± opt-in floor, Q, τ²-based I²) verified vs
  metafor::rma to ≤1e-7 (PM = exact Q-root). workbench migrated as the first consumer behind
  its 1e-6 oracle. Remaining apps can migrate incrementally behind the same parity guard.
- **TruthCert on every export**: optionally HMAC-sign the Methods+Results report so a reader
  can verify it was produced by allmeta and not altered.
- **Dataset interop**: import/export RevMan `.rm5`/`.rm6`, CSV templates, and Cochrane data.
- **Performance**: lazy-load heavy apps (nma-pro-v2 ~4.6s); Web Worker for MCMC/bootstrap.

---

## Testing & release engineering
- Keep the three green suites as the gate: repo `pytest` (261), R-parity backbone
  (`*/tests/test_against_*.py`, 118), and `hub/shared/tests/*.spec.mjs` (parity + a11y +
  chart-export + results-report).
- Add a **canvas chart-export** case and a **PDF (jsPDF present)** case once B lands.
- Stand up CI (GitHub Actions) running pytest + Playwright on the Pages-built artifact,
  plus a nightly axe-sweep diff that blocks new critical violations.
- Vendor a lockfile / SRI for every external asset; the suite must run fully offline.

---

## Definitive "done" checklist for best-in-world
- [ ] Every chart: SVG + PNG + JPG + PDF, verified by a spec.
- [ ] Every analysis app: Methods+Results (.md/.txt) + JSON + CSV, verified by a spec.
- [ ] Every quantitative output: a committed parity test vs reference software.
- [ ] Zero critical axe violations; AA contrast suite-wide; CI gate.
- [ ] One audited numeric core; no duplicated/untested stat branches.
- [ ] Reproducible-R round-trip from every app.
