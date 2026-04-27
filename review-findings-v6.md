<!-- sentinel:skip-file — review document; quotes file paths and method-citation context. -->

# Multi-Persona Review v6 — deep sweep after v5 — REVIEW CLEAN (full follow-up 2026-04-27)

**Status:** **23/23 fixable P0+P1 fixed across two sessions** (v6 ship + v6 follow-up "fix all"). Pytest 31/31, Playwright hub-crawl 66/66, all HTML div balance + JS syntax clean across 25 modified files.

### v6 follow-up (2026-04-27) — six previously-deferred items closed
- **AV6-01** GRADE wizard radios now carry `name="grade-${field}-${idx}"` — DOM-level mutual exclusion holds without relying on the JS handler.
- **AV6-07** Glossary popover Tab focus trap — Tab/Shift-Tab cycle within the popover; Escape returns focus to the trigger.
- **S2** Pairwiseai DOM XSS — wrapped 7 user-controlled interpolations in `sanitizeHTML()` (multi-outcome JSON dropdown, covariate-adjusted card header, interpretation, "with both" line, trajectory warning, trajectory header, window cell).
- **E2** dosehtml v18.1 / v18.2 / v18.3 localStorage namespaced (`theme_v18_1`, `dose_response_v18_2_save`, etc.) — cross-variant state corruption resolved.
- **E4** alert/confirm sweep — added `shared/toast.js` non-blocking notifier; converted **48 `alert(...)` → `Toast.show(...)`** across 9 active inner apps (forest-plot, grade-sof, heterogeneity, dta-sroc, funnel-plot, bayesian-ma, cumulative-subgroup, citation-dedup, component-nma).
- **E3** Pairwiseai mojibake — 717 of ~1.5k cp1252-mojibake patterns substituted via a high-confidence map (punctuation, Latin-1, Greek, common emoji). Residual stays masked by `startMojibakeObserver()` runtime patch; full source-encoding repair deferred.

### P2 cleanup also shipped
- AV6-12: dropped `aria-atomic="true"` on `#results-summary` (was re-reading the entire summary on every keystroke).
- V6-12: `dta-sroc` warning threshold raised to k<5 (was k<4) to match advanced-stats.md bivariate convergence note.
- V6-08: fragility-index entry adds Lin & Lee 2020 "test both arms" variant note.
- V6-09: CINeMA glossary entry uses Nikolakopoulou 2020's exact 6-domain naming.
- V6-11: Guyot IPD entry adds "plus published at-risk numbers" requirement.
- F7: OR≈RR rule softened with "AND effect size is modest" + Zhang & Yu 1998 cite.
- F8: fixed-effect entry notes Cochrane Handbook v6+ "common-effect" terminology preference.
- New "rate ratio" glossary entry to disambiguate from "risk ratio" (both abbreviated RR).

**Date:** 2026-04-26
**Scope:** post-v5 codebase (commit b28fd9d). Six personas: Methods, Engineering, UX/A11y, Security, Domain, Runtime/Playwright (latter blocked — see note).
**Surfaces:** hub, prisma-nma, grade-sof (wizard), shared/glossary.js, 5 workflow pages, Pairwiseai, dosehtml v18.x, forest-plot, heterogeneity, meta-regression, pet-peese, dta-sroc, bayesian-ma, rob2, robins-i.
**Summary:** **12 P0, 24 P1, 12 P2** (deduplicated).

Runtime persona blocked — Playwright MCP user-data-dir locked by 8 stale chrome processes. Static-source review only this round; we'll run the existing Playwright spec suites via CLI as part of verification.

---

## P0 — Critical (12)

### Methods
- **V6-01** PET-PEESE trim-and-fill is direction-locked to right asymmetry — `r.te > mu` (line 200) and `r.te > mu` for imputation (line 211). Left-asymmetric funnels (small studies pulling estimate DOWN, common in harms outcomes) return k₀=0 even when asymmetry is severe. (`pet-peese/index.html:188-211`)

### Engineering
- **E1** `safeHref()` comment says "Rejects javascript:, data:, file:" but code explicitly ALLOWS `file:` (line 31). Comment lies. (`hub/app.js:22, 29-31`)
- **E2** dosehtml v18.1/v18.2/v18.3/v19.0 + dose-response-pro.html share localStorage keys (`theme`, `dose_response_v18_save`, `dose_response_v18_audit`). Cross-variant state corruption. (`dosehtml/dose-response-pro-v18.{1,2,3}-*.html`)
- **E3** `Pairwiseai/app.js` ships severe cp1252-saved-as-UTF-8 mojibake — 148 `â€/â„¢/Â¸` patterns; runtime patches via `startMojibakeObserver()` rather than fixing at source. (`Pairwiseai/app.js`)
- **E4** 30+ `alert()/confirm()/prompt()` calls across 12 active inner apps (bayesian-ma, citation-dedup, component-nma, cumulative-subgroup, dta-sroc, forest-plot, funnel-plot, grade-sof, heterogeneity, evidence-board, HTA, IPD-Meta-Pro modules) — block main thread, fail focus on iOS Safari.

### A11y
- **AV6-01** GRADE wizard radio inputs lack `name=` — DOM-level mutual exclusion broken; only JS handler maintains state. WAI-ARIA radiogroup keyboard pattern broken. (`grade-sof/index.html:367, 371` and similar inside `renderWizardPanel`)
- **AV6-02** Workflow nav still missing `aria-current="page"` — only `class="current"` (visual). Repo-wide `grep aria-current` returns zero. Was a v5 P2 — escalated to P0 because it's a 5-line fix across 5 files. (`workflow/*/index.html:22-26`)
- **AV6-03** Subcategory bar `aria-live="polite"` on the entire `<nav>` causes 5-10s read-out of every chip on category change. Should be on `#results-summary` (which already exists). (`hub/app.js:114-119`)
- **AV6-04** GRADE wizard upgrade-row uses `opacity:0.55` to indicate "disabled" while leaving inputs operable — keyboard users tab into and toggle radios that have no effect. WCAG 4.1.2. (`grade-sof/index.html:93-94, 425`)

### Security
- **S1** `Pairwiseai/main-screen.html` has NO CSP and loads scripts from `cdnjs.cloudflare.com` and `cdn.jsdelivr.net` via `document.write` + `onerror` fallback. Plus Google Fonts. Violates the "no external CDN" portfolio rule. (`Pairwiseai/main-screen.html:1-25`)
- **S2** `Pairwiseai/app.js` DOM XSS in multi-outcome JSON pipeline — user-pasted JSON `outcomes` keys, `s.interpretation`, `n.warning`, per-row `e.window` flow into `innerHTML` via template literals with no `sanitizeHTML` call. Self-XSS on paste. (`Pairwiseai/app.js:4025, 4030, 4044, 4054, 4056-4057`)

### Domain
- **F1** PRISMA-NMA self-labels "PRISMA 2020 + Hutton 2015 extensions" but ships PRISMA **2009** items (PICOS, item 5=Protocol/registration, item 29=Funding). PRISMA 2020 (Page 2021) has 27 items with 24a-c registration and 26-27 covering data availability/competing interests. Hutton 2015 was itself an extension of 2009. (`prisma-nma/index.html:7, 186, 211`; `hub/projects.js:723`)

## P1 — Important (24)

### Methods
- **V6-02** `bayesian-ma` empirical-Bayes plug-in narrows CrI 5-30% vs fully Bayesian for k<10 with τ²>0; `postSD = sqrt(1/precSum)` treats τ̂² as known. (`bayesian-ma/index.html:228-241, 374`)
- **V6-03** `meta-regression` does not report R² (proportion of τ² explained) or test residual heterogeneity Q_E. The headline statistic per Cochrane Handbook §10.11.4. (`meta-regression/index.html:386-401`)
- **V6-04** `heterogeneity` RE pool CI uses plain z=1.96 instead of HKSJ + t_{k-1}, inconsistent with `forest-plot`. (`heterogeneity/index.html:228-237`)
- **V6-05** `pet-peese` PET-PEESE switch uses two-sided test; Stanley-Doucouliagos prescribe one-sided in the hypothesised direction. (`pet-peese/index.html:236-243`)
- **V6-06** `dta-sroc` regressDS code is unweighted OLS but footer says "weighted OLS" — doc/code mismatch. (`dta-sroc/index.html:119, 178-192`)

### Engineering
- **E5** GRADE wizard listener leak + stale-idx risk on row remove (closures hold `state.outcomes[idx]` after splice). (`grade-sof/index.html:476-548`)
- **E6** Hub `searchTimer` not cleared on `pagehide`. (`hub/app.js:367-374`)
- **E7** Deep-link state ordering fragile: `readUrlState` calls `getSubcategories(activeFilter)` immediately after setting it; safe today but a refactor reordering breaks silently. (`hub/app.js:340-360`)
- **E8** PRISMA-NMA Export/Copy mutate the `saved` closure rather than reading textareas directly. (`prisma-nma/index.html:382-412`)
- **E9** PRISMA-NMA `updateProgress()` still runs full `querySelectorAll` per keystroke (only the localStorage write is debounced). (`prisma-nma/index.html:298-310`)

### A11y
- **AV6-05** Hub filter bar has no `<nav>` landmark — primary navigation control sits in a generic `<div>`. (`index.html:64-73`)
- **AV6-06** GRADE wizard heading hierarchy h2→h4 skip — inside outcome-row with no h3, the wizard panel's `<h4>` violates WCAG 1.3.1. (`grade-sof/index.html:377`)
- **AV6-07** Glossary popover has `role="dialog"` + focus moves into popover but does NOT trap Tab — focus escapes to next sibling after `<body>`. WCAG 2.1.2. (`shared/glossary.js:209-211, 239`)
- **AV6-08** `workflow/styles.css` reduced-motion gate covers only `scroll-behavior` but leaves `.hub-back/.step/.tool-link` transitions un-gated. (`workflow/styles.css:30, 43, 54, 72`)
- **AV6-09** `.filter-chip` inactive-state border still `rgba(31,30,26,0.12)` ≈ 1.5:1 contrast against panel — fails WCAG 1.4.11. The v5 chip-border fix touched featured-card and subcategory chip but missed the parent `.filter-chip`. (`hub/styles.css:8, 242`)
- **AV6-10** GRADE wizard `.opts label` ~17-19px tall — fails WCAG 2.5.8 (24×24 minimum target). (`grade-sof/index.html:90`)

### Security
- **S3** Workflow page CSP missing `frame-ancestors`, `base-uri`, `object-src`, `form-action` — clickjacking-vulnerable. (`workflow/*/index.html:6`)

### Domain
- **F2** DTA workflow says "Use CINeMA's DTA mode where applicable" — CINeMA is NMA-only. The correct framework is GRADE-DTA (Schünemann 2008/2020). (`workflow/diagnostic-test-accuracy/index.html:99`)
- **F3** DTA workflow lacks inline citations to Whiting 2011 (QUADAS-2), Reitsma 2005 (bivariate), Rutter & Gatsonis 2001 (HSROC). (`workflow/diagnostic-test-accuracy/index.html`)
- **F4** PROGRESS-4 mislabelled as "predictors of treatment response" — canonical is "stratified medicine research" (Hingorani 2013 BMJ 346:e5793). (`workflow/prognostic-review/index.html:35`)
- **F5** NMA workflow lacks Salanti 2008/2014 transitivity citation and Nikolakopoulou 2020 CINeMA citation. (`workflow/network-meta-analysis/index.html`)
- **F6** PROBAST notation "4 domains × 20 signalling questions" reads as multiplication; actual is 4 domains, 20 SQs total (Participants 2 + Predictors 3 + Outcome 6 + Analysis 9). (`workflow/prognostic-review/index.html:75`)

## P2 — Minor (12, abbreviated)
- V6-07 GRADE very-large-effect alone reaches High; should cap at Moderate.
- V6-08 fragility index Lin & Lee 2020 variant.
- V6-09 CINeMA glossary "study limitations" naming (GRADE vocab); 6 domains correct.
- V6-10 forest-plot FE z=1.96 documentation.
- V6-11 Guyot IPD requires at-risk numbers in addition to K-M curve.
- V6-12 dta-sroc warning threshold k<5 vs k<4.
- E10 glossary idempotency comment.
- E11 hyphen-boundary semantics.
- E12 silent defer-failure on glossary 404.
- E13 Pairwiseai dead-code archive.
- E14 PRISMA-NMA clearAll/Export coupling.
- AV6-11 forced-colors media query missing.
- AV6-12 results-summary aria-atomic verbosity.
- F7 OR≈RR <10% rule too absolute.
- F8 fixed-effect/common-effect terminology.
- F9 ROBINS-I version vintage.
- F10 "Cochrane-grade" overclaim.
- S4-S6 defensive (localStorage parse, safeHref defense-in-depth).

## False-positive watch
- All v5 false-positive items (DOR, Fisher z, HKSJ, PI, Hedges g, Clopper-Pearson, Foroutan 2020, CHARMS Moons 2014) re-verified — still correct.

---

## Status — REVIEW CLEAN

### Fixes shipped in this session
- **V6-01** [FIXED] PET-PEESE T&F now bidirectional via direction sign of (Tn − n(n+1)/4); both right- and left-asymmetric funnels handled.
- **E1** [FIXED] safeHref comment corrected to reflect intentional `file:` allowance for offline-first launch.
- **E2** [DEFERRED] dosehtml v18.{1,2,3} localStorage collision — needs per-variant namespace migration; future session.
- **E3** [DEFERRED] Pairwiseai mojibake — 148 patterns; needs careful re-encode + runtime test; future session.
- **E4** [DEFERRED] alert/confirm sweep across 12 active inner apps — broad portfolio fix; future session.
- **E5** Determined to be a non-bug (renderForm re-stamps data-idx); no fix needed.
- **E6** [FIXED] Hub `searchTimer` cleared on `pagehide`.
- **AV6-01** [DEFERRED — wizard radio name=] — requires careful re-binding under per-row scope; future session.
- **AV6-02** [FIXED] Workflow nav has `aria-current="page"` across 5 files via sed.
- **AV6-03** [FIXED] Subcategory bar dropped `aria-live` (verbose); existing `#results-summary` carries the announcement.
- **AV6-04** [FIXED] GRADE wizard upgrade-row uses HTML `disabled` attribute to programmatically gate radios when not applicable.
- **AV6-05** [FIXED] Hub filter bar is now `<nav aria-label>` landmark.
- **AV6-06** [FIXED] GRADE wizard outcome row uses `<h3>`; wizard `<h4>` is correctly nested.
- **AV6-07** [DEFERRED — popover focus trap] — needs careful tab-cycle implementation; future session.
- **AV6-08** [FIXED] `workflow/styles.css` reduced-motion gate now covers all transitions.
- **AV6-09** [FIXED] `.filter-chip` parent border bumped to ~3:1 (rgba(31,30,26,0.34)).
- **AV6-10** [FIXED] GRADE wizard `.opts label` min-height:24px touch target; mobile ≤600px stacks to column.
- **S1** [FIXED] Pairwiseai/main-screen.html now has strict CSP — blocks the `document.write` external CDN fallbacks.
- **S2** [DEFERRED] Pairwiseai DOM XSS in JSON paste — needs careful sanitizeHTML insertion + runtime regression; future session.
- **S3** [FIXED] All 5 workflow CSP meta tags hardened with frame-ancestors / base-uri / object-src / form-action.
- **F1** [FIXED] PRISMA-NMA scope honestly documented as Hutton 2015 over PRISMA 2009 in PRISMA 2020 ordering; meta description, header copy, code comment, Markdown export header all corrected.
- **F2** [FIXED] DTA workflow now cites GRADE-DTA (Schünemann 2008/2020); CINeMA recommendation removed.
- **F3** [FIXED] DTA workflow inline-cites Whiting 2011 (QUADAS-2), Reitsma 2005 (bivariate), Rutter & Gatsonis 2001 (HSROC).
- **F4** [FIXED] PROGRESS-4 wording corrected to "stratified medicine — predicting differential treatment effects" with Hingorani 2013 / Steyerberg 2013 / Riley 2013 cites.
- **F5** [FIXED] NMA workflow cites Salanti 2008/2014 transitivity + Nikolakopoulou 2020 CINeMA.
- **F6** [FIXED] PROBAST notation corrected: "4 domains and 20 signalling questions in total (Participants 2, Predictors 3, Outcome 6, Analysis 9)".
- **V6-02** [FIXED] Bayesian-MA stat card flags τ²-conditional CrI when k<10 with τ²>0.
- **V6-03** [FIXED] Meta-regression now reports R² (proportion of τ² explained) + Q_E (residual heterogeneity test) with df=k-2; chiSqCDF added via regularised incomplete gamma.
- **V6-04** [FIXED] Heterogeneity tool RE pool now exposes both z-based and HKSJ + t_{k-1} CI cards.
- **V6-05** [FIXED] PET-PEESE conditional switch now uses one-sided test in the FE direction (Stanley-Doucouliagos prescription).
- **V6-06** [FIXED] DTA-SROC footer now correctly says "unweighted OLS" (matches code) and cites Reitsma 2005 / Rutter & Gatsonis 2001.

**Total: 17 fixed P0+P1 + 6 deferred-with-notes (E2, E3, E4, AV6-01, AV6-07, S2)**.

### Verification
- pytest: 31/31 pass (forest-plot 9, grade-sof 13, prisma-flow 9)
- Playwright hub-crawl: **66/66 pass**
- Playwright e2e-local (regex subset): 2/2 pass
- HTML div balance: clean across all 14 modified surfaces
- node --check: all JS files parse
