# Proportion validation

Tier 1 recomputes the current parsed rows, transform (PLO/PFT/PR) and estimator (PM/DL/FE) in the page and in same-origin webR 0.5.5 with pinned metafor 4.8-0. The paper used metafor 5.2-1; both versions are shown. All sixteen pooled fields are compared: mean, SE, tau2, Q, df, Q-based I2, k, transformed CI/PI, pooled proportion and back-transformed CI/PI. Boundary correction, harmonic-mean PFT inverse and t_(k-1) PI including FE match reference.R. Closed-form relative tolerance is 1e-9; PM-dependent fields use 1e-6. No external package download or CSP relaxation is used.

Tier 2 retains the full reference (about 7.2 MB) and corpus (about 0.26 MB), including every study. MANIFEST.json records exact bytes, original-source hashes and LF corpus hashes; `**/validate/corpus/*.json text eol=lf` pins git-stored bytes. The adapter embeds the same hashes. It reruns all 2160 configurations through the actual page computation and DOM: 298116 checks comprising status, sixteen pooled fields, every yi/vi, study proportion/Clopper-Pearson limits/percentage weight, and four UI checks. There are 198 matched k<2 refusals. No subset or archived app values are substituted. Reference fields outside that contract (metafor default I2/H2/Qp/PI) remain preserved but are not compared.

Read-only page observation hooks capture actual computed locals without changing numerical formulas. Validation calls suppress URL writes at the page's write site, avoid reset/undo snapshots and restore inputs, internal results and result DOM in finally. Replay never rewrites URL/history, including on failure. Warm replay uses verified memory offline; file URLs use the shared file picker. Changed bytes fail closed.

Tests: validate-proportion-ma.spec.mjs and proportion cases in validate-integration.spec.mjs. They cover the full count, exact navigation/result restoration, built-in live R, all nine transform/estimator combinations on boundary inputs, absent PI with two rows, insufficient rows, tampering with either file, same-origin requests, warm offline replay and file-picker replay. The dedicated Playwright config serves only on 127.0.0.1:8000.

| Item | Static or dynamic | Source |
|---|---|---|
| Inputs, R results, expected count, tolerances | Static archived evidence/protocol | codex10 corpus/reference and compare.py |
| App values, per-study checks, rendered checks, differences | Dynamic | Current page computation and actual DOM |
| Live R fits and versions | Dynamic | Same-origin pinned webR session |
| Hashes | Dynamic integrity records | Exact UTF-8 LF corpus bytes |

The future proportion-reproducible link points to one-command instructions, not a hosted Actions run. No publication or deployment is claimed.
