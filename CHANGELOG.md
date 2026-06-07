# Changelog

All notable changes to allmeta are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html) from
v1.0.0 onward.

The `Unreleased` section accumulates work between tags. On each release
the section is renamed to that version and dated, and a fresh
`Unreleased` section is started.

## [Unreleased]

### Added
- _(items added since the most recent tag will be listed here)_

---

## [1.1.0] — 2026-06-07

The integrity-and-enforcement release: make verifiable truth the product, not
app count. Eight new method apps grounded in named 2024–26 papers, four CI gates
that keep the platform's claims honest, and an end-to-end signed review pipeline.

### Added — integrity & trustworthiness apps

- **E-value** (`/evalue/`) and **Fragility index** (`/fragility/`) — thin apps
  over the R-verified shared modules (sensitivity to unmeasured confounding;
  event-count fragility).
- **INSPECT-SR trustworthiness appraiser** (`/inspect-sr/`) — faithful
  Wilkinson 2025: 21 checks across 4 domains plus an MA-level "would the
  conclusion survive" re-pool via `ma-core`.
- **Spec-collapse multiverse MA** (`/spec-collapse/`) — naive-concordance,
  naive IV-RE-collapse, and weighted-likelihood t-mixture aggregators over a
  36-spec grid; cross-language parity with the Python `spec-collapse-atlas`
  engine to 1e-6.
- **Reporting-bias / ROB-ME cockpit** (`/reporting-bias/`) — registry
  linkage-rate denominator, outcome-switching diff, and Egger-as-input feeding
  an 8-question ROB-ME missing-evidence judgement.
- **POTH — precision of treatment hierarchy** (`/poth/`) — Wigle 2025; flags
  non-informative SUCRA hierarchies (POTH < 0.5).
- **UWLS / multiplicative-heterogeneity MA** (`/multiplicative-ma/`) —
  Stanley & Doucouliagos 2015; inflates within-study variances by φ = Q/(k−1)
  instead of adding τ². Recommended as the primary estimator for observational
  syntheses.
- **Multiplicative-heterogeneity NMA** (`/multiplicative-nma/`) — the network
  generalisation of UWLS: fixed-effect contrast-based NMA with SEs inflated by
  √φ, plus an additive-vs-multiplicative AIC verdict.
- **Signed, tamper-evident review pipeline** (`/review-project/`) — a 9-stage
  SHA-256 provenance chain (HMAC sign/verify; verification locates the first
  tampered stage) that composes the integrity apps end-to-end.

### Added — enforcement gates (CI, fail-closed)

- **Single-source meta-math lint** — inventories inline τ²/I² reimplementations
  that risk drifting from the audited `shared/ma-core.js`.
- **TruthCert-on-export** — HMAC-signed, verifiable receipts on every SVG/PNG/
  PDF/JSON export across the numerical apps, bound to the current results (not a
  stale bus).
- **DOI-grounding gate** — every citation claimed in `shared/citation.js` is
  Crossref-resolved into a committed offline cache with a title-overlap check;
  caught and fixed two wrong DOIs.
- **Honest parity-coverage ledger** — generated from the actual parity specs;
  explicitly discloses which numerical apps are *not* yet R-covered.
- **Claim/code drift sweep** — catalog↔filesystem bijection (with reachability
  and a documented-pilot exempt list), README/manifest declared-count
  consistency, and parity-ledger freshness.

### Added — shared engines (oracle-verified)

- `shared/truthcert-export.js`, `shared/egger.js` (vs R `lm`),
  `shared/spec-collapse.js` (vs Python), `shared/poth.js` (closed-form),
  `shared/uwls.js` (vs R `lm`), `shared/multiplicative-nma.js` (vs an
  independent WLS oracle / `netmeta`), `shared/review-bundle.js`.

### Fixed

- Export signing previously bound the stale study bus, yielding receipts that
  did not describe the displayed result; now binds the current results only and
  warns on fail-open.
- Multi-persona review fixes: Atal-2019 page range corrected (Crossref); E-value
  guard restricted to ratio measures; fragility study-label XSS escaped;
  reporting-bias radio `:has()` fallback; INSPECT-SR "unset" excluded from the
  no-concern pool.

### Changed

- Catalog grew to 106 entries (100 repository-hosted, 6 external).

---

## [1.0.0] — 2026-06-02

First archived release. Establishes the reproducibility audit trail
(producedBy + seed + report bundle + diff), the protocol-publishing
flow, and PRISMA-P / PROSPERO-aligned tooling.

### Added — discovery & publishing

- **Method finder** (`/finder/`) — 2-3 question wizard routes 80+ apps
  down to the 1-3 that fit the user's data shape, with method-paper
  rationales for each recommendation.
- **Snapshot diff** (`/diff/`) — semantic diff of two analysis JSON
  exports; surfaces provenance (sha, version, seed) separately from
  numerical-field drift; study identity by label so re-ordering is
  not flagged.
- **Protocols** (`/protocols/`) — pre-register a systematic-review or
  meta-analysis protocol and immediately publish it as a URL. The
  whole protocol travels in the URL fragment (gzip + base64url);
  PRISMA-P 2015 completeness gauge; exports to self-contained HTML,
  Markdown, JSON.
- **Hub full-text search expansion** — indexes `shared/app-flow.js`
  blurbs and `shared/citation.js` author/title text so queries like
  "GLMM", "Hedges", "Stijnen" find the right app.

### Added — reproducibility

- **`shared/build-info.js`** — single-source `AlmBuildInfo` (app,
  version, sha, shortSha, builtAt, url) regenerated by
  `scripts/regen_build_info.py`. Wired into 38 ma-studies-using apps.
- **TruthCert `producedBy` field** — embedded in the SIGNED HMAC
  payload of every receipt so tampering with provenance invalidates
  the MAC. Backward-compatible with pre-2026-05-25 receipts.
- **`shared/seed-badge.js`** — deterministic FNV-1a seed derivation,
  copy-to-clipboard badge, JSON-export embedder. Surfaced in
  nma-pro-v2 Results tab.
- **`shared/report-bundle.js`** — single self-contained HTML report
  containing inputs, results, inlined plot SVG, citations, R script,
  and AlmBuildInfo provenance. Forest-plot reference integration.
- **`shared/snapshot-diff.js`** — see Discovery section above.
- **`tests/test_release_consistency.py`** — asserts CITATION.cff,
  build-info.js, and citation.js versions stay in sync.

### Added — methodology (frontier methods over the past 6 months)

- **Cross-network bias-corrected synthesis** (`/cross-network/`) — NMA
  + IPD + observational under unified bias model (Welton/Cooper/Ades/Lu
  /Sutton 2009; Efthimiou GetReal 2017).
- **Everything model** (`/everything-model/`) — joint Bayesian
  hierarchical decomposition of outcome × time × RoB; variational EM.
- **Sequential MA with α-spending** (`/sequential-ma/`) — adaptive-
  design TSA with O'Brien-Fleming / Pocock / linear boundaries
  (Lan-DeMets 1983; Wetterslev 2008).
- **Personalised treatment effect** (`/personalised-te/`) — empirical-
  Bayes subgroup shrinkage following the PATH statement (Kent 2020).
- **Full unconditional rare-events GLMM** (`/rare-events-glmm/`) —
  Stijnen 2010 CM.AL + UM.FS without continuity correction.
- **Multi-outcome NMA** (`/multi-outcome-nma/`) — Achana 2014
  Kronecker covariance structure.
- **BMA across τ² priors** (`/bma-tau-priors/`) — Friede 2017 Bayesian
  model averaging.
- **RVE meta-regression** (`/rve-meta/`) — Hedges-Tipton-Johnson 2010
  + Tipton 2015 small-sample correction.
- **Cross-design synthesis** (`/cross-design/`) — Welton 2008 +
  Ibrahim-Chen 2000 power prior.
- **Living risk-of-bias pool** (`/living-rob-pool/`) — Elliott 2017.
- **NMA meta-regression with covariate interactions**
  (`/nma-meta-reg/`).
- **Bivariate (K-variate) random-effects MA**
  (`/multi-outcome-ma/`) — Riley 2007.

### Added — cross-app moat

- **`ma-studies-v1`** — single localStorage envelope for pairwise
  effect rows. 40 apps wired; eliminates re-typing.
- **`ma-comparisons-v1`** — NMA-shape sibling bus (arms grouped by
  studyId). nma-pro-v2 and 8 other apps wired.
- **`AlmFlow.attachContinueBar`** — inline "Continue with…" pill row
  in 32 apps; deep-links to downstream tools via `?fromBus=1`.
- **`AlmHero.attachHero`** — "Try with: ▾" canonical dataset
  dropdown in 20 apps.
- **`shared/canonical-datasets.js`** — 6 published benchmarks
  (Stijnen eltrombopag, BCG vaccine, Hasselblad smoking,
  thrombolytics, sequential demo, subgroup demo).
- **`shared/citation.js`** — Vancouver + BibTeX citations for every
  frontier method, accessible via 📑 Cite-as button in 25 apps.
- **`shared/autosave.js`** — debounced localStorage autosave in 40
  form-heavy apps; restore-on-load toast.

### Added — Bayesian / WebR

- **Bayesian NMA** (`/bayesian-nma/`) with prior-sensitivity panel.
- **WebR live R reruns** (`/webr-validator/`) — Shinylive R session
  in-browser for independent verification.
- **Verify-in-R deep-link** from 15 numerical apps.
- **R-parity proven against `metafor`, `meta`, `netmeta`, `mada`,
  `metasens`** — 239 hub-shared specs at ~1e-6 tolerance.

### Added — PWA + accessibility

- **PWA manifest + service worker + install prompt** — hub
  installable as standalone app.
- **Windows High Contrast / `forced-colors: active`** mode portfolio-
  wide (`shared/forced-colors.css`).
- **`aria-label` sweep** across ~100 app HTML files.

### Fixed — UX regressions

- **nma-pro-v8 broken-tab UX (2026-05-25)** — 8 tabs (Bayesian,
  PubBias, MetaReg, CNMA, C-STREAM, Cumulative, DoseResponse,
  Advanced) showed confusing "Run X after the main analysis" grey
  placeholders that made the app look hung. Replaced with prominent
  ▶ CTA buttons; cheap analyses (PubBias, Cumulative) now auto-run
  silently after main analysis so the tabs are populated by default.
- **TruthCert `_canonicalize` deep-sort** — earlier impl used
  `JSON.stringify(payload, sortedKeys)` which silently dropped
  per-study fields from the signed message. Fixed to a recursive
  deep-sorter; tamper-detection now actually works.
- **Workbench codemod corruption** — old codemods used first-match
  `</body>` replace which destroyed the workbench `buildReport()` JS
  template literal containing `"</body></html>"`. All codemods now
  anchor on `rfind("</body>")` with explanatory comments.
- **Cross-platform encoding** — `subprocess.run(text=True)` defaults
  to cp1252 on Windows and mangles UTF-8 stdout from node; standard
  on all test runners now uses `encoding="utf-8", errors="replace"`.

### Added — release hygiene

- **`RELEASING.md`** — step-by-step Zenodo + GitHub Release workflow.
- **`scripts/regen_build_info.py`** — single source of truth for
  version + git SHA + ISO timestamp.
- **Per-app READMEs** (`scripts/gen_app_readmes.py`) — 39 apps with
  templated "when to use", method papers, canonical-dataset worked
  examples, and reproducibility notes. Idempotent regeneration via
  `<!-- ALM-AUTO-README-BEGIN -->` markers.

### Tests

- 248 root pytest cases (Python via node subprocess for the JS
  modules).
- 19+ Playwright end-to-end specs covering hub search, method finder,
  nma-pro-v2 sanity, report bundle export, snapshot diff, protocols.
- Per-app sanity specs in 22 `<app>/tests/sanity.spec.mjs` files.

---

## Pre-1.0 history

Versions before 1.0 were untagged on `main`. The project began as a
collection of single-file HTML apps for systematic review and meta-
analysis tasks, grew to 80+ apps with R-parity-checked engines and
inter-app data buses, and is being archived at v1.0.0 with Zenodo +
JOSS for citation and peer review.

[Unreleased]: https://github.com/mahmood726-cyber/allmeta/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/mahmood726-cyber/allmeta/releases/tag/v1.0.0
