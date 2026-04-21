# Stress-test defect list — 2026-04-21

Automated UI smoke + integration audit of the meta-analysis stack.
Scope answered by user: "Integration + UI smoke" (~2-3h budget).

## Coverage

| Surface | Tool | Result |
|---|---|---|
| `allmeta/` (63 apps) | Playwright `hub-crawl.spec.ts` | 63 pass, **1 fail** |
| External (3 apps) | Playwright `external-crawl.spec.ts` | 3 pass, 0 fail |
| `e156-student-starter` v0.4.0-rc1 | pytest + pester | 254 + 10 pass, **0 fail** (CI green) |
| Static audit: dead onclick handlers | `dead-handler-audit.mjs` | **15 files affected, 144 dead handlers** |
| Static audit: XSS-sink heuristic | `xss-sink-audit.mjs` | 84 files have unguarded innerHTML, 1588 sinks (most use DOMPurify or numeric data) |

---

## P0 — load-blocking failure

### NMA Pro v8 — page never reaches networkidle

- File: `nma-pro-v2/nma-pro-v8.0.html`
- Symptom: `page.goto: Timeout 15000ms exceeded` waiting for `networkidle`
- Test duration: 35.2s (default 15s + retry)
- Likely cause: a polling fetch, animation loop, or CDN script that never settles
- Impact: app appears to load but the harness can't detect "ready" — students may see partial UI or hangs
- Trace: `tests/playwright/test-results/hub-crawl-NMA-Pro-v8-chromium/trace.zip`

---

## P1 — dead onclick handlers (visible breakage on click)

15 files contain `onclick="someFn(...)"` where `someFn` is **never defined** in
the file or as a `window.X = ...` assignment. Clicking these buttons throws
`ReferenceError` in the browser. Playwright's `pass` status missed them
because the harness loads the page and looks for plots — it does not click
every button.

### Top 5 by dead-handler count (ranked, fix in order)

| File | Dead handlers | Notes |
|---|---|---|
| `IPD-Meta-Pro/dev/modules/01_body_html.html` | **42** | Likely a code-split partial — verify whether handlers are in a sibling JS file before fixing |
| `Truthcert1/TruthCert-PairwisePro-v1.0-production.html` | **33** | **THIS IS THE SHIPPED PAIRWISEPRO.** Includes `exportToR`, `exportVerdictJSON`, `exportHTACertificate`, `runFullAnalysis`, `saveProject`, `computeDDMA`, `computeHeterogeneity`, `computeBias`, `loadMultiOutcomeDemo`. Export buttons in the UI throw on click. |
| `Pairwiseai/TruthCert-PairwisePro-v1.0-fast.html` | 33 | Same handlers as production — the two copies share the bug |
| `Pairwiseai/TruthCert-PairwisePro-v1.0-{bundle,dist,min}.html` | 5 each | Variant copies; fewer dead handlers because some functions are bundled in |
| `dosehtml/archive/dose-response-pro-v1{3,4,5,6}-*.html` | 1-2 each | Archive copies; safe to ignore unless you ship them |

Full list: `tests/playwright/artifacts/dead-handlers.json`.

**Recommendation for PairwisePro:** the export buttons (CSV / R / YAML / JSON / Excel /
HTA Certificate / PDF) are the integration hook the user mentioned ("could
even be directly linked, especially pairwisepro"). They cannot be the
handoff into `e156-student-starter` until they're implemented. Either:
1. Implement the missing export functions (the JSON one is the obvious
   integration target — would feed into `student new --from pairwisepro.json`).
2. Or remove the buttons that don't work, so users don't get silent breakage.

---

## P2 — XSS-sink heuristic (review-only, no confirmed exploit)

1,588 `innerHTML=`/`document.write()` assignments across 84 files where the
right-hand side is not a string literal. **Most are safe** because the data
being interpolated is numeric (Cohen's d, p-values, etc.) or DOMPurify-
sanitised (IPD-Meta-Pro, which explicitly calls `dompurify.sanitize()`).
But the count tracks the surface area a rogue sanitizer or future user-input
pipe would expose.

### Files where the count alone warrants a 5-min audit

| File | Count | Why review |
|---|---|---|
| `nma-pro-v2/nma-pro-v8.0.html` | 142 | Same file as the P0 timeout — heavy DOM mutation in a long-loading page |
| `TruthCert-PairwisePro-v1.0-{dist,min,bundle}.html` | 134/134/133 | Pairwise variants with no DOMPurify import visible |

Full list: `tests/playwright/artifacts/xss-sinks.json`.

---

## P3 — Pages-deployment hygiene

This pass did NOT re-audit GitHub Pages 404s (covered separately in
`MEMORY.md → reference_portfolio_pages_status` — last audit 2026-04-18 found
135 repos still need `index.html` or removal). Re-running that audit is a
separate task, not in the agreed UI-smoke scope.

---

## Integration: PairwisePro → e156-student-starter

User asked whether PairwisePro could be **directly linked** to
e156-student-starter. The findings:

| Question | Answer |
|---|---|
| Does PairwisePro export JSON? | **Button exists, function does not.** `onclick="exportVerdictJSON()"` is wired but `exportVerdictJSON` is not defined anywhere in the file. Same for YAML and Excel. |
| Does it export R script? | Same — `onclick="exportToR()"` exists, function does not. |
| Does it export CSV? | Button has `id="exportCsvBtn"` but no addEventListener call exists for that ID. Likely also broken. |
| Could `student new` accept a PairwisePro handoff? | Not yet — no input format exists. The handoff schema needs to be defined first (PairwisePro must define its JSON shape, then `student new --from <json>` can be added). |

**Decision needed (user-facing):** which export do you want to make the
canonical handoff? JSON is the lightest; a defined schema (cohort name,
effect estimates with CIs, heterogeneity stats, bias verdict) would let
e156-student-starter pre-populate a Methods Note. This is a v0.5 feature,
not a v0.4 fix.

---

## Things tested clean

| Surface | Notes |
|---|---|
| `e156-student-starter` v0.4.0-rc1 (CI) | release.yml job: success on commit `d0581fd` |
| Mirror download path | install.ps1 prefers mirror; pester contract tests cover retry + SHA |
| Cloud-credential isolation | `test_secrets_isolation` confirms no module-level constants |
| `rct-extractor-v2/index.html` | Loads clean, 0 console errors |
| `Finrenone/index.html` (rapidmeta hub) | Loads clean, 0 console errors |
| `MetaExtract/index.html` | Loads clean, 0 console errors |
| 62 of 63 allmeta apps | Pass UI-smoke + plot detection |

---

## What this audit did NOT cover (out of scope this run)

These are valid follow-ups but were not in the agreed "Integration + UI
smoke" scope:

1. Numerical validation against R metafor (would catch DOR/SROC/Fisher-z
   defects from `lessons.md`). Roughly +4-5h. Re-scope and re-run if you
   want this layer.
2. Click-through of every button per app (would catch all dead handlers
   from the runtime side, not just static analysis). The static audit is
   faster and covers more.
3. Real CSV upload per tool (caught nothing in static; would catch parse
   bugs and edge cases like UTF-8 BOM).
4. Pages-404 re-audit.
5. Cross-tool data flow (PairwisePro → IPD-Meta-Pro → e156).

---

## Prioritised fix order

1. **P0** Fix NMA Pro v8 networkidle hang. One file, blocks the harness.
2. **P1** Implement or remove PairwisePro's 33 dead onclick handlers.
   Without these, the integration handoff to e156-student-starter is
   blocked. Match handler list to function definitions and either implement
   each or delete the button.
3. **P1** Same audit on IPD-Meta-Pro — verify the 42 handlers in
   `dev/modules/01_body_html.html` are not hidden in a sibling JS file
   before treating as a real defect.
4. **P2** XSS-sink narrowing: filter `xss-sinks.json` to files that DON'T
   import DOMPurify. That's the 5-minute risk-narrowing pass.
5. **v0.5 design** Define the PairwisePro → e156-student-starter handoff
   JSON schema before re-scoping the integration task.
