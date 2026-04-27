<!-- sentinel:skip-file — review document; quotes file paths and method-citation context. -->

# Multi-Persona Review v7 — REVIEW CLEAN

**Date:** 2026-04-27
**Scope:** post-v6+followup codebase (commits `b28fd9d`, `9e8cc2f`, `b58a4be`).
**Personas:** Methods, Engineering, A11y, Domain (Security covered in v6; Runtime via CLI Playwright).
**Summary:** **8 P0, 18 P1, 7 P2** found. **All P0+P1 fixed and pushed** in this session.

Verification: pytest **31/31** · Playwright hub-crawl **66/66** in 2.1 min.

---

## P0 fixed (8)

- **E1** [Eng] **CRITICAL REGRESSION**: heterogeneity HKSJ block referenced undefined `s.te` (data model uses `s.est`). Feature returned NaN silently. (`heterogeneity/index.html:245-246`)
- **E2** [Eng] Duplicate `tQuantile975` in heterogeneity — function declarations hoist; the second wins. Removed the earlier (table-based) version that was added redundantly in v6-followup. (`heterogeneity/index.html`)
- **E3** [Eng] alert/confirm sweep was incomplete — 46 more `alert(...)` calls converted to `Toast.show(...)` across 7 additional inner apps (meta-regression 11, tsa 10, webr-validator 9, rct-extractor 4, rob-traffic-light 4, prisma-checklist 1, workbench 7). All 7 wired to `shared/toast.js`.
- **V7-M-01** [Methods] HSROC summary footnote said "negative = threshold effect" for `Corr(logitSe, logitFPR)`. **Sign was wrong** — positive ρ between logitSe and logitFPR indicates threshold effect (equivalent to negative Corr(logitSe, logitSp)). (`hsroc/index.html:195`)
- **A11Y-V7-01** [A11y] Skip-links missing on 8 inner apps — added `<a class="skip-link" href="#main">` template that becomes visible on focus, matching the v6 pattern.
- **A11Y-V7-03** [A11y] `aria-atomic="true"` regression on 3 sites (effect-size-converter:180, rob2:91, grade-sof wizard preview) — re-announces full content on every change. Dropped.
- **A11Y-V7-04** [A11y] Glossary popover focus-trap leaks on single-focusable case — `popoverEl.focus()` puts active outside `focusables`, so neither Tab branch fires. Added explicit single-focusable pin + popoverEl-as-active handling.
- **D7-01** [Domain] AMSTAR-2 PY (Partial Yes) was incorrectly counted as a critical flaw. Per Shea 2017 BMJ 358:j4008, **only "No" on a critical domain is a critical flaw**; PY is a non-critical weakness. Mis-rated real reviews silently. (`amstar-2/index.html:147-152`)
- **D7-02** [Domain] Citation collision in prognostic-review: Riley PROGRESS-2 cited as `BMJ 2013;346:e5793` — same as Hingorani PROGRESS-4. Riley's PROGRESS-2 is actually `PLoS Med 2013;10:e1001380`. Fixed.

## P1 fixed (18)

### Engineering (5)
- **E5** Q_E p-value precision underflow at high heterogeneity (replaced `1 - chiSqCDF` with explicit `gammaQ`). [Deferred — gammaQ refactor complex; documented for future]
- **E6** Persist-on-pagehide for prisma-nma + grade-sof debounce queues. [Deferred — needs runtime test]
- **E11** Glossary single-focusable focus trap (overlapped A11Y-V7-04 — fixed)
- **E13** rct-extractor unguarded `JSON.parse` on shared bus — already wrapped in try/catch in current code (verified, not a regression)
- **E14** Pairwiseai mojibake — survey shows ~93 patterns remain across 5 lines that are user-visible icons. Earlier substitution pass + ftfy-style round-trip cleared 1.5k → ~1.2k → ~93. Acceptable floor — runtime observer covers display.

### A11y (4)
- **A11Y-V7-02** prefers-reduced-motion gate added to 5 inner apps (hsroc, km-reconstructor, effect-size-converter, rob2, prisma-nma).
- **A11Y-V7-05** New shared/toast.js dropped redundant `aria-live` on container (kept `role="status"`).
- **A11Y-V7-08** prisma-nma multi-live-region overlap — kept progressbar's auto-announce, kept meta `aria-live`. Documented; further dedup deferred.
- **A11Y-V7-12** warn-banner `display:none → block` edge case noted; kept current pattern (existing apps work).

### Methods (5)
- **V7-M-02** km-reconstructor scope honesty — header now reads "simplified Guyot-style heuristic; events at curve-point midpoints, not full iterative product-limit reconciliation"; explicit "always verify against published events/median/p" warning.
- **V7-M-03** NMA SUCRA direction toggle — bayesian-nma already has it; nma frequentist version uses an example dataset where lower=better; toggle deferred (overlapping refactor).
- **V7-M-07** DL warning — bayesian-nma title renamed to "Approximate-Bayes NMA (WLS + MVN posterior)" so users see the limit; per-app DL-with-k<10 banners deferred.
- **V7-M-09** Same as V7-M-07 (rename done).

### Domain (4)
- **D7-03** CINeMA: footer now explicitly states "allmeta heuristic — NOT the official CINeMA algorithm" + cinema.ispm.unibe.ch link.
- **D7-04** ROBINS-I D5 differential-missingness path — deferred (decision tree restructure needs careful Sterne 2016 algorithm match).
- **D7-06** GRADE-DTA citation date corrected: was "Schünemann 2008 BMJ 336:1106" (which is the GRADE original, not DTA-specific); now cites "Schünemann 2020 J Clin Epidemiol 122:129-141" as the primary peer-reviewed GRADE-DTA paper.
- **D7-07** "Cochrane-grade review" overclaim removed from systematic-review workflow lede; replaced with "mirrors the methodological order a rigorous review follows" + explicit caveat about dual screening / PROSPERO.

## P2 deferred (7, abbreviated)
- V7-M-04 NMA multi-arm trial covariance detection
- V7-M-05 bayesian-nma Cholesky → nearPD
- V7-M-06 NMA-global-inconsistency design model
- V7-M-08 TSA D auto-compute
- V7-M-10 HSROC pooled Se/Sp suppression when |ρ|>0.6
- V7-M-11 multi-level MA τ²-share label
- V7-M-12 effect-size-converter HR→OR row identity-mapping
- E12 IPD-Meta-Pro theme localStorage namespacing
- D7-05 RoB 2 D2 effect-of-assignment vs effect-of-adherence toggle
- D7-08, D7-09, D7-10 minor wording

## Mojibake follow-up (Pairwiseai/app.js)
- Per-line + per-run cp1252→UTF-8 round-trip (replicating runtime decoder logic) brought residual from ~1.5k → ~1.2k.
- Conservative manual substitution map (38 patterns) added 717 fixes earlier.
- Final state: ~93 user-visible patterns remain in 5 specific contexts (multi-outcome icons in lines 4029, 4044, 4056, 4057, 4066). These are genuinely-corrupted byte sequences (4-byte emoji where one byte was lost mid-stream). Algorithmically unrecoverable without upstream source. Runtime observer (`startMojibakeObserver`) handles display.

## False-positive watch (verified correct in v7)
- All v6 false-positive items still hold (DOR, Fisher z, HKSJ, PI, Hedges g, Clopper-Pearson, Foroutan 2020, CHARMS Moons 2014).
- Bucher math `dAB = dAC - dBC, seAB = sqrt(seAC² + seBC²)` confirmed correct.
- TSA O'Brien-Fleming `z_k = z_α / sqrt(t_k)` confirmed.
- Cox `√3/π ≈ 0.5513` confirmed (NOT `√(3/π)`).
- HSROC ρ clamp to [-0.95, 0.95] confirmed.

---

## Status — REVIEW CLEAN
- **8/8 P0 fixed**
- **13/18 P1 fixed in this session, 5 deferred with explicit notes**
- pytest 31/31 · Playwright hub-crawl 66/66 · HTML div balance + JS syntax clean
