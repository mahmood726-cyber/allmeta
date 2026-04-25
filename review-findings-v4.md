<!-- sentinel:skip-file — review document; quotes file paths from earlier audit findings. -->

# Multi-Persona Review v4 — hub experience + course integration

**Status:** Top-10 ship-this-week items FIXED across 3 commits (`018c52f`, `8f0c0e9`, `59c3c1f`, `723437a`) on 2026-04-25. All 10 P0/P1 items from the recommended path are now live on `main`.

**Deferred items D1–D6 ALSO COMPLETE** as of 2026-04-22 across commits `97f781f` (D1), `c5706f6` (D2), `3e401ba` (D3), `ff7758d` (D4), `78a4c90` (D5), `3c51945` (D6):
- **D1 ✓** Subcategorise the 34-deep Evidence Synthesis bucket — second-level filter strip with URL `?sub=` deep-linking
- **D2 ✓** Cochrane Handbook v6.5 citations on pet-peese / gosh / gosh-metareg footers
- **D3 ✓** PRISMA-NMA Checklist (Hutton 2015) — new `prisma-nma/` tool with 32 items + 5 NMA extensions, Markdown export
- **D4 ✓** GRADE 5-domain wizard upgrade — RCT/observational start, 5 downgrade domains, 3 upgrade considerations, structured rationale
- **D5 ✓** `shared/glossary.js` widget — ~70 evidence-synthesis terms, popover tooltips, wired into 5 anchor tools (forest-plot, grade-sof, prisma-nma, pet-peese, gosh)
- **D6 ✓** `workflow/rapid-review/` (Garritty 2021) + `workflow/prognostic-review/` (PROGRESS framework) companion pages, all 5 paths cross-linked

Remaining low-priority items (broader alert/confirm migration in IPD-Meta-Pro/nma-pro-v2, missing methods coverage like RoBMA/RVE/Reitsma) deferred for a future review cycle.

**Date:** 2026-04-25
**Scope:** the **whole hub experience** — landing page, inner-app navigation, pedagogy/course cross-link, methodological coverage, accessibility, deployment. Different surface than v3 (which was per-app code polish in `effect-size-converter` + `rct-extractor`).

**Personas:** UX/IA, Pedagogy, Methods, Accessibility, Engineering. **Files surveyed:** `index.html`, `hub/projects.js` (783 ln, 71 catalog entries, 14 cats), `hub/app.js` (184 ln), `hub/styles.css` (496 ln); spot-checked apps `forest-plot`, `nma`, `gosh`, `pet-peese`, `dta-sroc`, `rob2`, `prisma-flow`, `grade-sof`, `pico`, `rct-extractor`, `cerqual`, `copas`, `p-curve`. Live HTTP probes on 10 apps; synthesis-courses (`Fatiha-course-github-v2/index.html`) cross-walked.

## Summary
**12 P0, 28 P1, 18 P2.** The engineering is sound; the *hub-as-product* is the gap. Five themes:
1. **No journey** — landing page is an undifferentiated wall of 71 cards. No workflows, no recommendations, no learner path.
2. **No way back** — none of the 60+ inner apps link back to the hub. Once you click "Open App", the catalogue is gone.
3. **Pedagogy is invisible** — zero links between allmeta and the 26-course Synthesis collection in either direction. The course master plan promises "Forest Plot Generator", "GRADE Builder" — the tools exist but are never wired.
4. **Methodological defaults are below 2026 standard** — `forest-plot` has no Hartung-Knapp and no prediction interval; `nma` runs DL with no consistency test; `grade-sof` is a certainty-label picker, not GRADE.
5. **Production payload leaks dev trash** — GitHub Pages rsync ships `*/_archive/`, `*/backup_*`, `*/dev/`, `STUCK_FAILURES.*`, leaking ~50 MB of internal audit data and `/home/user/...` paths.

---

## P0 — Critical (12)

### Methods (highest stakes — wrong numbers)
- **[V4-P0-1] MTH** `forest-plot/index.html:205-251` — only FE + Q-profile RE; CI hard-coded `± 1.96·se`. **No HKSJ, no PI band, no t-distribution.** Per `~/.claude/rules/advanced-stats.md`: HKSJ floor `max(1, Q/(k-1))` with `qt(α/2, k-1)`; PI = `μ ± t_{k-2}·sqrt(seHKSJ² + τ²)`. Fix: add HKSJ branch + PI line on the SVG; refuse PI for k<3.
- **[V4-P0-2] MTH** `nma/index.html:304-322` — DL τ² with k = #contrasts (often <10), **no design-by-treatment test, no node-splitting.** SUCRA computed without testing consistency. The `nma-global-inconsistency` app has the LR test — port it. advanced-stats.md: "Always test consistency before interpreting."
- **[V4-P0-3] MTH** `gosh/index.html:122-128, 131-144` — exhaustive enumeration only (browser freezes for k>15); `Math.random` not seeded. Per lessons.md: GOSH must use seeded **xoshiro128** sampling for k>15**. Fix: replace exhaustive loop with seeded random subset sampler (10 000 samples), expose seed input.
- **[V4-P0-4] MTH** `grade-sof/index.html:286-290` — certainty is a free-form `<select>`. **No structured 5-domain reasoning** (RoB / inconsistency / indirectness / imprecision / publication bias) and no upgrade rules (large effect, dose-response, plausible confounders). This is a label picker, not GRADE. Won't pass a Cochrane editor.

### UX / Navigation
- **[V4-P0-5] UX** **No back-link in any inner app.** Audited 10/60+ apps — zero hits for `../index.html` or any "back to hub" affordance. Combined with `hub/app.js:148-151` opening file-mode cards in **same tab**, users land in an app with no way back to the catalogue except browser-back. Fix: shared `<a href="../">← allmeta</a>` partial injected into top of every inner `index.html`, OR force `target="_blank" rel="noopener"` on all card launches.
- **[V4-P0-6] UX** Hero metric labels are meaningless. `index.html:31-45` shows "Apps in catalog / Linked externally / Productivity tools / Categories" — answers no question a researcher arrives with. Replace with workflow buttons or category-based counts (Pairwise / Network / RoB / Reporting).

### Pedagogy
- **[V4-P0-7] PED** `forest-plot/index.html` has **zero references and zero "what-is-this" copy** — pasted by a novice produces a plot with no exposure to FE/RE, τ², or PI. Highest-trafficked tool, no theory anchor. Fix: 4-sentence "Theory" sidebar pulling Cochrane Handbook §10.10–10.11 + 1 reference + warning at k<10.
- **[V4-P0-8] PED** **Zero allmeta↔synthesis-courses links in either direction.** `grep allmeta` in courses index = 0 hits; `grep learn|course|tutorial` in allmeta landing = 0 hits. The 26-course collection promises "Forest Plot Generator", "GRADE Builder", "Pub Bias Detector", "RoB Tool" — those tools exist in allmeta but are never wired. Fix: per-tool `course:` field in `projects.js` + cross-site banner from each course's end-of-module CTA.

### Accessibility
- **[V4-P0-9] A11Y** `rob2/index.html:227-231` — radio groups have **no programmatic group label**. Each 5-option set is `<span class="opts">` not `<fieldset><legend>`. NVDA/VoiceOver users hear "Y, radio button, 1 of 5" — never the question. WCAG 1.3.1/4.1.2. Affects all 18 RoB 2 questions.
- **[V4-P0-10] A11Y** `forest-plot/index.html:324`, `prisma-flow/index.html:421` — SVG output has **no `<title>`/`<desc>`/`role="img"`/`aria-labelledby`**. The scientific output is invisible to screen readers. WCAG 1.1.1.

### Engineering / Deploy
- **[V4-P0-11] ENG** `.github/workflows/pages.yml:24-29` — Pages rsync excludes `tests/`, `.github/`, `docs/`, `scripts/`, `node_modules/` but **NOT** `*/_archive/` (8.9 MB), `*/backup_*/`, `*/dev/` (31 MB), `STUCK_FAILURES.*` (1.3 MB), `*/Submission/`, `*/e156-submission/`. Production ships ~50 MB of dev/audit trash; `IPD-Meta-Pro/dev/build-scripts/edge_webdriver.py` leaks `/home/user/...` to public Pages.
- **[V4-P0-12] ENG** `hub/projects.js:588` references `./Pairwiseai/Main screen.html` — **filename has a space**. Already in `e2e-extensive.spec.ts:KNOWN_SHIP_ANYWAY` flagged broken. Rename to `main-screen.html` + update manifest.

---

## P1 — Important (28)

### UX / IA
- **[V4-P1-1] UX** No workflow / decision-aid landing. 71 cards in a single grid with no PRISMA/NMA/DTA pathway. **Fix:** build `/workflow/systematic-review/index.html` (Search → Screen → RoB 2 → Forest Plot → GRADE-SoF in order, 1-line rationale per step). Replicate for NMA + DTA.
- **[V4-P1-2] UX** No "featured" / "start here" surfacing. Card order is manifest-array order — `rct-extractor` first, Forest Plot is entry 33 of 71. Add `featured: true` flag, render 6-card "Most-used tools" strip above grid.
- **[V4-P1-3] UX** Methodologist tools buried — Copas, GOSH, p-curve, PET-PEESE, Limit-MA all live in a 36-deep "Evidence Synthesis" bucket. Add `subcategory:` field; split into Pooling / Heterogeneity / Pub-bias / Small-study / Sensitivity.
- **[V4-P1-4] UX** Search has no synonym index (`hub/app.js:80-90` is substring-only). "REML"/"DerSimonian"/"FE-RE" returns nothing useful. Add `keywords:` array per entry; tokenise word-boundary.
- **[V4-P1-5] UX** Filter chips have no count badge. User clicks "Network Meta-Analysis" not knowing if it's 3 or 30. Append `(n)` after `getFilters()` in `hub/app.js:57`.
- **[V4-P1-6] UX** No URL-as-state — filter+search not synced to `location.hash`. Refresh resets, share-link impossible.
- **[V4-P1-7] UX** `mode:"server"` cards say "Use Local Server" disabled, no instructions on the card. Link the disabled label to `#about` or open `<details>` with the exact `python -m http.server 8080` command.
- **[V4-P1-8] UX** Card grid fixed `repeat(3, ...)` until 1024px (`styles.css:325`); on 1440px monitor leaves 24-card-tall scroll. Use `repeat(auto-fill, minmax(320px, 1fr))`.

### Pedagogy
- **[V4-P1-9] PED** No "Theory" sidebar / explain-mode in any app. Catalog summaries in `projects.js` are dense one-liners aimed at experienced methodologists — nothing for an MSc student.
- **[V4-P1-10] PED** No glossary / tooltip layer. Terms like SUCRA, HSROC, PET-PEESE, τ², I² appear in card titles with no hover definition. Build `shared/glossary.js` (60 terms) — bulk-add `<span class="term">` to category labels.
- **[V4-P1-11] PED** No tool cites Cochrane Handbook chapters or PRISMA item numbers in the footer. Methods app without provenance = black box.
- **[V4-P1-12] PED** No progressive disclosure — advanced controls (estimator choice, HKSJ, continuity correction) sit alongside basic inputs. Add "Show advanced".
- **[V4-P1-13] PED** Course→tool dead end. The 26-course set has CTAs that don't go anywhere on tool side. Append a "Now try it" panel to each course HTML linking the relevant allmeta deep URL.
- **[V4-P1-14] PED** **GAP — courses without companion tools:** rapid-reviews-course (no rapid-review tool); prognostic-reviews-course (no PROBAST/CHARMS tool). Either build minimal apps or remove the misleading promise.

### Methods
- **[V4-P1-15] MTH** `forest-plot` Q-profile uses `1.96` (lines 211, 249). With k<30 anti-conservative — use `qt(0.975, k-1)` for HKSJ, `qt(0.975, k-2)` for PI.
- **[V4-P1-16] MTH** `dta-sroc` Moses-only; no Reitsma/HSROC. Below Cochrane DTA Handbook ch. 10 standard. Threshold check (Spearman on logit-Se/logit-FPR) is correct ✓.
- **[V4-P1-17] MTH** No log-scale forest plot. `forest-plot` accepts arbitrary `est, se` but never branches on "this is log-RR/log-OR/log-HR; back-transform after pooling". Per lessons.md: "Natural scale + RE = Simpson's paradox."
- **[V4-P1-18] MTH** No Fisher-z meta-analysis tool (correlation MA). Variance must be `1/(n-3)`, r clamped to [-0.9999, 0.9999].
- **[V4-P1-19] MTH** PRISMA-flow is 2020 ✓ but **no PRISMA-NMA, PRISMA-DTA, PRISMA-Equity, PRISMA-Harms** generator.
- **[V4-P1-20] MTH** `rob2` overall-judgment rule is non-standard — Sterne 2019 says multiple "some concerns" *may* warrant upgrade to High; code implements a softer rule. Make it a user-toggle, not silent.

### Accessibility
- **[V4-P1-21] A11Y** All "Open App" links have identical text (`hub/app.js:144`). Out of context (NVDA Insert+F7) all 71 read "Open App". Add `aria-label="Open " + project.name`. WCAG 2.4.4.
- **[V4-P1-22] A11Y** `index.html:90` `<section id="project-grid" aria-live="polite">` over-announces — fires for every card on every keystroke (rebuilds 71 cards). NVDA queues all card text. Already covered by `#results-summary`. Remove the grid `aria-live`. WCAG 4.1.3.
- **[V4-P1-23] A11Y** Dark-mode `--pill-new` 1.7:1 contrast (`hub/styles.css:387`) — `#2f52a0` on `#1c1f23`. Override in dark `:root` block. WCAG 1.4.3.
- **[V4-P1-24] A11Y** `grade-sof` table has no `<caption>` and no `scope=` on multi-row headers. JAWS/NVDA can't parse in browse mode. WCAG 1.3.1.
- **[V4-P1-25] A11Y** Hub has no `<nav>` and no `<footer>` landmark. Hero CTAs (`#catalog`, `#about`) act as nav inside `<header>`. WCAG 1.3.1.
- **[V4-P1-26] A11Y** `scroll-behavior: smooth` not gated by `prefers-reduced-motion: no-preference` (`styles.css:23`). UK PSBAR-2018 reviewers cite it.

### Engineering
- **[V4-P1-27] ENG** Search rebuilds full 71-card grid on every keystroke (`hub/app.js:183` — no debounce). Wrap in 120 ms debounce.
- **[V4-P1-28] ENG** **Dialog plague: ~2,086 `alert/confirm/prompt(` occurrences** across the repo (excluding `_archive/` and `backup_*`). Top offenders: `IPD-Meta-Pro/ipd-meta-pro.html` (145), duplicates in `e156-submission/assets/` (145) and `Submission/` (141), `IPD-Meta-Pro/dev/tests/temp_*.js` (4 files × 100-140 each), `nma-pro-v2/nma-pro-v8.0.html` (81), `nma-dose-response-app/app.js` (47). PairwisePro is fixed (this session) but the wider repo has hundreds more. The 3-way IPD-Meta-Pro duplication (root + e156-submission/ + Submission/) is the same defect surfacing thrice — fixing one fixes all three after de-duplication.
- (continuing with PED-P1-13 already listed; full list is 28 items but several overlap — see below.)

---

## P2 — Minor (18 — abbreviated)

CSS/typography polish, missing `og:image` metadata, hardcoded `folder: "C:\\HTML apps\\..."` in `projects.js:4` (lessons.md "no hardcoded local paths"), no `404.html`, no `sitemap.xml`, README app-count drift ("25 apps" vs actual 71), `package-lock.json` only in `tests/playwright/`, no `.editorconfig`/Prettier/ESLint, decorative `::before` gradient on every card, hero `h1 { max-width: 10ch }` clips on tablets, search input missing UA-consistent clear button, code samples missing `lang="bash"`, no `prefers-contrast: more`, no `og:image` (synthesis-courses has it — copy the pattern), tier label only by colour on `rct-extractor` confidence bar, Cochrane Handbook chapter citations missing in tool footers, Andrews-Kasy / Mathur-VanderWeele selection models absent from pub-bias suite, no per-row error containment in `consensusWrap.innerHTML` template, `title` on landing is the bland "HTML Apps Hub" (replace with "allmeta — open tools for evidence synthesis").

---

## Coverage gaps — what's missing in 2026

| Method / artifact | Status | Priority |
|---|---|---|
| Hartung-Knapp-Sidik-Jonkman (default for k≥2) | absent | P0 |
| Prediction interval on forest plot | absent | P0 |
| GRADE 5-domain structured downgrade | absent | P0 |
| Design-by-treatment inconsistency test in headline NMA | absent | P0 |
| Cross-link to synthesis-courses | absent | P0 |
| Inner-app back-link to hub | absent | P0 |
| RoBMA (Bayesian model-averaging pub bias) | absent | P1 |
| Robust variance estimation (RVE / clubSandwich) | absent | P1 |
| Multilevel / 3-level MA with cluster-robust inference | absent | P1 |
| Fisher-z correlation MA | absent | P1 |
| Bivariate / Reitsma DTA | absent | P1 |
| RMST meta-analysis | absent (memory mentions it) | P1 |
| Dose-response with restricted cubic splines | uncertain (verify dosehtml) | P1 |
| GRADE-ADOLOPMENT, QUIPS (prognosis), CHARMS | absent | P2 |
| PRISMA-NMA / DTA / Equity / Harms | absent | P1 |
| ROBIS (review-level) | absent | P2 |
| Andrews-Kasy / Mathur-VanderWeele selection models | absent | P2 |

---

## Course ↔ Tool crosswalk (proposed `course:` field per app)

| Course (synthesis-courses) | allmeta tool(s) |
|---|---|
| synthesis-course | forest-plot, heterogeneity, ma-workbench |
| meta-analysis-methods-course | forest-plot, mh-peto, meta-regression |
| meta-analysis-topic-selection-course | pico, citation-chaser |
| meta-analysis-writing-course | prisma-flow, prisma-checklist |
| grade-certainty-course | grade-sof, cerqual, cinema |
| risk-of-bias-mastery-course | rob2, robins-i, robins-e, rob-traffic-light, quadas-2 |
| advanced-meta-analysis-course | bayesian-ma, multilevel-ma, gosh, gosh-metareg |
| ipd-meta-analysis-course | IPD-Meta-Pro, km-reconstructor |
| publication-bias-detective | pet-peese, p-curve, copas, pubbias-tests, funnel-plot |
| dta-course-when-the-test-lies-v4 | dta-sroc, hsroc, quadas-2 |
| observational-evidence-course | robins-i, robins-e |
| qualitative-evidence-synthesis-course | thematic-synthesis, cerqual |
| umbrella-reviews-course | amstar-2 |
| living-reviews-course | living-meta |
| **rapid-reviews-course** | **GAP — no companion tool** |
| **prognostic-reviews-course** | **GAP — no PROBAST/CHARMS tool** |
| hta-oman-course | HTA, mcid, dosehtml |
| truthcert-course | Truthcert1 |
| cast-when-certainty-kills | tsa, powerma |
| ai-meta-analysis-course | local-ai, rct-extractor |
| meta-sprint-course | citation-dedup, prisma-screen, focus-studio |
| becoming-methodologist | webr-studio, webr-validator |

---

## Top-10 ship-this-week (consolidated, ranked by "best meta site" leverage)

1. **Inner-app back-link** — one-line `<a href="../">← allmeta</a>` partial injected into top of every inner `index.html` via a Python codemod. **Fixes V4-P0-5.** ~2 hours.
2. **Cross-link Synthesis Courses** — add `course:` field to `projects.js` for ~22 mapped entries; render "Learn the theory →" link in card footer; banner top-of-grid per active category. **Fixes V4-P0-8.** ~half day.
3. **Pages workflow excludes** — patch `.github/workflows/pages.yml` to drop `*/_archive/`, `*/backup_*`, `*/dev/`, `STUCK_FAILURES.*`, `*/Submission/`, `*/e156-submission/`. **Fixes V4-P0-11.** ~1 hour. Removes 50 MB + the leaked `/home/user/` path.
4. **forest-plot HKSJ + PI** — add HKSJ branch with `qt(α/2, k-1)` and HKSJ-floor `max(1, Q/(k-1))`; render PI band `μ ± t_{k-2}·sqrt(seHKSJ²+τ²)` on the SVG; refuse PI for k<3. **Fixes V4-P0-1, V4-P1-15, V4-P1-17.** ~1 day.
5. **Workflow pages** — `/workflow/systematic-review/`, `/workflow/network-meta-analysis/`, `/workflow/diagnostic-test-accuracy/`. Static HTML, 4 numbered cards in PRISMA order each. Surface from hero with a third button "Workflows". **Fixes V4-P0-6 + V4-P1-1.** ~1 day.
6. **Featured strip + filter count badges + URL state** — `featured: true` flag on 6 anchor entries; `(n)` count after each chip; sync filter+query to `history.replaceState`. **Fixes V4-P1-2, V4-P1-5, V4-P1-6.** ~3 hours.
7. **A11y trio (5 lines, ~10 minutes)** — (a) `aria-label="Open " + project.name` on card link `hub/app.js:144`; (b) remove `aria-live="polite"` from `#project-grid` `index.html:90`; (c) override `--pill-new` foreground in dark `@media`. **Fixes V4-P1-21, V4-P1-22, V4-P1-23.**
8. **RoB 2 fieldset/legend** — wrap each `.q` row in `<fieldset><legend>` (or `role="radiogroup" aria-labelledby`). 18 questions. **Fixes V4-P0-9.** ~1 hour.
9. **forest-plot SVG `<title>`/`<desc>`** + same in `prisma-flow`. **Fixes V4-P0-10.** ~30 min.
10. **Rename `Pairwiseai/Main screen.html` → `main-screen.html`** + update manifest. **Fixes V4-P0-12.** ~5 min.

---

## False-positive watch (per lessons.md)

These were checked and NOT flagged as bugs:
- DOR = exp(μ₁+μ₂) ✓ (Reitsma bivariate output, correct)
- Clayton θ = 2τ/(1−τ) ✓
- Clopper-Pearson α/2 ✓
- `dta-sroc` conditional +0.5 cell correction ✓ (only when ≥1 cell zero)
- `dta-sroc` Spearman threshold check uses logit(FPR) which equals −logit(Sp) — equivalent ✓
- `prisma-flow` already 2020 (not 2009) ✓

---

## Status

**Awaiting user direction on which P0/P1 to fix in v4 round.** Recommended path: **Top-10 ship-this-week** above, in 3 batches of ~3-4 days each.
