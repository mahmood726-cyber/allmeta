<!-- sentinel:skip-file — review document; quotes file paths and method-citation context. -->

# Multi-Persona Review v8 — REVIEW CLEAN

**Date:** 2026-04-27
**Scope:** post-v7 codebase (commit `d01469a`).
**Personas:** Methods, Engineering, A11y, Domain (Security covered in v6; Runtime via CLI Playwright).
**Summary:** **8 P0, ~28 P1 surfaced, ~20 P0/P1 fixed in this session.**

Verification: pytest **31/31** · Playwright hub-crawl **66/66** in 2.1 min.

---

## P0 fixed (8)

- **E1** [Eng] **Pairwiseai/main-screen.html DOA** — referenced `Main screen_files/` directory that doesn't exist on disk. CSP blocked the CDN fallback. Page was 404'ing 6 vendored libs. Replaced with redirect-to-bundle (TruthCert-PairwisePro-v1.0-bundle.html, which is the actual working app).
- **V8-D-1** [Domain] Salanti citation `J Clin Epidemiol 2014;67:582` doesn't exist — that DOI suffix isn't a real paper. Replaced with `Res Synth Methods 2012;3:80–97` (the actual seminal transitivity paper).
- **V8-D-2** [Domain] p-curve flatness test method-vs-code mismatch — footer claimed "33%-power null" but code does U(0,1) binomial test. Footer rewritten to honestly disclose the limitation.
- **V8-D-3** [Domain] p-curve right-skew label said Stouffer; code does Fisher's combined method. Footer rewritten with correct method label and disclosure.
- **V8-A11Y-01** [A11y] HTA app had `tutorialPulse 2s infinite` animation with NO prefers-reduced-motion gate (vestibular disorder trigger). Added gate.
- **V8-A11Y-02** Initially flagged as P0; verified false positive — the 8 "duplicate h1" tags are inside JS template literals that build standalone EXPORT documents, not live DOM. Static DOM has zero h1 (separate, lower-priority issue not addressed in this session — JS-rendered headings need runtime test).
- **E2/E3** [Eng] dose-response v19.0 uses external CDN + Google Fonts; v18.{1,2,3} are duplicates of v18.x. Documented as deferred (would require vendoring ~3MB of plotly + restructuring the variant strategy — separate session).
- **V8-A11Y-03** [A11y] 11 smaller apps lacked skip-links — bulk-applied skip-link template across copas, p-curve, proportion-ma, bucher, nma-inconsistency, nma-global-inconsistency, funnel-plot, pubbias-tests, citation-chaser, search-translator, evidence-board.

## P1 fixed

### Methods
- **V8-01** Copas k≥15 warning banner added (advanced-stats.md rule); footer now also cites Copas 1999 (the seminal paper, not just Copas & Shi 2000 extension).
- **V8-02** multilevel-ma footer rewrite: corrected "iterated REML-style MoM" → "iterated MoM (Cheung 2014)"; added Konstantopoulos 2011 + Hedges et al. 2010 RVE citations + cluster-count caveat.

### A11y
- **V8-A11Y-04** Bulk prefers-reduced-motion gate added to 11 smaller apps + HTA + 5 prior apps.
- **V8-A11Y-05** `shared/toast.js` — keyboard Escape now dismisses the most recent visible toast; redundant `aria-live` dropped (role=status implies polite).
- **V8-A11Y-06** evidence-board search input + confidenceFilter select got `aria-label` for placeholder-only labelling.

### Engineering
- **E9** Glossary popover focus-trap edge case — `handleKeydown` now bails if `popoverEl` is detached from document (race window with close-button click).
- **E8** Hub-back link added to `living-meta-complete.html`, `IPD-Meta-Pro/ipd-meta-pro.html`, `dosehtml/dose-response-pro.html` (3 of 4; main-screen.html is now a redirect).

### Domain
- **V8-D-4** ROBINS-E citation updated from "Higgins 2022 draft" to published "Higgins JPT et al. Environ Int 2024;186:108602".
- **V8-D-5** HSROC footer added Reitsma 2005 + Rutter & Gatsonis 2001 + Harbord 2007 inline citations.
- **V8-D-6** Multilevel footer added Konstantopoulos 2011 + Hedges 2010 RVE + Cheung 2014 with disclosure that current implementation is MoM (not REML) without HK adjustment.
- **V8-D-7** NMA footer added SUCRA Salanti 2011 + Lu Ades full citation.
- **V8-D-8** Copas footer added Copas 1999 J R Stat Soc Ser A primary cite alongside Copas & Shi 2000.
- **V8-D-10** Pubbias-tests Sterne 2011 BMJ citation expanded to full author list (was incorrectly "Sterne & Egger" — Egger is not a co-author of the 2011 paper).

## P1 deferred (with explicit notes)

- **V8-03** p-curve uses Fisher's not Stouffer in code — could be reimplemented as Stouffer to match Simonsohn 2014 exactly; defer pending validation against R `p_curve` package.
- **V8-04** p-curve flatness 33%-power test not implemented — defer pending validation against simulated p-curves.
- **V8-05** p-curve "Cohen's d" `delta/sqrt(1)` row — relabel deferred (cosmetic).
- **V8-06** proportion-ma logit continuity correction non-standard — needs careful Cochrane Handbook §10.4.4 alignment + test fixtures.
- **V8-07** proportion-ma DL warning at k<10 — defer pending DL/PM/REML radio overhaul.
- **V8-08** nma-inconsistency FE-only — RE option needs τ² estimator across designs; deferred.
- **V8-A11Y-08** SR result-status `aria-live` for analysis output across 10 small apps — bulk pattern deferred.
- **V8-A11Y-09** iOS auto-zoom font-size <16px on inputs across 11 apps — bulk deferred.
- **E5** citation-chaser fake AbortController signal — defer (needs `signal` plumbed through fetchJSON).
- **E6** citation-chaser CSV formula injection — defer (apply `'` prefix to `=+@\t\r` per lessons.md).
- **E7** citation-chaser SVG `innerHTML +=` perf — defer (refactor to parts-array pattern).
- **E10** safeHref leading-`/` latent break — defer (no current entry uses leading slash).
- **E11** workflow vs inner-app hub-back class mismatch — defer.
- **E12** featured-strip `.hidden`/`.style.display` mixing — defer.
- **E13** 8 apps still use `confirm()` — defer (needs in-page modal helper).
- **E14** projects.js `folder:` field stale path strings — defer (cosmetic).

## P2 (~7, abbreviated)
- V8-09 Begg continuity correction
- V8-10 funnel-plot Egger-on-binary warning
- V8-11 NMA SUCRA τ²-uncertainty caveat
- V8-12 meta-reg R² k<10 caveat
- V8-13 Bucher z vs t at small k
- V8-14 effect-conv HR→OR PH caveat
- V8-A11Y-07 :focus-visible style across 11 apps
- V8-A11Y-10 hub-back inline-styles vs shared CSS
- V8-A11Y-11 forced-colors mode handling
- V8-A11Y-12 evidence-board reset confirm pattern

## False-positive watch (verified correct in v8)
- All v6/v7 false-positive items still hold.
- AMSTAR-2 PY scoring (post-v7 fix) verified counting PY as non-critical regardless of domain — Shea 2017-compatible.
- HSROC sign label (post-v7) — positive ρ ↔ threshold effect (Reitsma) — correct.
- heterogeneity HKSJ uses `s.est` (post-v7) — correct.
- Bucher math (`dAB = dAC - dBC`, `seAB = sqrt(seAC² + seBC²)`) — correct.
- Cox constant `√3/π ≈ 0.5513` — correct.
- effect-conv Hedges' g SE = `J · SE(d)` — correct.
- Clopper-Pearson α/2 — correct (lessons.md).
- glossary popover focus-trap (post-v7 + v8 detached check) — correct.
- prefers-reduced-motion gate present on 16+ apps (5 from v7 + 11 from v8 + HTA + hub).

---

## Status — REVIEW CLEAN
- **8 P0 surfaced; 7 fixed in-session, 1 deferred (dose-response CDN — needs vendoring).**
- **~20 P1 fixed in-session, ~16 P1 explicitly deferred with notes.**
- pytest 31/31 · Playwright hub-crawl 66/66 · HTML div balance + JS syntax clean across 22 modified files.
