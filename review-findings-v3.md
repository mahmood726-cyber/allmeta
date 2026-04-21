# Multi-Persona Review v3 — round 3 surface

**Status:** REVIEW CLEAN (all 5 P0, 18 P1, 15 P2 fixed 2026-04-21).

Tests: 104/104 green (85 Playwright + 15 codemod unit + 4 autostart installer).

**Date:** 2026-04-21
**Scope:** files changed in round-3 polish (commit `41ef1b9` allmeta + `25c3007` rct-extractor-v2)

- C:/Projects/allmeta/shared/localllm.js
- C:/Projects/allmeta/effect-size-converter/index.html
- C:/Projects/allmeta/rct-extractor/index.html
- C:/Projects/allmeta/scripts/add_csp.py
- C:/Projects/allmeta/scripts/svg_innerHTML_codemod.py
- C:/Projects/allmeta/tests/playwright/e2e-extensive.spec.ts
- C:/Projects/rct-extractor-v2/install-autostart.ps1
- C:/Projects/rct-extractor-v2/tests/test_autostart_installer.py

## Summary
5 P0, 18 P1, 15 P2.

Dominant themes:
1. The `NEAR_ZERO` shortcut I added to consensus agreement applies to ratio magnitudes where it should apply only to linear ones — will spuriously agree on near-total-effect HRs (P0).
2. The SVG codemod has no tests and a subtle interleaved-variable skip bug that silently leaves mixed-state output (P0 tooling risk).
3. Bus rows under `scale_family: "ratio"` don't distinguish HR/OR/RR/IRR for the consumer — Cochrane requires these not be pooled together (P0).
4. Light-mode CSS lost the `--err` variables in effect-size-converter — the new error-note variant falls back to unset, inline error messages render invisibly for light-theme users (P1).
5. `#warn-slot` has no `aria-live`, so the new inline error messages I added for the btn-derive replacement aren't announced to screen readers (P1).

---

## P0 — Critical

- **[P0-1] DOM-2 / STAT-4** (Domain + Stats): `NEAR_ZERO=1e-6` "both near zero → agree" branch in `rct-extractor/index.html:320-322` fires on ratio types before the ratio-branch. `HR=1e-7` has ~10⁷-fold protection — the opposite of null. Fix: move the NEAR_ZERO check inside the `else` (linear types) only, OR for ratios test `Math.abs(Math.log(est)) < NEAR_ZERO` (true-null is OR=RR=HR=1, ln=0).

- **[P0-2] DOM-1** (Domain): `scale_family: "ratio"` bus family lumps HR, OR, RR, IRR. Per Cochrane Handbook §10.4 these answer different clinical questions and must not be pooled together without explicit justification. `rct-extractor/index.html:406-407, 450-455, 466-471`. Fix: refuse the push when `new Set(rows.map(r => r.scale)).size > 1` within a ratio family, or require an explicit user confirmation with a recorded target scale.

- **[P0-3] STAT-1** (Stats): In `effect-size-converter/index.html:260` the RR→OR delta-method step computes `seLogOR = se / |1 − p0·RR|`. As `p0·RR → 1` (risk ceiling), SE blows up without a guard and the OR CI becomes meaningless. Fix: add `if (p0 * est >= 0.999) { push point-only row; note "RR·p0 ≈ 1 — OR SE undefined at risk ceiling"; }` before computing `seLogOR`.

- **[P0-4] SE-1** (SE): `scripts/svg_innerHTML_codemod.py` has no test suite. Tool rewrote ~50 HTML files in this session and miscompiled twice (chained `=`, chained `+=`). Fix: add `tests/test_svg_codemod.py` with fixtures covering eligible single-var, chained-assign bailout, chained-`+=` bailout, multiple non-overlapping vars, interleaved vars, early `return`, empty-string reset, multi-line template RHS. Gate `--write` on green tests.

- **[P0-5] SE-2** (SE): The codemod's per-var `overlap` check at `scripts/svg_innerHTML_codemod.py:190` silently skips a variable whose append-range overlaps another's — when vars A and B have interleaved statements, processing order decides which is converted, leaving the skipped one as raw `X.innerHTML +=`. Mixed state with no warning. Fix: if overlap is detected, reject BOTH vars in that function body; log skipped vars to stderr.

## P1 — Important

- **[P1-1] UX-1**: `effect-size-converter/index.html` light-mode `:root` block (lines ~12-16) defines `--err` and `--err-soft` ONLY inside `@media (prefers-color-scheme:dark)` (~22-23). Light users get transparent `.note.err` backgrounds. Fix: add `--err:#912121; --err-soft:#fbd2d2;` to the light `:root`.
- **[P1-2] UX-2**: `#warn-slot` (effect-size-converter:177) has no ARIA. Error messages are silent to AT. Fix: `role="status" aria-live="polite" aria-atomic="true"` on the slot, or promote to `role="alert"` when `kind === "err"`.
- **[P1-3] UX-4**: `drawConfidenceBar` (rct-extractor:355-358) encodes confidence tier only by color. Fails WCAG 1.4.1. Fix: add tier label ("high"/"med"/"low") to the percent text, add `<title>` per `<rect>`, update outer `aria-label` dynamically.
- **[P1-4] UX-5**: `#consensus-wrap` (rct-extractor:126, 336) replaced by innerHTML swap with no live region. Table lacks `<caption>`. Fix: `role="region" aria-live="polite" aria-label="..."` + inline `<caption>`.
- **[P1-5] STAT-2**: `withCI` log-branch regex `/^OR|^RR|^HR/` (effect-size-converter:313) matches `"ORA"`, `"HRZ"`, etc., and does not guard `row.point > 0`. Fix: `/^(OR|RR|HR)(\b|\s|$)/` + `row.point > 0` guard.
- **[P1-6] STAT-3**: `deriveSE` log-scale CI accepts `lo == hi` (effect-size-converter:339-344). Yields SE=0; downstream CIs collapse. Fix: `if (lo === hi) return NaN;` inside `deriveSE` itself (the btn-derive handler check doesn't protect other callers).
- **[P1-7] SEC-5**: `install-autostart.ps1` `-NoStart` mode synthesises `$pythonw = $env:TEMP\pythonw.exe` and still writes a `.lnk`. If an attacker drops that file before login, the shortcut auto-executes. Fix: in `-NoStart` mode, remove the `.lnk` at script end (or don't create it); only create `.lnk` when a real resolvable pythonw was found.
- **[P1-8] SEC-7**: `test_autostart_installer.py` fixture backs up real user `.lnk` into `tmp_path`; if pytest is killed mid-test the real shortcut is gone (backup is inside pytest tmp). Fix: backup to a stable location (`%LOCALAPPDATA%/allmeta-test-backups/`) or use `.pretest-bak` sibling file.
- **[P1-9] SE-3**: `LocalLLM.detect()` — when a caller passes `opts.force:true`, but another in-flight call already populated `_detectPromise`, the force caller gets the cached result. `localllm.js:22-25`. Fix: if `opts.force`, null `_detectPromise` first, OR run a non-cached promise for forced callers.
- **[P1-10] SE-4**: `detect()` 2000ms cache-clear setTimeout races with the 4000ms fetch abort. A pending detect past 2s can be re-entered by a second caller, resulting in two concurrent `/api/tags` requests. Fix: clear the cache in `.finally()` instead of a fixed timer; keep the 2s TTL only on a resolved-result cache.
- **[P1-11] SE-5**: `add_csp.py` uses plain `origin in text` to detect external deps. URLs inside HTML comments land in the CSP. Fix: strip `<!--.*?-->` before scanning, or restrict matches to `href/src/url()/fetch/connect` contexts.
- **[P1-12] SE-6**: `consensusWrap.innerHTML = \`...${rows.map(...).join("")}...\``  (rct-extractor:330-338) is atomic — if any row's getter throws, the whole table disappears silently. Fix: per-row try/catch or DOM construction.
- **[P1-13] SE-7**: `test_autostart_installer.py` races on the real `%APPDATA%/Microsoft/Windows/Start Menu/Programs/Startup` folder under pytest-xdist. Fix: `@pytest.mark.xdist_group("startup_folder")` + `--dist loadgroup`, OR a session-scoped filelock fixture.
- **[P1-14] SE-8**: `effect-size-converter` second `<script>` block — a parse error (as the codemod already caused) silently leaves globals unbound with no visible indicator. Fix: wrap init in try/catch and render the error to a visible banner. Cheap and prevents silently dead pages.
- **[P1-15] DOM-3**: HR→OR approximation warning fires unconditionally (effect-size-converter:297-299). If `p0` is supplied, compute the implied bias and warn only when |bias|/OR > 0.10 (material). Otherwise a neutral note.
- **[P1-16] DOM-4**: IRR→"Cox-ish SMD" (effect-size-converter:301-305) is double-approximation (IRR→OR→SMD) labeled only "caution". Fix: hide SMD row unless user confirms rare events + balanced follow-up; always show ln(IRR). Strengthen note to "valid only if event rate < 10% per arm AND approximately equal follow-up time between arms".
- **[P1-17] DOM-5**: LLM extraction schema (rct-extractor:260-271) lacks 2×2 counts. Without `events_t, events_c, n_t, n_c, follow_up_months`, downstream tools cannot cross-check SE via Woolf/score, apply zero-cell correction, or recompute RR↔OR. Fix: add these as optional nullable fields.
- **[P1-18] DOM-6**: 5%-on-log-scale consensus threshold (rct-extractor:325) is generous for RCT primary endpoints reported to 2 decimals. Fix: tighten to 3% for ratio types; leave 5% for linear.

## P2 — Minor

- **[P2-1] STAT-5**: HR→OR SMD-row note says "same caveat" — make explicit: "valid only for rare events (<10% in both arms) and balanced follow-up".
- **[P2-2] STAT-7**: Playwright test uses bare `1.96` rather than the same `Z95 = 1.959963984540054` the app uses. Safe at precision 3 but would false-fail at precision 5. Fix: reference the same constant.
- **[P2-3] SEC-1**: CSP lacks explicit `frame-src 'none'`, `media-src 'self' blob:`, `manifest-src 'self'`. Stated, not inferred, hardens against future `default-src` relaxation. `scripts/add_csp.py:97-113`.
- **[P2-4] SEC-2**: `.slice(0, 64)` on `modified_at` (`localllm.js:38`) is UTF-16-code-unit based; a surrogate pair could split. Ollama emits ISO timestamps so unreachable in practice. Fix: `Array.from(...).slice(0, 64).join("")` OR whitelist ISO-8601 pattern.
- **[P2-5] SEC-4**: `svg_innerHTML_codemod.py` `rstrip(";")` on comma-expression RHS (`x.innerHTML += a, b;`) becomes `push(a, b)` — pushes 2 items instead of evaluating comma. Rare. Fix: bail on top-level comma detected in RHS.
- **[P2-6] SEC-6**: `install-autostart.ps1:111` quote-guard only checks `"`. Defence-in-depth: extend to backtick, `$(`, `%`, `;` even though WScript.Shell doesn't re-evaluate the argument.
- **[P2-7] SEC-11**: `rct-extractor` `esc(e.source_text).slice(0, 240)` (line ~284) slices AFTER escaping; a truncated HTML entity (`&am`) renders as literal. Fix: slice first, then escape.
- **[P2-8] UX-7**: Forest SVG `viewBox="0 0 600 260"` with `leftPad=160` leaves only ~140px for plot at 320px-wide viewport — labels ~6px rendered. Fix: media-query layout swap below 500px.
- **[P2-9] SE-9**: Codemod emits `const __xParts = [""]` when original reset was `x.innerHTML = ""`. Dead empty string. Fix: if RHS is empty/empty-string, emit `const __xParts = [];`.
- **[P2-10] SE-10**: Mark codemod not-for-reuse in docstring; refuse `--path` outside `ROOT`.
- **[P2-11] SE-11**: `e2e-extensive.spec.ts:215` assertion `expect(finalLbl).toEqual(firstLbl)` on Re-check masks genuine flakiness. Fix: assert `finalLbl` matches `/detected|Not/` only.
- **[P2-12] SE-12**: Installer test only checks `.lnk` existence. Fix: verify `TargetPath` ends in `pythonw.exe` and `Arguments` contains `_autostart_launcher.py` via a tiny PS one-liner.
- **[P2-13] SE-13**: `add_csp.py` `ORIGINS` table hand-maintained; drifts over time. Fix: have the script warn when an `https://...` URL appears in scanned HTML that isn't in `ORIGINS`.
- **[P2-14] DOM-7**: `e2e-extensive.spec.ts` `toBeCloseTo(..., 3)` tolerance is 5e-4. Safe for this exact CI but breaks on 2dp-rounded inputs. Fix: downgrade to 2 or use `toBeLessThan(1e-3)` absolute.
- **[P2-15] DOM-8**: Bus row missing `pool_scale: "log" | "identity"` — consumers currently infer from `scale_family`. Fix: add explicit `pool_scale`.

## False Positive Watch (checked against `lessons.md`, not in report)

- OR→RR delta-method formula `|1 − p₀·RR|·SE(logOR)` is correct — the v1 "fix" was the bug, round 1 restored the right form. Do NOT re-flag.
- Cox constant `√3/π` (not `√(3/π)`) — correct.
- Fisher z variance `1/(n-3)` exact — correct.
- Hedges' J(df) with df=n1+n2-2 — correct per Borenstein ch. 4.
- Meta-tag CSP can't enforce `frame-ancestors` — acknowledged; browsers ignore silently.
- `'unsafe-inline'` is intentional for these single-file apps.

## Non-findings (items I considered and dismissed)

- `localllm.js raw: { models: sanitized }` wrapper is redundant but not a security risk; `digest` is already dropped.
- `page.route` in e2e tests does NOT leak across tests (page-scoped in Playwright).
- `escapeHtml(window.location.origin)` is defence-in-depth only; origin can't contain characters requiring escape.
- `<pre class="localllm-out">` is `role="status"` but not tabbable — not a keyboard trap (pre isn't focusable by default).

---
