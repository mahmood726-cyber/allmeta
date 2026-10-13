# MH/Peto validation

Tier 1 reruns the page parser/render path using the current textarea and selected OR/RR/RD, then fits the same data in same-origin webR 0.5.5 / SHA-256-pinned metafor 4.8-0. Paper version 5.2-1 is displayed. MH uses add=c(.5,0), to=c("only0","none"), drop00=c(FALSE,FALSE), correct=FALSE; Peto OR uses add=0, to="none", drop00=TRUE. Estimate, confidence limits, z, p and recovered beta/SE are compared at relative 1e-9 (p absolute). No heterogeneity/test quantities absent from the page are invented.

Tier 2 repeats bench/compare.py's complete primary contract: 68,461 checks. Current page values are recomputed for pooled/per-study quantities, rounded tables, fragility FI/FQ/DL baseline, L'Abbe and single-row refusal/clear behavior. R references and independent greedy oracle records are replayed from the supplied final codex11 run; R itself and its ancillary oracle self-checks are not rerun in Tier 2. No saved app output substitutes for current computations.

Corpus JSON uses UTF-8 without BOM and LF bytes, pinned in MANIFEST.json and adapter.js. The repository rule **/validate/corpus/*.json text eol=lf preserves those git-stored bytes. Missing or altered bytes refuse validation. Relative difference is abs(App-R)/max(1,abs(R)); p absolute; rounded UI uses 0.0005000001, z 0.0050000001. Null matches null only.

Replay suppresses URL writes throughout, disables input controls, and restores pending inputs, prior rendered panels, exported result, L'Abbe global, writer function and controls in finally. History is never repaired afterward because no history entry may be written. HTTP preparation caches verified records for offline replay; file URLs support selection of all three corpus files. Tests audit same-origin requests, full replay, unchanged location/history, complete restoration, modified-byte refusal, built-in live OR/RR/RD and edited input.

| Item | Static / dynamic | Evidence |
|---|---|---|
| Corpus / R oracle | Static recorded source | MANIFEST SHA-256 |
| Tolerances / expected count | Static contract | historical compare.py |
| App values / differences / verdicts | Dynamic | current page code |
| Live R values / versions | Dynamic | actual local webR session |

Final-page tail regression guard: in addition to the unchanged 68,461 primary checks, every pooled R p-value below 1e-12 is checked with abs(App-R)/abs(R) <= 1e-9. If R underflows to zero, only an app zero matches. Supplemental checks are reported separately; the original primary denominator is unchanged. The final page uses direct normal upper-tail probabilities. Browser Tier 2, bench/compare.py and validate.R enforce this guard. outputs/tail_checks.json and outputs/validate_R_tails.csv record Python and recomputed-R evidence.
