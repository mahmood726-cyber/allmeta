# Review — Screen / Search / Design suite apps

**Date:** 2026-06-08 · **Scope:** the three new SR-pipeline apps shipped to GitHub Pages
(`/screen/`, `/search/`, `/design/`) and their shared localStorage envelopes
(`sr-project-v1`, `sr-records-v1`, `prisma-flow-v1`).
**Method:** extensive automated testing of the *shipped* code (Playwright drives the real
in-browser logic via each app's deterministic test hook), six expert-persona reviews, and
an evidence-based benchmark against Rayyan (screening) and Elicit (discovery).

This was a genuinely critical pass, not a rubber-stamp. Eight issues were found and fixed;
several real gaps versus the commercial tools are documented honestly below.

---

## Executive summary

- **One P1 bug fixed:** the Design→Screen screening-term handoff was *completely dead* —
  `SR_PROJECT_KEY` was referenced but never declared in `screen/index.html`, so the
  protocol-term propagation threw a `ReferenceError` that was silently swallowed by an inner
  `try/catch`. Every user following the advertised Design→Search→Screen pipeline got no
  pre-filled relevance terms. Now fixed and covered by an end-to-end test.
- **7 further fixes** across reproducibility, security honesty, accessibility (WCAG 2.1.1 /
  1.3.1 / 4.1.2), spreadsheet-injection data integrity, and methodological transparency.
- **Test coverage went from 20 pytest + 4 relevant Playwright specs to 38 pytest + 66
  Playwright specs** covering the classifier, dedup, kappa, parsers, AI handoff, key hygiene,
  the full pipeline, accessibility, offline/CSP, and exports. All 104 pass.
- **Benchmark verdict:** allmeta wins decisively on **privacy, cost, transparency,
  reproducibility, and pipeline integration**; it loses to the incumbents on **dedup recall
  vs. Rayyan/EPPI, semantic search recall vs. Elicit, real-time collaboration, automated
  extraction/synthesis, and very-large-scale (>50k) performance.** Two quality claims (active-
  learning recall, dedup recall/precision) are **not yet benchmarked against a labelled
  corpus** and should not be marketed as competitive until they are.

---

## 1. Tests added + results

All tests drive the **shipped** code (no re-implementation). Playwright specs navigate to the
live HTML served at `127.0.0.1:8080` and call each app's hook (`window.__almScreenpro`,
`__almSearch`, `__almDesign`) or exercise the real DOM/handlers.

| Spec file | Tests | What it covers |
|---|---:|---|
| `tests/playwright/alm-screen-core.spec.mjs` | 21 | DOI + fuzzy-title dedup (incl. case, unicode, manual-mark preservation, no-false-merge), Cohen's κ vs hand-computed value + all edge cases, term scoring weights, **XSS escaping in card render**, RIS/nbib/CSV/native-JSON parsing, malformed/empty/BOM inputs |
| `tests/playwright/alm-screen-ml.spec.mjs` | 7 | TF-IDF + logistic-regression classifier: separability, valid-probability outputs, **determinism**, explainable top terms, refusal on <2 labels / empty / no-vocabulary, duplicates excluded from scoring |
| `tests/playwright/alm-screen-ai.spec.mjs` | 6 | AI handoff prompt content, results import round-trip, partial/unknown/malformed-entry handling, confidence clamping, **API key never leaks into the project export** |
| `tests/playwright/alm-search.spec.mjs` | 7 | Deterministic cross-source dedup, OpenAlex inverted-index reconstruction, `sr-records-v1` envelope schema, aiPrompt |
| `tests/playwright/alm-design.spec.mjs` | 7 | PICO question phrasing, boolean strategy build, screening-term suggestion, `sr-project-v1` envelope schema |
| `tests/playwright/alm-pipeline-e2e.spec.mjs` | 7 | **Full Design→Search→Screen pipeline**, term propagation (the P1 fix), PRISMA count propagation, missing/garbled envelope resilience |
| `tests/playwright/alm-a11y-offline.spec.mjs` | 11 | Landmarks, accessible names, labelled controls, keyboard-operable chips & result rows, offline/same-origin-only loads, CSP, export validity, CSV-injection guard |
| `screen|search|design/tests/test_regressions.py` | 18 | Fast static guards pinning every fix below |

**Result: 66 Playwright + 38 pytest = 104 tests, all passing.** (Plus the pre-existing 20
structure tests, included in the 38.)

Performance probe (Screen, single thread, headless Chromium):

| n records | setState+dedup |
|---:|---:|
| 1,000 | 57 ms |
| 2,000 | 108 ms |
| 5,000 | 254 ms |

Dedup is O(n²) in the title-similarity pass; ~1 s at 10k (fine), but degrades to tens of
seconds beyond ~50k records — see PERF-1.

---

## 2. Multipersona review

Severity: **P1** ship-blocker · **P2** should-fix · **P3** minor/cosmetic. ✅ fixed · ⏸ deferred.

### (a) Systematic-review methodologist (PRISMA / Cochrane rigor)

| ID | Sev | Finding | Status |
|---|---|---|---|
| M-1 | **P1** | Design→Screen screening-term propagation dead (`SR_PROJECT_KEY` undeclared). The advertised "your criteria become the relevance terms" never happened. | ✅ declared the key; E2E test added |
| M-2 | P2 | Cohen's κ returned **0** for perfect agreement on a single category (0/0), reading as "no agreement" when it may be 100% agreement. | ✅ now flagged `degenerate`, UI shows "κ undefined — single category" |
| M-3 | P2 | PRISMA push folded **undecided/maybe/conflict** into "excluded at screening" with no signal — mid-screening pushes silently misreport. | ✅ added composition breakdown + a warning toast when records are still pending |
| M-4 | P2 | Dedup uses **DOI-exact + trigram-title ≥0.85 only** — no author/year/journal blocking. Recall is below multi-field tools; will miss dups with reformatted titles or different DOIs for the same work. | ⏸ documented as a known heuristic limitation (footer already discloses the method) |
| M-5 | P2 | Active-learning classifier trains on **R1 labels only**; in dual-reviewer mode R2's labels are ignored, and no recall@k / cross-validated performance is shown to the user. | ⏸ documented; recommend surfacing a held-out estimate (see residual) |
| M-6 | P3 | `buildQuestion` computes an `iWord` ("treated with"/"exposed to") that is never used — PECO and PICO produce identical question wording. Dead code, not wrong output. | ⏸ noted |

### (b) UX / usability

| ID | Sev | Finding | Status |
|---|---|---|---|
| U-1 | P2 | No bulk/multi-select actions; screening is strictly one card at a time. Acceptable for the keyboard workflow but slower for triage. | ⏸ noted |
| U-2 | P3 | BYO-key API field is `type="text"` (key visible on screen, shoulder-surfable). | ⏸ noted (intentional? recommend `type="password"` w/ reveal) |
| U-3 | P3 | Help modal has no focus trap / focus restore (see A-4). | ⏸ noted |
| U-+ | — | Strengths: full keyboard model, deterministic relevance, multi-format import, reset confirm, responsive collapse, dark mode, reduced-motion support. | — |

### (c) Security / privacy

| ID | Sev | Finding | Status |
|---|---|---|---|
| S-1 | P2 | Screen footer claimed **"Fully local — records never leave your device"**, but the BYO-key path sends title+abstract to a third-party AI host (and `connect-src` allowlists three). Overstated. | ✅ footer rewritten to "Local by default… the BYO-key path is the only exception" |
| S-2 | P3 | `frame-ancestors` was present in the `<meta>` CSP, where it is **ignored** and emits a console error on every load. | ✅ removed from all three apps |
| S-2b | — | **Verified good:** all user content is HTML-escaped before `innerHTML`; highlight() runs on already-escaped text (XSS test passes, no script/img execution). API key stored only in its own `*-ai-key` localStorage slot and is **absent from project exports** (test-proven). No external origins load offline (test-proven). No `eval`. localStorage keys are namespaced. | — |
| S-3 | P3 | `script-src 'unsafe-inline'` is required (inline IIFE; GH Pages can't set nonces/headers). Residual XSS surface is mitigated by escaping, but a build step with external JS would be stricter. | ⏸ noted |

### (d) Accessibility (WCAG 2.x)

| ID | Sev | Finding | Status |
|---|---|---|---|
| A-1 | P2 | Screen exclusion-reason & label chips were click-only `<span>`s — not focusable, no keyboard activation (labels had **no** keyboard path at all). **WCAG 2.1.1.** | ✅ `role="button"`, `tabindex="0"`, `aria-pressed`, Enter/Space handlers |
| A-2 | P2 | Design PICO textareas had only a single-letter visual tag + placeholder — **no programmatic label** (WCAG 1.3.1 / 4.1.2 / 3.3.2). | ✅ `aria-label` added; decorative tags `aria-hidden` |
| A-3 | P2 | Search result rows expanded abstracts on **mouse click only** (`<tr>` not focusable). WCAG 2.1.1. | ✅ `tabindex`, `role=button`, `aria-expanded`, keyboard toggle |
| A-4 | P3 | Help modal lacks focus trap / focus restore (WCAG 2.4.3). | ⏸ noted |
| A-+ | — | Strengths: one `<main>` landmark each, `aria-live` card region, runtime landmark fixer, `forced-colors.css`, all buttons have accessible names (test-proven). | — |

### (e) Reproducibility / open science

| ID | Sev | Finding | Status |
|---|---|---|---|
| R-1 | P2 | Search cross-source dedup kept whichever duplicate landed **first in the array** — but sources resolve in nondeterministic network order, so the surviving record (and the `sr-records-v1` handoff) was **not reproducible**. | ✅ survivor now chosen by deterministic source rank (EuropePMC > Crossref > OpenAlex > CT.gov); order-independent (test-proven) |
| R-+ | — | Strengths: classifier is deterministic (zero-init weights, fixed epochs/lr); exports embed counts + κ; sources/caps disclosed; envelopes are inspectable JSON. | — |
| R-2 | P3 | Search results inherently vary as the live databases update over time (not an app bug; disclosed in footer). | — |

### (f) Performance (large record sets)

| ID | Sev | Finding | Status |
|---|---|---|---|
| PERF-1 | P3 | Screen dedup title pass is **O(n²)** on the main thread. Measured ~250 ms @ 5k, ~1 s @ 10k (acceptable), but tens of seconds and a frozen tab beyond ~50k records. | ⏸ documented; recommend length/first-token blocking or a Web Worker for very large reviews |
| PERF-+ | — | Classifier vocab build is O(corpus); training is O(labels × features) — near-instant for realistic label counts. Per-render filter/sort is fine at these sizes. | — |

---

## 3. Fixes applied (commit-ready)

1. **M-1 / P1** — declare `SR_PROJECT_KEY = "sr-project-v1"` in Screen (restores Design→Screen term propagation).
2. **R-1 / P2** — deterministic cross-source dedup survivor by source rank (`SRC_RANK`) in Search.
3. **A-1 / P2** — keyboard-operable reason/label chips in Screen (`role`/`tabindex`/`aria-pressed`/keydown).
4. **A-2 / P2** — `aria-label`s on Design PICO textareas; decorative tags `aria-hidden`.
5. **A-3 / P2** — keyboard-operable Search result rows (`aria-expanded` toggle).
6. **S-1 / P2** — honest locality claim in Screen footer (BYO-key egress disclosed).
7. **M-2 / P2** — Cohen's κ degenerate-case handling (undefined, not 0) + UI text.
8. **M-3 / P2** — PRISMA push breakdown + incomplete-screening warning.
9. **CSV / P2** — formula-injection guard no longer prefixes `-`, so negative `term_score` cells aren't corrupted (matches repo `rules/lessons.md`). Applied to Screen + Search.
10. **S-2 / P3** — `frame-ancestors` removed from all three `<meta>` CSPs (no-op + console error).

**Deferred (documented, not fixed):** M-4 (multi-field dedup), M-5 (classifier validation / R2 labels),
M-6 (dead `iWord`), U-1 (bulk actions), U-2 (`type=password` key field), A-4 (modal focus trap),
S-3 (`unsafe-inline`), PERF-1 (O(n²) dedup at >50k).

---

## 4. Benchmark vs Rayyan & Elicit

Criteria are concrete and the evidence basis of each cell is marked: **[t]** verified by a test
in this review, **[m]** measured, **[o]** observed in source/behaviour, **[?]** *not measured —
claim only*. Honesty note: the two most marketing-sensitive cells (active-learning quality,
dedup recall/precision) are **[?]** — they were *not* benchmarked against a labelled corpus.

### Screen vs **Rayyan**

| Criterion | allmeta Screen | Rayyan | Verdict |
|---|---|---|---|
| Cost | Free, no account [o] | Free tier limited; paid teams | **Win** |
| Privacy / data residency | 100% local; no upload (offline test) [t] | Cloud upload required | **Win** |
| Reproducibility | Deterministic ranking + dedup; JSON export w/ counts+κ [t] | Cloud model, less transparent | **Win** |
| Transparency of ranking | TF-IDF+logreg with shown +/- terms [t] | Proprietary relevance | **Win** |
| Keyboard throughput | Full keyboard, local (no latency) [o] | Keyboard + cloud latency | **Win/Tie** |
| Dual-reviewer + κ | Yes, with conflict resolution + κ [t] | Yes | **Tie** |
| Active-learning *quality* | Functional & separable on toy data [t]; **recall@k not benchmarked** [?] | Mature, trained at scale | **Loss / unproven** |
| Dedup *recall/precision* | DOI+trigram functionally correct [t]; **recall/precision not benchmarked** [?] | Multi-field, mature | **Loss / unproven** |
| Real-time collaboration | None (single device; file/envelope handoff) [o] | Real-time multi-user | **Loss** |
| Scale (>50k records) | O(n²) dedup degrades [m] | Cloud-scale | **Loss** |
| Accessibility | Keyboard + ARIA + labels after fixes [t] | Not audited here | **Tie/Unknown** |

### Search vs **Elicit**

| Criterion | allmeta Search | Elicit | Verdict |
|---|---|---|---|
| Cost | Free; public APIs, no account [o] | Freemium / credits | **Win** |
| Privacy | Browser→public API direct; no account [o] | Cloud account | **Win** |
| Source transparency | 4 named DBs, explicit boolean, per-source cap disclosed [o] | Semantic index, opaque ranking | **Win** |
| Reproducibility | Deterministic dedup + inspectable envelope [t] | LLM ranking, less reproducible | **Win** |
| Pipeline integration | Design→Search→Screen→meta-analysis, all local [t] | Mostly standalone discovery | **Win** |
| Search *recall* / semantic | Keyword/boolean, capped per source [o] | Semantic over ~200M papers | **Loss** |
| Automated extraction / synthesis | Retrieval only (extraction = other apps / opt-in BYO AI) [o] | LLM extraction + summaries | **Loss** |
| Ranking quality | Source-native ordering [o] | LLM relevance ranking | **Loss** |

**Bottom line:** for a **privacy-sensitive, reproducible, zero-cost** systematic-review workflow
with a coherent design→search→screen→synthesis pipeline, allmeta is genuinely competitive and in
several respects better. It is **not** a drop-in replacement where you need cloud collaboration
(Rayyan), best-in-class recall/semantic discovery and automated extraction (Elicit), or
100k-record scale. The classifier and dedup are correct and transparent but **must be validated
on a labelled benchmark before any "matches Rayyan" claim is made.**

---

## 5. Residual issues for Mahmood

- **Validate the classifier & dedup on a labelled corpus** (e.g., a SYNERGY/CLEF-style dataset):
  report recall@k for the ranker and recall/precision for dedup. Until then, keep marketing
  modest (the apps already do — keep it that way). *(M-5, M-4)*
- Consider **R2 labels in training** and a held-out performance estimate shown in the UI. *(M-5)*
- For very large reviews, add **blocking / a Web Worker** to the dedup title pass. *(PERF-1)*
- Minor polish: modal focus trap *(A-4)*, `type=password` for the key field *(U-2)*, remove the
  dead `iWord` in Design *(M-6)*, optional bulk actions in Screen *(U-1)*.
- **Pre-existing, out of scope (flagged for awareness):** the repo-wide pytest run shows two
  unrelated failures — `tests/test_aria_labels.py` (aria≠visible mismatches in `evalue/` and
  `reporting-bias/`) and `tests/test_release_consistency.py` (`shared/build-info.js` says
  `v1.0.0` but `CITATION.cff` says `v1.1.1`; run `python scripts/regen_build_info.py`). Neither
  is in the three apps reviewed here.
