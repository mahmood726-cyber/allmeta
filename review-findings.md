# Multi-Persona Review — allmeta

**Date:** 2026-04-20
**Scope:** ~15 critical files across the 63-app catalog (hub, new advanced apps built this session, the WebR integration, and standard-compliance apps)
**Personas:** Statistical Methodologist, Security Auditor, UX/Accessibility, Software Engineer, Domain Expert

## Summary

**25 P0** · **41 P1** · **22 P2** = **88 findings**

| Persona | P0 | P1 | P2 |
|---|---|---|---|
| Statistical Methodologist | 6 | 6 | 3 |
| Security Auditor | 5 | 6 | 4 |
| UX / Accessibility | 3 | 12 | 5 |
| Software Engineer | 3 | 8 | 7 |
| Domain Expert | 8 | 9 | 3 |

Top structural themes:
1. **XSS via unescaped innerHTML** — 5 distinct apps render user input via template literals without escaping.
2. **Clinical-standard algorithms are simplified too far** — RoB 2 / ROBINS-I / AMSTAR-2 / CERQual / CINeMA derive wrong verdicts in specific branches.
3. **MCMC / all-subset loops block the main thread** — no Web Worker, no cancel, no progress.
4. **NI margin formula is inverted** — `(1 − frac) × hist` should be `frac × hist`.
5. **Code duplication of math primitives** across 10+ files (rnorm, pnorm, invert, wls) — bug fixes must be applied N times.

---

## P0 — Critical (must fix before trusting)

### Statistical

- **P0-S1** `bayesian-mcmc/index.html` ~L145 — τ Metropolis step uses folded normal proposal, introducing asymmetric density near zero; MH acceptance ratio wrong for small τ. *Fix:* log-scale random walk + Jacobian correction.
- **P0-S2** `nma-inconsistency/index.html` ~L211 — the `dbt()` function does **not** compute the design-by-treatment test; it reports the consistency-model Q as if it were the LR test. *Fix:* implement the full-design model and use Q_cons − Q_full on df_cons − df_full.
- **P0-S3** `pet-peese/index.html` ~L237 — conditional PET→PEESE switch tests the PET *slope* p-value; Stanley-Doucouliagos specifies testing the *intercept* p-value. *Fix:* replace `pFromZ(petSlopeZ)` with `pFromZ(petZ)`.
- **P0-S4** `bayesian-mcmc/index.html` ~L199 — ESS autocorrelation truncation at ρ < 0.05 overestimates ESS vs Geyer's monotone-sequence estimator. *Fix:* sum paired lags, break on first negative pair.
- **P0-S5** `nma-global-inconsistency/index.html` ~L135 — design-expansion adds zero columns when `designs.length ≤ nBasic`, making the full model identical to consistency and the LR test vacuous. *Fix:* add one dummy per design, not per design beyond nBasic.
- **P0-S6** `proportion-ma/index.html` ~L196 — logit continuity correction uses asymmetric `cn = n+1` when `x = n` while leaving `cn = n` elsewhere; variance explodes at the tail. *Fix:* use `(x+0.5)/(n+1)` uniformly or match Cochrane's 0.5 recommendation consistently.

### Security

- **P0-Sec1** `citation-chaser/index.html` L244 — OpenAlex `title` / `authors` interpolated into `innerHTML` without escape. Malicious OpenAlex record → XSS in any user who chases that DOI. *Fix:* add `escapeHtml` helper and apply to all `w.*` fields.
- **P0-Sec2** `thematic-synthesis/index.html` L105 — user-entered study/code/theme rendered raw into `tbody.innerHTML`. *Fix:* escape at interpolation.
- **P0-Sec3** `thematic-synthesis/index.html` L186, L191-192 — user values injected into SVG `innerHTML`; `</text><script>…</script>` breaks out. *Fix:* use `document.createElementNS` + `textContent`, or escape.
- **P0-Sec4** `cinema/index.html` L154-155, L221 — `r.comparison` (from text input) rendered into `value="${r.comparison}"` and into SVG `innerHTML`. *Fix:* escape; use `setAttribute`.
- **P0-Sec5** `hub/app.js` L102-114 — `article.innerHTML` with un-escaped `project.*` fields; and `project.path` not validated against `javascript:` scheme at L126/L133. *Fix:* escape + assert scheme is http/https/relative.

### UX / Accessibility

- **P0-UX1** `rob2/index.html` L54 — hidden radio pattern (`display: none`) leaves no visible focus ring on the label, breaks keyboard navigation. *Fix:* add `:focus-visible { outline: 2px solid var(--accent) }` to `.q .opts label`.
- **P0-UX2** `hub/styles.css` L228-229 — filter-chip `min-height: 40px` fails WCAG 2.5.5 (44px touch target). *Fix:* bump to 44px.
- **P0-UX3** `bayesian-mcmc/index.html` L79-80, L216-252 — MCMC blocks main thread, no cancel, no `aria-busy`. *Fix:* Web Worker + Cancel button + aria-busy on results panel.

### Software Engineering

- **P0-SE1** `bayesian-mcmc/index.html` L240-245 — `innerHTML +=` in hot-results loop re-parses the whole table each iteration, detaches listeners on Firefox. *Fix:* accumulate string, single assignment.
- **P0-SE2** `bayesian-mcmc/index.html` L208-225 — sampler synchronous on main thread; 4 chains × 20k iter freezes tab ~10s. *Fix:* Web Worker.
- **P0-SE3** `gosh-metareg/index.html` L143-151 — k = 18 runs 262 144 iterations on main thread with no yield, no progress. *Fix:* yield via `requestAnimationFrame` every 4 096 subsets, show progress.

### Domain Expert

- **P0-D1** `rob2/index.html` L128-133 — D2 algorithm falls through to "Some concerns" when deviations occurred + ITT not used + some signaling questions are NI; Sterne 2019 says this should be High. *Fix:* gate High on `nn(a["2.5"])` whenever `aware && deviationsAffected`.
- **P0-D2** `rob2/index.html` L199-200 — hard-coded "multiple some-concerns → High" overrides reviewer discretion. Sterne 2019 leaves this to judgment. *Fix:* change rule to "some concerns", not "high".
- **P0-D3** `robins-i/index.html` L108-113 — D1 Confounding collapses measured vs unmeasured distinction; cannot produce "Critical". *Fix:* add signaling questions 1.5/1.6 and map unmeasured confounding → Serious/Critical.
- **P0-D4** `robins-i/index.html` all domain judges — "Critical" rating is structurally unreachable across all domains; overall Critical requires at least one domain Critical. *Fix:* add "crit" return paths for D1/D2/D6/D7.
- **P0-D5** `amstar-2/index.html` L142-148 — "Partial Yes" on critical items counted as nothing; review with all 7 critical PYs gets "High" confidence. *Fix:* count PY on critical items as at least a non-critical weakness.
- **P0-D6** `cerqual/index.html` L120-131 — numeric point system (3/2/1/0 per component, thresholds 0/2/5/6) is not in Lewin 2018; gives ratings that disagree with expert CERQual. *Fix:* replace with worst-domain anchor + reviewer override, document the approximation honestly.
- **P0-D7** `cinema/index.html` L120 — "Unclear" weighted as 1 downgrade point same as "Some concerns"; 6 Unclear domains → Very low confidence even without identified concerns. *Fix:* weight Unclear as 0 with UI warning to resolve before finalising.
- **P0-D8** `mcid/index.html` L122 — NI margin formula `(1 − frac) × hist`. Correct M2 = `frac × hist` (fraction of active effect preserved). At frac = 0.75, tool outputs 2 instead of 6. *Fix:* change to `frac * hist`.

---

## P1 — Important (should fix)

### Statistical
- **P1-S1** `bayesian-nma/index.html` L214 — `df = Math.max(1, ...)` should be `Math.max(0, ...)` with tau² clamp.
- **P1-S2** `effect-size-converter/index.html` L231 — OR→RR delta-method derivative uses `|1 − p₀·RR|` instead of `(1−p₀)/(1−p₀·RR)`. Small error at high p₀+OR.
- **P1-S3** `bayesian-mcmc/index.html` L169 — non-interpolated quantile; use linear interpolation for CrI accuracy.
- **P1-S4** `hsroc/index.html` L107-108 — comment claims IGLS refinement but the loop is absent; document honestly.
- **P1-S5** `proportion-ma/index.html` L273-275 — simple `sin²(y)` back-transform instead of Barendregt-Doi harmonic-n; biased at extreme proportions.
- **P1-S6** `bayesian-nma/index.html` L217 — DL tau² uses univariate formula; multivariate NMA needs trace of (I − H). Acknowledge approximation.

### Security
- **P1-Sec1** `cinema/index.html` L221 (duplicate path, SVG specifically).
- **P1-Sec2** `webr-studio/index.html` L540 — R-generated SVG injected via `innerHTML`; malicious R code in shared "template" can write `<script>` into plot file. *Fix:* strip script/on* before injecting, or use `<img src="data:…">`.
- **P1-Sec3** `hub/app.js` L126, L133 — `new URL()` accepts `javascript:`; need explicit scheme check.
- **P1-Sec4** `webr-studio/index.html` L482 — WebR loaded from `latest` CDN URL with no SRI. Pin to version.
- **P1-Sec5** `index.html`, `evidence-board/index.html` — Google Fonts CDN without SRI; contradicts "data stays on device" claim. *Fix:* self-host fonts.
- **P1-Sec6** `ma-studies-v1` localStorage bus collision risk across apps that share the key.

### UX / Accessibility
- **P1-UX1** `hub/index.html` #results-summary — no `aria-live`.
- **P1-UX2** `hub/app.js` filter chips — no `aria-pressed`.
- **P1-UX3** `citation-chaser/index.html` L89 — status div no `aria-live`.
- **P1-UX4** `webr-studio/index.html` L66 — status badge no `aria-live`.
- **P1-UX5** `hub/styles.css` — no dark-mode block for hub itself.
- **P1-UX6** `rob2/index.html` — `--some` on `--some-soft` = 3.25:1, fails WCAG AA for small text.
- **P1-UX7** `bayesian-mcmc/index.html` L80 — Run button not disabled during execution; double-clicks queue runs.
- **P1-UX8** `hub/app.js` L102-114 — `innerHTML` with template literal from project fields (XSS risk if projects.js ever dynamic).
- **P1-UX9** `prisma-checklist/index.html` L167-178 — 27 select/textarea pairs with no accessible label.
- **P1-UX10** `cinema/index.html` and `thematic-synthesis/index.html` — delete button `×` with no aria-label.
- **P1-UX11** `hub/styles.css` L123-127 — primary button white on `#c75b39` = 4.21:1, fails WCAG AA normal text.
- **P1-UX12** `rob2/index.html` — summary grid not announced after evaluate (no aria-live).

### Software Engineering
- **P1-SE1** `bayesian-nma`, `nma-inconsistency`, and 8+ other apps — math primitives copy-pasted. *Fix:* shared `allmeta-math.js`.
- **P1-SE2** `citation-chaser/index.html` L244 — `innerHTML +=` in loop up to 200 iterations; O(n²) DOM.
- **P1-SE3** `citation-chaser/index.html` L112 — module globals `DEDUP`/`RUNNING` not reset on error; button stuck.
- **P1-SE4** `influence/index.html` L118-136 — `pool()` no guard for k<2 within LOO.
- **P1-SE5** `bayesian-nma/index.html` L300 — brittle `split('</strong>')` to prepend fit summary.
- **P1-SE6** `nma-inconsistency/index.html` L174-208 — silent `continue` on singular matrix; user unaware of skipped splits.
- **P1-SE7** `webr-studio/index.html` L527-528 — `shelter.purge()` not in `finally`.
- **P1-SE8** `hub/app.js` L102-114 — unescaped innerHTML (duplicate of P1-UX8, listed here for XSS surface).

### Domain Expert
- **P1-D1** `amstar-2/index.html` footer — "High = 0-1 non-critical weakness" wording correct but confusing. Clarify.
- **P1-D2** `quadas-2/index.html` D4 applicability — shows "—" which reads as "unrated" rather than "N/A by design".
- **P1-D3** `quadas-2/index.html` applicability default "Unclear" — auto-rates without user confirmation.
- **P1-D4** `grade-sof/index.html` L285 — no structured capture of GRADE's 5 downgrading domains.
- **P1-D5** `prisma-checklist/index.html` — counts 27 items but ITEMS has 36+ sub-items; UI says "27".
- **P1-D6** `robins-i/index.html` D7 — cannot reach "Critical".
- **P1-D7** `grade-sof/index.html` L270-276 — no warning when OR/HR used alongside absolute risks (risk of mis-application).
- **P1-D8** `rayyanreplacement/screenr.html` — no structured conflict-resolution pathway.
- **P1-D9** `mcid/index.html` L62 — "SEM" abbreviation ambiguous (std error of measurement vs of the mean); add formula.

---

## P2 — Nitpicks (polish)

### Statistical
- **P2-S1** `bayesian-mcmc/index.html` L185 — R-hat omits `(1 + 1/m)` correction.
- **P2-S2** `median-to-mean/index.html` L119 — Wan formula confirmed correct (false-positive flag).
- **P2-S3** `effect-size-converter/index.html` L278 — HR→OR approx label could be clearer.

### Security
- **P2-Sec1** `cerqual/index.html` L196 — SVG innerHTML with user finding label.
- **P2-Sec2** All files — no Content-Security-Policy.
- **P2-Sec3** `prisma-checklist/index.html` L275 — `Object.assign` prototype pollution from imported JSON.
- **P2-Sec4** `search-translator/index.html` L203-206 — near-ReDoS on unterminated quotes.

### UX / Accessibility
- **P2-UX1** `webr-studio/index.html` L109 — R textarea keyboard trap (no Escape hint).
- **P2-UX2** `hub/index.html` — no skip-navigation link.
- **P2-UX3** `median-to-mean/index.html` — results no aria-live.
- **P2-UX4** All inner apps — no explicit `:focus-visible` on button/select.
- **P2-UX5** `citation-chaser/index.html` — no cancel / AbortController for async fetches.

### Software Engineering
- **P2-SE1** `hub/app.js` L17 — rebuilds filter buttons on each click, resets focus.
- **P2-SE2** `bayesian-mcmc/index.html` L260 — `Math.min(...samples)` RangeError at 80k samples.
- **P2-SE3** `gosh-metareg/index.html` L153 — median wrong for even n.
- **P2-SE4** `tests/playwright/hub-crawl.spec.ts` — unconditional 3s waits.
- **P2-SE5** `tests/playwright/hub-crawl.spec.ts` — fail-plot-missing not counted as warn in CI.
- **P2-SE6** `hub/projects.js` — `C:\HTML apps\…` folder paths shipped to Pages (lessons-file rule).
- **P2-SE7** `bayesian-nma/index.html` L272 — no cap on B.

### Domain Expert
- **P2-D1** `robins-e/index.html` L158 — "randomized" wording inappropriate for exposure studies.
- **P2-D2** `cerqual/index.html` L106 — "No / very minor" label conflates two distinct levels.
- **P2-D3** `prisma-checklist/index.html` L178 — missing structured location field for PRISMA compliance.

---

## False-positive watch (from lessons.md)

These would be wrong to flag — confirmed as correct in the codebase:
- Cox constant `sqrt(3)/π ≈ 0.5513` for OR→SMD (not `sqrt(3/π)`).
- Clopper-Pearson uses `alpha/2` for two-sided.
- Fisher-z variance `1/(n-3)`, not `1/(n-2)`.
- Wan C1 mean `(a + 2q1 + 2m + 2q3 + b)/8`.
- Prediction-interval df `k-2` in RE meta-analysis.

---

## Next step

Which priorities to fix? Options:
- **All P0** (25 fixes, ~2-3 hours): correctness + security + crash-avoidance + clinically right answers.
- **All P0 + P1** (66 fixes): most of the gap closed.
- **Everything** (88 fixes): tick-every-box pass.
- **Selective**: pick categories, e.g. "all security P0+P1" (11) or "all domain P0" (8).
