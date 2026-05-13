# p-curve — Cycle 2.5 retrofit audit

**Date:** 2026-05-13
**Auditor:** Cycle 2.5 implementer subagent
**Method:** full source read (251-line single-file app) + grep

| Dim | Verdict | Evidence |
|---|---|---|
| CSV upload | absent | Data entry is textarea-only (`id="src"`, raw p-values one per line). No file input, no `csv-upload.js` script tag, no `#alm-csv-mount` div. Wire `csv-upload.js` with columns `study`, `p`. |
| Chart download | absent | The p-curve histogram is an inline SVG rendered via `svg.innerHTML`. No download buttons. `chart-download.js` deferred — do-no-harm rule prevents replacing the working inline renderer. |
| Axis controls | absent | No x-axis range inputs. Plot domain is hard-coded to 5 p-value bins. Wire `axis-controls.js` (UI only; domain override deferred, matching influence precedent). |
| Results export | absent | No export of any kind. Wire `results-export.js`. |
| URL state | absent | No `location.hash`, `URLSearchParams`, `pushState`, or `replaceState`. Wire `url-state.js`. |
| Reset/undo | absent | No reset or undo. Wire `reset-undo.js`. |
| Tooltips | absent | No `tooltips.js`, no `data-gloss` attributes. Footer has plain text only. Wire `tooltips.js` and add `<abbr data-gloss>` in footer. |

## Modules to wire in (all absent)

- `csv-upload.js` — textarea-only data entry; no file input
- `axis-controls.js` — hard-coded domain; no axis range controls
- `results-export.js` — no export of computed results
- `url-state.js` — no shareable URL or persistence
- `reset-undo.js` — no reset or undo workflow
- `tooltips.js` — no glossary tooltips; footer is plain text

## Modules to skip

- `chart-download.js` — SVG histogram rendered inline (`svg.innerHTML`); deferred to future cycle per do-no-harm rule.

## R-parity (pcurve-tiny.csv, Fisher combined on pp = p/0.05)

Captured from `pcurve-tiny.R` run 2026-05-13 against 5 studies (p: 0.003, 0.012, 0.021, 0.038, 0.047):

- `fisher_chisq` = 10.88867977905
- `fisher_df`    = 10
- `fisher_p`     = 0.3662564540401
- `prop_low`     = 0.6
- `z_flat`       = 0.4472135955
- `p_flat`       = 0.6547208460186
- `k`            = 5

The app's JS engine computes the identical Fisher statistic (`-2 * Σ ln(p/0.05) ~ χ²(2k)`) and binomial flatness test. R-parity confirmed to 1e-6.
