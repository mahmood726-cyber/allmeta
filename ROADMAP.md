# allmeta roadmap — toward the best browser-only evidence-synthesis hub

> Drafted 2026-05-24. Scope: post-v9-review (commit `5913df1`).
> Baseline: 76 apps · 23 categories · 69 internal Tier-1 validated · pytest+Playwright green · service worker · CSP · WebR Studio · TruthCert receipts.
>
> "Best in the world" is unbounded. The defensible framing is **best browser-only,
> offline-capable, validated-against-R, reproducibility-receipted evidence-synthesis
> hub** — competing with RevMan, MetaXL, JASP, jamovi, MetaInsight, OpenMetaAnalyst
> on access + transparency + speed, not on raw method count (where R / Stata win).

## Where we already lead

- Zero install, runs offline (with service worker)
- Real R in-browser (WebR Studio + 3 Shinylive pilots) — competitors don't
- TruthCert HMAC receipts — reproducibility nobody else ships
- 69 tools cross-checked against `metafor`/`meta`/`netmeta`/`mada`
- 23 categories covering pairwise + NMA + DTA + IPD + dose-response + survival + HTA + GRADE + PRISMA + TSA + qualitative + living + screening + extraction
- CSP-hard, no external CDN on 76 of 79 entry points

## Where we lag

| Gap                                       | Impact | Cost   | Priority |
| ----------------------------------------- | ------ | ------ | -------- |
| ~~3 apps still load plotly/jspdf/xlsx from CDN (V9-E07)~~ | ✅ Resolved (verified 2026-06-02): zero catalog entry points load anything from a CDN — static `<script src>`/`<link href>` scan and dynamic-injection scan (`.src=`/`createElement`/`importScripts`/`import()`/`fetch`) both come up empty across all `hub/projects.js` apps. `shared/vendor/` holds plotly/jspdf/html2canvas/xlsx/chart/d3/jszip/docx. The only residual CDN *strings* are dead-code paths inside vendored minified libs (jsPDF's `pdfobjectnewwindow` output mode), never invoked. | — | — |
| No cross-tool data interchange format     | User retypes data 5× across extract → pool → influence → bias → forest | 1-2 days | **P0** |
| ~~Multi-arm τ²/2 off-diagonal in nma-pro-v2 Bayesian path (V9-01b)~~ | ✅ Resolved 2026-05-24: `multiArmCorrection` helper adds the full multivariate Σ = V + Σ_RE (diag=τ², off=τ²/2) log-likelihood correction in the MH τ² step, AND `buildBlockPrecision` builds the full block-precision X' Σ⁻¹ X for the β posterior draw (Lu & Ades 2004). Singletons fall through to scalar weights so 2-arm networks are bit-exact. | — | — |
| Citation infrastructure: DOI still pending | `CITATION.cff` ✅ present at root; Zenodo concept-DOI still open (Phase D — manual GH→Zenodo + v1.0.0 tag) | 30 min (DOI) | **P1** |
| ~~Forced-colors mode not in shared CSS (V9-A11Y-11)~~ | ✅ Resolved: `@media (forced-colors: active)` block in `hub/styles.css:811` (WCAG 1.4.1 / 1.4.11). | — | — |
| ~~HKSJ in webr-validator ignores `test=knha` (V9-02)~~ | ✅ Resolved: the drifting local re-impl was removed; webr-validator now delegates to `AlmMaCore.pool(yi, vi, { method, knha: test==="knha" })`. CI-green on HEAD `6abade7` (`reml-validator-parity` / `ma-core-parity`). | — | — |
| ~~nma-inconsistency FE-only (V9-06)~~ | ✅ Resolved 2026-06-03: FE/PM/DL model selector wired; `estimateTau2` adds shared-τ² RE weights `1/(SE²+τ²)` to both consistency and inconsistency models. Verifying the math surfaced a real bug — `tau2_DL` used the intercept-only denominator `ΣW−ΣW²/ΣW`, which understated τ² by ~16 % on a multi-treatment network; fixed to the generalized DerSimonian-Kacker/Jackson denominator `tr(W)−tr((XᵀWX)⁻¹XᵀW²X)` (reduces exactly to the old form for 2-treatment networks). Shipped engine now matches `netmeta(random=TRUE, method.tau="DL")` τ²/network/netsplit to ≤1e-8 (oracle `inco-re-oracle.{R,json}` on over-dispersed `inco-het.csv`); PM validated by its `Q(τ²)=df` moment condition (netmeta has no network PM). Spec `hub/shared/tests/nma-inconsistency-re.spec.mjs`. | — | — |
| ~~Multilevel I² missing σ²_typical denom (V9-03)~~ | ✅ Resolved (`V10-08`): `sigma2_typical` (Cheung 2014 §3.2 / Higgins-Thompson 2002) is computed from sampling weights and included in the `totalVar` denominator. CI-green on HEAD `6abade7` (`multilevel-reml-parity`). | — | — |
| ~~proportion-ma logit continuity correction non-standard (V9-10)~~ | ✅ Resolved: `logitTransform` applies the standard *conditional* 0.5 correction only when a cell is extreme (`x===0 || x===n`, `cn=n+1`), matching `metafor::escalc(measure="PLO")` to 1e-6. CI-green on HEAD `6abade7` (`proportion-ma-ft`). | — | — |
| ~~HSROC docstring drift "Univariate REML" → "DL" (V9-09)~~ | ✅ Resolved: no "REML" text remains in `hsroc/index.html`; method described as alternating univariate DerSimonian-Laird throughout. CI-green on HEAD `6abade7` (`hsroc-smoke`). | — | — |
| ~~76 `alert()` calls in nma-pro-v2 (V9-E08)~~ | ✅ Resolved (prior cycle): 0 alert() calls remain in nma-pro-v8.0.html. All matches for "alert" are now CSS `.alert--{info,warning,success}` Bootstrap-style alert components — accessible. Verified 2026-05-24. | — | — |
| ~~No automated nightly hub-crawl on Pages-built artifact~~ | ✅ Resolved 2026-06-02: `nightly-pages-crawl.yml` (cron + `workflow_dispatch`) crawls the live Pages site via `tests/playwright/pages-crawl.spec.ts`; verified green on GitHub (91/91 internal apps). | — | — |
| No multi-language abstracts of method help | Limits global reach | 1 week | **P3** |
| No PWA install prompt | Users can't add to home screen as installed app | 2 hr | **P3** |

## What we should add that nobody else has

1. **`ma-studies-v1` interchange JSON** — extract once in `rct-extractor`, pool in `forest-plot`,
   sensitivity in `influence`, dose-response in `nma-dose-response-app`, bias in `pubbias-tests`,
   GRADE in `grade-sof` — without re-typing. **This is the moat.**
2. **One-click "verify in R"** button on every numerical app → opens WebR Studio
   pre-loaded with the same data through `metafor` or `meta`. Click = independent verification.
3. **TruthCert receipt on every numerical app** (not just 4) — every result page can emit
   an HMAC-signed bundle a peer reviewer can re-verify offline.
4. **Cochrane-RevMan import** — read `.rm5` and `.rm6` files, surface in catalog with one click.
5. **PROSPERO submission templater** — fill in fields from PICO + protocol drafts.
6. **PRISMA 2020 automatic flow generator** from search + screening logs — exists in fragments;
   needs to be a single end-to-end button.

## Phased execution

### Phase A — Reproducibility & citability ✅ COMPLETE (reconciled 2026-06-02)
> All items verified done on disk; checkboxes had drifted from reality.
> Evidence: file scans + `shared-tests`/`playwright` CI both green on HEAD `6abade7`.
- [x] **CITATION.cff** at repo root — present
- [x] Vendor plotly + jspdf + html2canvas + xlsx to `shared/vendor/` — populated; zero catalog apps load from any CDN (static + dynamic scan clean)
- [x] Forced-colors `@media` block in `hub/styles.css` — present
- [x] HSROC docstring drift fix (V9-09) — no "REML" text remains
- [x] proportion-ma logit-CC alignment (V9-10) — conditional 0.5 CC, metafor PLO parity
- [x] Multilevel I² σ²_typical denominator (V9-03 / V10-08) — `sigma2_typical` in `totalVar`
- [x] HKSJ knha respect in webr-validator (V9-02) — delegates to `AlmMaCore.pool({knha})`

### Phase B — Methodological depth (next session)
- [x] nma-pro-v2 multi-arm τ²/2 off-diagonal (V9-01) — `multiArmCorrection` + `buildBlockPrecision` in `nma-pro-v8.0.html`, tested in `tests/test_nma_pro.py` (see gap table above)
- [x] nma-inconsistency RE option with PM/DL τ² (V9-06) — FE/PM/DL selector + shared-τ² RE weights; generalized-DL denominator fix; netmeta(random=TRUE,DL) R-parity to ≤1e-8, PM via Q(τ²)=df moment condition. Spec `nma-inconsistency-re.spec.mjs`, oracle `inco-re-oracle.{R,json}`.
- [x] nma-pro-v2: replace `alert()` calls — 0 literal `alert(` calls remain in `nma-pro-v8.0.html` (V9-E08)
- [x] Add R-parity tests where missing — **audited 2026-06-03, effectively at 100%**. Every app with a genuine numerical method has R-parity via one of: a Playwright `*-parity.spec.mjs`, a per-app `tests/test_against_<pkg>.py` (live `Rscript`, skips if R absent — confirmed PASS against R 4.6.0 for pet-peese/effect-size-converter/bucher), or the shared `ma-core-parity` engine. The lone scan flag (`nma-dose-response-app` "metafor") was a marketing string, not a parity claim — grounded in commit `17ff11b`. Note: per-app Python R-parity tests are not counted in the `/parity` dashboard (which scans only Playwright specs) — a discoverability gap, not a coverage gap.

### Phase C — Interchange + receipts (the moat) — ~90% built (reconciled 2026-06-02)
> Most of the moat already exists; checkboxes had drifted. Accurate coverage
> matrix (catalog apps, via `/tmp/scan_bus.py`): **load=36, read=20, write=18,
> Verify-in-R=17**. Remaining work is gap-filling, not greenfield.
- [x] Define `ma-studies-v1` schema — `shared/ma-studies-v1.js` + `.md`, plus `ma-pooled-v1` and `ma-comparisons-v1` extensions, with fixtures under `tests/fixtures/ma-studies-v1/`
- [x] Validator — `MaStudies.validate(p)` → `{ok, errors[]}`; `read`/`write`/`merge`/`parseCSV`/`toCSV`/`attachButtons` helpers
- [x] Wire export into pooling apps — **22 poolable apps write**, which is the full *appropriate* producible set (the original "~24" over-counted; see assessment below). Writers: forest, funnel, heterogeneity, meta-reg, bayesian-ma/mcmc, cumulative-subgroup, tsa, workbench, influence, gosh, gosh-metareg, pet-peese, pubbias-tests, copas, limit-ma, nma-pro-v2, rct-extractor, **mh-peto**, **proportion-ma**, **bma-tau-priors**, **cross-design**. mh-peto (2×2) + proportion-ma (events/n) wired 2026-06-02 (log-scale OR/RR / identity RD; logit PLO) — specs `hub/shared/tests/{mh-peto,proportion-ma}-bus.spec.mjs`. bma-tau-priors + cross-design wired 2026-06-03 (vi↔se conversion; cross-design also maps design↔`group`) — specs `{bma-tau-priors,cross-design}-bus.spec.mjs`.
  - **Deliberately NOT producers (assessed 2026-06-03):** `effect-size-converter` is single-effect (one input → many *scales*, no study set to export); `multilevel-ma` produces *dependent* effects (multiple per cluster) — exporting to independence-assuming poolers would silently propagate the dependency the app exists to handle. Leaving these as non-producers is the correct call, not a gap.
- [~] Wire import into pooling apps — 20 read; `grade-sof` reads-only, `webr-validator` reads-only (correct, it's a consumer)
- [x] TruthCert receipt extension — shared UI (`shared/truthcert-ui.js`: key panel + receipt download, fails closed; `attachReceiptButton` resolves studies from an explicit getter OR a textarea+format pair). Wired into **all 18 bus-writing poolers**: workbench, forest-plot, funnel-plot, heterogeneity, meta-regression, bayesian-ma, bayesian-mcmc, cumulative-subgroup, tsa, influence, gosh, gosh-metareg, pet-peese, pubbias-tests, copas, limit-ma, mh-peto, proportion-ma. Spec `hub/shared/tests/truthcert-ui.spec.mjs` covers all three getStudies paths
- [x] "Verify in R" deep-link — pairwise bus-writers all have it; `workbench` wired 2026-06-02 (spec `hub/shared/tests/workbench-verify-in-r.spec.mjs`); `nma-pro-v2` has its own "Validate with R". NMA/DTA/RMST/p-curve apps intentionally excluded (their results don't map to webr-validator's pairwise `metafor::rma`)
- [x] **NMA cluster bus integration via `ma-comparisons-v1`** — complete (2026-06-02): producer + all 6 readers wired
  - [x] `nma-pro-v2` already read+write (producer of the arm-level network)
  - [x] `MaComparisons.toContrasts()` — arm-level → pairwise `{t1,t2,te,se}` (OR/RR; 0.5 CC on zero-cell). Tested (`test_ma_comparisons_v1.py`)
  - [x] `bayesian-nma`, `nma-inconsistency` wired as readers ("Load from bus" → toContrasts → run). Spec `hub/shared/tests/nma-bus-reader.spec.mjs`
  - [x] `nma-global-inconsistency` reader (5-col `t1,t2,te,se,design`). Fixed `toContrasts.design` to the per-trial arm-set (sorted, ":"-joined) so multi-arm trials group as one design
  - [x] `component-nma` reader — pipe-delimited `armA | armB | te | se` via toContrasts; component treatment names (`drug+exercise`) pass through and the app decomposes them on `+`
  - [x] `nma-dose-response-app` reader — `MaComparisons.toDoseResponse` builds per-arm `study,treatment,dose,effect,se` rows (lowest-dose arm = (dose,0) anchor; others = log-OR/RR vs reference). The app's model is plain WLS on `(dose,effect)` weighted by `1/se²` (SE optional), so no GLST covariance to reconstruct — the earlier "GLST" concern didn't apply. Requires binary OR/RR studies whose arms carry a dose (no-op otherwise). Spec `hub/shared/tests/nma-dose-response-bus.spec.mjs`
  - [x] `bucher` reader — maps toContrasts into the existing `__almBucherLoad` (pools by pair, fills the AC/BC triangle from the first two arms; star networks give A-vs-B-via-control). Spec covers field prefill + indirect estimate
  - [x] continuous (MD/SMD) contrasts — done 2026-06-03. `normalizeArm` now carries optional `n` for continuous arms; `MaComparisons.toContrasts` derives MD (`te=m1−m2`, `se=√(sd₁²/n₁+sd₂²/n₂)`) and SMD (Hedges g with the EXACT Γ-based bias correction + `se=√(1/n₁+1/n₂+g²/(2(n₁+n₂)))`) — both match `metafor::escalc` to ≤1e-6 (R 4.6.0). A CONT pair is emitted only when both arms carry `n` (else skipped, like the dose rule). Readers bayesian-nma / nma-inconsistency / nma-global-inconsistency / component-nma accept the additive contrasts as-is (scale-agnostic, no exp); `bucher` stays OR/RR-only with a new guard (it back-transforms via exp, so MD/SMD are rejected, not mislabeled). Tests in `tests/test_ma_comparisons_v1.py` (MD/SMD escalc parity + n-missing skip).

### Phase D — Discoverability + ecosystem (reconciled 2026-06-02)
- [x] Zenodo concept-DOI — **done 2026-06-03**: GH→Zenodo connected, v1.0.0 archived. Concept DOI `10.5281/zenodo.20516880` (version-less; v1.0.0 = `…881`) wired into `CITATION.cff` `identifiers`, the README DOI badge, and the README Cite section.
- [x] README badges — Pages, shared-tests, Playwright, License (MIT) added; DOI badge pending the Zenodo deposit
- [x] Cochrane `.rm5`/`.rm6` reader — `revman-importer` reads `.rm5`/`.rm6` (JSZip + DOMParser fallback) and writes the `ma-comparisons-v1` bus, so imported reviews flow to the NMA apps via `toContrasts`
- [x] PROSPERO templater — **confirmed 2026-06-03**: `prospero-templater/` is a complete, catalogued 39-field PROSPERO-2022 form → live preview + Markdown export + localStorage autosave, exposing `window.__almProspero()`. Was untested and its meta-description over-claimed "47-question" (39 fields in code) — fixed the count and added `hub/shared/tests/prospero-templater-behavior.spec.mjs` (form→preview→markdown pipeline, autosave round-trip, all-39-sections; 4 tests green on Edge).
- [x] PWA manifest + install prompt — `manifest.json` (icons, shortcuts, categories), `<link rel=manifest>`, theme-color, apple-touch-icon, SW registration, and a `beforeinstallprompt` handler all present in root `index.html`
- [ ] Multi-language method help (Spanish, Arabic, Mandarin) — not started (P3, ~1 week)

### Phase E — Ongoing rigor
- [x] Nightly hub-crawl on Pages-built artifact (GH Action) — `nightly-pages-crawl.yml` + `pages-crawl.spec.ts`; verified green on GitHub (91/91 deployed apps; benign-by-design assets triaged)
- [ ] Sentinel-equivalent lint pass on every PR
- [ ] Quarterly review cycle (v12, v13, …) keep the deferred list small

## What "best in the world" means here (boundary)

- **In-scope claim**: best **browser-only, offline-capable, transparent, validated, citeable**
  evidence-synthesis suite.
- **Out-of-scope (deliberately)**: out-pacing `metafor` on method breadth; replacing
  Cochrane RevMan as a registered systematic-review platform; building a full backend
  CRO / TMF system.

## Cite as
*allmeta — open browser-only tools for evidence synthesis.*
https://mahmood726-cyber.github.io/allmeta/
