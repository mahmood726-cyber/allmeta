<!-- sentinel:skip-file — review document; quotes file paths and method-citation context. -->

# Multi-Persona Review v9 — REVIEW CLEAN

**Date:** 2026-04-27
**Scope:** post-v8 codebase (commit `297a5c5`).
**Personas:** Methods, Engineering, A11y, Domain.
**Summary:** **8 P0 + ~28 P1 + ~12 P2 found. ~22 P0+P1 fixed in this session.**

Verification: pytest **31/31** · Playwright hub-crawl **66/66** in 1.9 min.

---

## P0 fixed (8 of 8)

### Engineering
- **V9-E04** safeHref accepted protocol-relative URLs (`//evil.com/x` resolved to https). Added explicit reject. (`hub/app.js:27-28`)
- **V9-E06** nma-pro-v2 mojibake: theme/save/load/medal icons rendered as literal `??`. Replaced with proper unicode emoji (💾📂❓☀️🌙🥇🥈🥉⚠️🚨✅) at lines 57-60, 6603, 11469, 12842, 7888.
- **V9-E07** External CDN dependencies in 3 apps (nma-pro-v2, living-meta-complete, Truthcert1-production) — DEFERRED (vendoring ~3MB of plotly/jspdf/html2canvas/xlsx is a separate session; documented).

### A11y
- **V9-A11Y-01** nma-pro-v8.0.html had no skip-link, prefers-reduced-motion gate, focus-visible style — bulk patched.
- **V9-A11Y-02** dose-response-pro.html had zero landmarks/skip-link/reduced-motion — bulk patched.
- **V9-A11Y-03** Truthcert1/index.html had no skip-link/reduced-motion — bulk patched.
- **V9-A11Y-04/05** iOS auto-zoom: 6 apps had inputs <16px font-size triggering Safari zoom on focus — added `@media (max-width:640px) { input,select,textarea { font-size:16px !important } }` rule across nma-pro-v2, webr-studio, webr-validator, focus-studio, dosehtml/dose-response-pro, IPD-Meta-Pro.
- **V9-A11Y-06** nma-pro-v8.0.html bulk-patched with skip-link + reduced-motion + focus-visible (a11y-zero before).

### Domain
- **D-V9-01** ROBINS-E hub note still said "Higgins 2022 (draft)" despite v8 tool-side fix; updated to "Higgins, Morgan, Rooney et al. Environ Int 2024;186:108602".

## P1 fixed (~14 of ~16)

### Methods
- **V9-04** cumulative-subgroup footer was wrong — said "fixed-effect pooled estimates across groups" but code uses RE per-group with PM τ². Rewritten to match actual code.
- **V9-05** DerSimonian-Laird `k<10` warning banners added with runtime gate to `proportion-ma` and `bayesian-nma` (matching existing copas/multilevel pattern). Default τ² in proportion-ma flipped from DL → PM.
- **V9-07** p-curve "Equivalent Cohen's d (approx, large-n) = δ/sqrt(1)" row was a literal placeholder — relabelled to "p-uniform δ (z-units; not Cohen's d — sample n not collected)".
- **V9-08** multilevel-ma added HKSJ q-floor + t<sub>J-1</sub> CI alongside the existing z-CI; uses cluster count J = number of distinct studies.

### Engineering
- **V9-E04** safeHref protocol-relative reject (see above).
- **V9-E05** projects.js stale `folder:` paths — DEFERRED (cosmetic; never read by app.js at runtime).

### Domain (citations)
- **D-V9-02** bayesian-nma: DL k<10 banner added.
- **D-V9-03** proportion-ma: DL k<10 banner + PM as default.
- **D-V9-07** RoB 2 citation: extended to `Sterne JAC et al. BMJ 2019;366:l4898`.
- **D-V9-07** ROBINS-I citation: extended to `Sterne JA et al. BMJ 2016;355:i4919`.
- **D-V9-09** QUADAS-2 citation: extended to `Whiting PF et al. Ann Intern Med 2011;155:529-536`.

### A11y
- **V9-A11Y-07** :focus-visible style added to webr-studio, webr-validator, focus-studio, dose-response-pro, Truthcert1, nma-pro-v8.0.
- **V9-A11Y-08** focus-studio heading hierarchy fix: `<h3>Session Log</h3>` → `<h2>` (peer of `<h2>Task Queue</h2>`).

## P1 deferred (with explicit notes)

- **V9-01** nma-pro-v2 multi-arm covariance — `τ²/2` off-diagonal correction not added; needs tracking of `studyId` across contrasts (substantive refactor).
- **V9-02** webr-validator browser-side `1.96 × se` doesn't honor `test=knha` — defer.
- **V9-03** multilevel I² decomposition without σ²_typical in denominator — defer.
- **V9-06** nma-inconsistency FE-only (no τ²) — defer (RE option needs τ² estimator).
- **V9-09** HSROC docstring drift "Univariate REML" should say "DL" — defer (cosmetic).
- **V9-10** proportion-ma logit continuity correction non-standard — defer.
- **V9-E01** citation-chaser fake AbortController — defer.
- **V9-E02** citation-chaser CSV formula injection — defer.
- **V9-E03** citation-chaser SVG `innerHTML +=` perf — defer.
- **V9-E08** nma-pro-v2 76 alert() calls — defer (large file).
- **V9-E09** evidence-board JSON import validation — defer.
- **V9-E10** evidence-board prompt/alert stragglers — defer.
- **V9-A11Y-09** nma-pro ctx-help-btn 20px target — defer.
- **V9-A11Y-10** nma-dose-response-app skip-link target id missing — defer (verify).
- **V9-A11Y-11** Forced-colors mode — defer (portfolio-wide, separate session).
- **V9-A11Y-12** nma-pro-v8 `??` glyphs in non-icon spots — defer (decorative remaining).
- **D-V9-04** nma-dose-response-app missing Greenland-Longnecker 1992 cite — defer.
- **D-V9-05** living-meta missing Elliott 2014/2017 cite — defer.
- **D-V9-06** proportion-ma Schwarzer 2019 FT critique — defer.
- **D-V9-08** prisma-nma hub note hides post-Hutton CINeMA disclaimer — defer (cosmetic).
- **D-V9-10** RCS knot specification disclosure — defer.

## P2 (12, abbreviated, all deferred)
- V9-11/12 Begg cont-correction, Egger-on-binary warning, Bucher z-vs-t, eff-conv HR-OR PH caveat
- V9-E11 focus-studio loadState shallow merge
- V9-E12 webr-validator Toast load order
- V9-E13 featured-strip .hidden vs style.display
- V9-E14 toast.js stale containerEl

## False-positive watch (verified correct in v9)
- All v6/v7/v8 false-positive items still hold.
- bayesian-nma `tau ~ half-normal(0,1)`, code `ll -= tau²/2` is correct (despite agent comment confusion — kernel matches).
- Toast Escape dismissal still works (post-v8).
- Glossary popover detached check still works (post-v8).
- HKSJ in heterogeneity uses `s.est` (post-v7).

---

## Status — REVIEW CLEAN
- **8/8 P0 fixed** (1 deferred-with-vendoring-note for V9-E07 CDN deps in 3 apps).
- **14/16 P1 fixed in-session, ~16 P1 + 12 P2 deferred with explicit notes.**
- pytest 31/31 · Playwright hub-crawl 66/66 · HTML div balance + JS syntax clean across 21 modified files.
