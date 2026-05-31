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
- Vendor `hub/shared/vendor/jspdf.min.js` and include it in the analysis apps so the
  chart export bar shows **PDF** too (currently hidden where jsPDF is absent).
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
1. **rare-events-glmm CM.AL**: implement the true conditional non-central-hypergeometric
   likelihood (currently UM.FS is the verified default; CM.AL is disclosed-anticonservative).
   Verify vs `metafor::rma.glmm(model="CM.EL"/"CM.AL")`.
2. **rve-meta CR2**: implement the clubSandwich CR2 per-cluster bias correction +
   Satterthwaite df (currently CR1, disclosed ~20-30% anticonservative at small m).
   Verify vs `robumeta`/`clubSandwich`.
3. **Untested-branch audit (continue):** keep spot-checking each effect-measure / sub-method
   in parity-covered apps against meta/metafor (this vein found the subgroup-Q and Harbord/
   Peters bugs). Next candidates: NMA measure branches, DTA LR/DOR edge cases, GLMM RR/RD.
4. **I²/τ² Q-profile CI** to the remaining poolers (multilevel-ma, cumulative-subgroup,
   workbench) — extract the verified `qProfileCI` into `shared/heterogeneity-ci.js` (it is
   currently duplicated in heterogeneity + forest-plot; the 3rd consumer triggers the
   refactor) with a contract test.

---

## NEXT — accessibility (medium priority)
1. **nma-dose-response-app dark theme:** ~24 contrast nodes. ROOT CAUSE (diagnosed
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
- **Shared numeric core**: factor the repeatedly-verified routines (PM/REML/DL τ², HKSJ,
  Q-profile, IV pool, escalc-style measure conversions) into one tested `shared/ma-core.js`
  so every app uses the same audited math (single source of truth, fewer untested branches).
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
