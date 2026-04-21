# Multi-Persona Review v2 — allmeta Local-AI + RCT-Extractor surface

**Date:** 2026-04-21
**Scope:** new/changed files since review v1: `shared/localllm.js`, `local-ai/index.html`, `rct-extractor/index.html`, `pico/index.html` (LLM integration), `effect-size-converter/index.html` (LLM integration), `tests/playwright/e2e-local.spec.ts`, and the `rct-extractor-v2` autostart scripts.

## Summary

Security: 1 P0, 6 P1, 6 P2
UX/a11y: 3 P0, 9 P1, 3 P2
Software engineering: 3 P0, 7 P1, 3 P2
Domain expert: 3 P0, 7 P1, 5 P2 (incl. **one regression from review v1 "fix"**)

## P0 — critical

- **DOM-REG-1** (Domain F7): **Prior OR→RR delta-method "fix" is mathematically wrong.** Correct derivative is `(1−p₀·RR) = (1−p₀)/(1−p₀+p₀·OR)`. My v1 change to `((1−p₀)/(1−p₀·RR))·se` inserts a spurious factor and understates SE by ~20% at p₀=0.20. **Revert to the original `|1 − p₀·RR|·se`.**
- **SEC-1** (Security F1): `rct-extractor/index.html` — the API URL input is unvalidated. User text is POSTed to whatever URL is in the field, which can be changed to an external host. Enforce loopback-only.
- **UX-1/2/3** (UX F1-F3): status pills in `rct-extractor`, `local-ai`, and the shared LLM panel update without `aria-live` — screen readers miss state changes.
- **SE-1** (SE P0-1): no `AbortController` / timeout on any fetch — stalled connection hangs the UI forever.
- **SE-2** (SE P0-2): `LocalLLM._cachedModels` is a shared singleton with concurrent-access races across tabs.
- **SE-3** (SE P0-3): `localStorage` `ma-studies-v1` read-modify-write is non-atomic — concurrent tabs lose writes.
- **DOM-1** (Domain F1): bus push log-transforms anything with `effect_type` matching `/HR|OR|RR|IRR/`, but if the regex mislabels an RD/SMD as an RR, a linear-scale value is silently log-transformed. Add effect-type guard + reject on incoherent scales.
- **DOM-2** (Domain F3): HR→OR "approx" row always emits without event-rate context — needs inline per-row warning.

## P1 — important

- **SEC-2**: PDF.js from CDN without SRI. Self-host or pin with SRI.
- **SEC-3**: `ma-studies-v1` bus accepts raw `JSON.parse` — add array+object shape guard.
- **SEC-4**: `svg.innerHTML +=` accumulation O(n²) in the consensus/forest/wheel plots.
- **SEC-5**: install-autostart.ps1 `.lnk` arguments without quote-injection guard when install path contains quotes.
- **SEC-6**: double-quoted PS here-string `@"..."@` expands `$` — fragile template.
- **SEC-7**: port-8000 kill in installer is not user-scoped.
- **UX-4**: LLM model `<select>` has no unique `id` for `<label>` pairing.
- **UX-5**: PDF upload hint not associated via `aria-describedby`.
- **UX-6**: `#status-card` color-only indicator; no `role="status"`.
- **UX-7/15**: no skip-links on `/local-ai/`, `/rct-extractor/`, `/pico/`.
- **UX-8**: `<details>` panel focus not managed on open.
- **UX-9**: `use-llm` checkbox touch target below 44×44.
- **UX-10**: effect-size-converter dark mode missing `--err/--err-soft` variables.
- **UX-11/12**: `.pill` contrast white-on-accent ~2.8:1 in dark mode; `.localllm-status` hardcoded light colours.
- **SE-4**: PDF.js runs all pages on main thread with no page cap.
- **SE-5**: duplicate `escapeHtml`/`esc` defs — factor through `LocalLLM.escapeHtml`.
- **SE-6**: local-ai page duplicates the `/api/tags` fetch after `detect()` already cached it.
- **SE-7**: autostart installer rewrites `_autostart_launcher.py` unconditionally — blows away user edits.
- **SE-8**: uninstall deletes checked-in `_autostart_launcher.py`.
- **SE-9**: `probeAPI` not debounced / no AbortController — compounds with SEC-1.
- **DOM-4**: consensus 5% threshold is scale-mixed. Apply tolerance on log scale for ratios, absolute for linear.
- **DOM-5**: Hedges' g correction defined but never applied.
- **DOM-6**: PICO `S`-then-`T` priority silently drops `T` field.
- **DOM-8**: bus rows all labelled `study: "imported"` — no trial identifier or timestamp.
- **DOM-9**: `IRR` extracts can reach the converter but have no conversion path.
- **DOM-10**: LLM extraction schema has no `se` field — CI-derived SE is forced even when paper reports SE directly.

## P2 — polish

- SEC-10: no CSP on any page.
- SEC-11: Ollama `modified_at` field not length-bounded.
- SEC-12: LLM-supplied CI bounds bypass numeric guards (`Infinity` accepted).
- SEC-13: e2e test uses `any` for model items.
- SE-10: log-scale `Math.log` on negative bounds silently NaN-drops rows.
- SE-11: consensus threshold near-zero misclass.
- SE-12: `btn-derive.click()` silent cascade.
- Test-gap-a: PDF upload path not tested.
- Test-gap-b: bus push handlers not tested.
- Test-gap-c: effect-size LLM round-trip field population not tested.
- Test-gap-d: Re-check button on `/local-ai/` not tested.
- Test-gap-e: extractor error path (422) not tested.
- Test-gap-f: autostart installer round-trip not tested.

---

## Fix plan

Round 1 — critical correctness + security (DOM-REG-1, SEC-1, UX-1/2/3). [DONE commit de37d8a]
Round 2 — robustness (SE-1/2/3, DOM-1/2). [DONE commit 2f97cd2]
Round 3 — P2 polish + test gaps. [DONE — CSP on 80+ pages, PDF.js self-hosted,
  svg.innerHTML codemod on 34 files (47 functions), modified_at bound,
  typed e2e models, log-scale negative-bound guard + inline error message,
  near-zero consensus tolerance, 422 test path, autostart installer pytest
  round-trip (-NoStart flag)]. Tests: 86/86 green (65 hub + 11 e2e-extensive +
  6 e2e-local + 4 installer).

REVIEW CLEAN.

---
