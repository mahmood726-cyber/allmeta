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
| 3 apps still load plotly/jspdf/xlsx from CDN (V9-E07) | "fully offline" claim is false on those apps | ~3 MB vendor + SRI | **P0** |
| No cross-tool data interchange format     | User retypes data 5× across extract → pool → influence → bias → forest | 1-2 days | **P0** |
| ~~Multi-arm τ²/2 off-diagonal in nma-pro-v2 Bayesian path (V9-01b)~~ | ✅ Resolved 2026-05-24: `multiArmCorrection` helper adds the full multivariate Σ = V + Σ_RE (diag=τ², off=τ²/2) log-likelihood correction in the MH τ² step, AND `buildBlockPrecision` builds the full block-precision X' Σ⁻¹ X for the β posterior draw (Lu & Ades 2004). Singletons fall through to scalar weights so 2-arm networks are bit-exact. | — | — |
| No citation infrastructure (no CITATION.cff, no DOI) | Hub uncitable in academic submissions | 1 hr | **P0** |
| Forced-colors mode not in shared CSS (V9-A11Y-11) | Windows High Contrast users see broken contrast | half day | **P1** |
| HKSJ in webr-validator ignores `test=knha` (V9-02) | Slight CI undercoverage | 1 hr | **P1** |
| nma-inconsistency FE-only (V9-06) | No RE option for heterogeneous inconsistency tests | half day | **P1** |
| Multilevel I² missing σ²_typical denom (V9-03) | Off by a known factor | 1 hr | **P1** |
| proportion-ma logit continuity correction non-standard (V9-10) | Disagrees with metafor at boundary | 1 hr | **P1** |
| HSROC docstring drift "Univariate REML" → "DL" (V9-09) | Cosmetic | 5 min | **P2** |
| 76 `alert()` calls in nma-pro-v2 (V9-E08) | UX friction; not accessible to screen readers in same pattern as toasts | 1 day | **P2** |
| No automated nightly hub-crawl on Pages-built artifact | Catches deploy-only regressions | 1 hr | **P2** |
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

### Phase A — Reproducibility & citability (this session)
- [ ] **CITATION.cff** at repo root + footer DOI placeholder (1 hr)
- [ ] Vendor plotly + jspdf + html2canvas + xlsx to `shared/vendor/` with SRI (2-3 hr)
- [ ] Forced-colors `@media` block in `hub/styles.css` + per-app overrides (2 hr)
- [ ] HSROC docstring drift fix (5 min)
- [ ] proportion-ma logit-CC alignment (1 hr)
- [ ] Multilevel I² σ²_typical denominator (1 hr)
- [ ] HKSJ knha respect in webr-validator (1 hr)

### Phase B — Methodological depth (next session)
- [ ] nma-pro-v2 multi-arm τ²/2 off-diagonal (V9-01)
- [ ] nma-inconsistency RE option with PM τ²
- [ ] nma-pro-v2: replace `alert()` calls with `toast.js` (cuts 76 a11y traps)
- [ ] Add R-parity tests where missing (per triage overrides) — track to 100 %

### Phase C — Interchange + receipts (the moat)
- [ ] Define `ma-studies-v1.json` schema (effect, se, n, group labels, covariates, RoB ranks, GRADE, notes)
- [ ] Validator in `shared/ma-studies-v1.js` (`parse` + `validate` + `serialise`)
- [ ] Wire export button into all 30+ numerical-engine apps
- [ ] Wire import button into all pooling apps
- [ ] TruthCert receipt extension to every numerical app (boilerplate at `shared/truthcert.js`)
- [ ] "Verify in R" deep-link from every pooled result → WebR Studio

### Phase D — Discoverability + ecosystem
- [ ] Zenodo concept-DOI for repo (manual: connect GH → Zenodo, push v1.0.0 tag)
- [ ] README badge: DOI · Pages · Playwright build · pytest count
- [ ] Cochrane `.rm5`/`.rm6` reader → list studies in workbench
- [ ] PROSPERO templater
- [ ] PWA manifest + install prompt
- [ ] Multi-language method help (Spanish, Arabic, Mandarin — start with abstracts of each method)

### Phase E — Ongoing rigor
- [ ] Nightly hub-crawl on Pages-built artifact (GH Action)
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
