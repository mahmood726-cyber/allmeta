# E156-PROTOCOL — allmeta Review Studio (Story mode)

**Project:** allmeta Review Studio — an offline, signed, tamper-evident systematic-review pipeline with a narrative *Story mode* that teaches each synthesis stage by replaying canonical evidence histories.
**Artifact:** `review-project/index.html` (single-file, offline).
**Type:** teaching tool / methods note.
**Primary estimand (reproduced live in-browser):** fixed-effect pooled odds ratio for intravenous magnesium in acute myocardial infarction = **1.03 (95% CI 0.97 to 1.10)** once ISIS-4 joins the seven small trials.
**Dates:** built 2026-06-11.

## E156 body (156-word contract — submit verbatim)

> Can one offline studio make each stage's purpose legible by replaying canonical evidence histories beside the live tools producing them? Three verified datasets are embedded: streptokinase (ten trials) and magnesium (nine trials) for myocardial infarction, plus Turner's antidepressant publication-bias figures. A Story mode weaves a true beat into all nine stages and loads each case's real two-by-two tables onto the shared workspace bus. Loading magnesium reproduces the collapse: a fixed-effect odds ratio of 1.03 (95% CI 0.97 to 1.10) once ISIS-4's 58,050 patients join the seven trials that alone implied halved mortality. Streptokinase reproduces benefit (fixed-effect odds ratio 0.77), every embedded count was checked against primary sources, and the paywalled corticosteroid trials were left unembedded. Because the pooling engine also narrates, learners meet publication bias and specification collapse as movements in a real story, not abstractions. The studio reproduces published syntheses but cannot establish new causal effects and embeds only openly verifiable aggregate counts.

*Validated 154 words / 7 sentences / PASS via `e156/scripts/validate_e156.py`.*

## Reproducibility — the embedded datasets

All per-trial 2×2 mortality counts are loaded on demand from Story mode (▶ Story mode → pick a case → "Load these N real trials onto the workspace"). The loader converts each table to log-OR + SE (0.5 continuity correction only when a cell is zero) and pools via the audited `shared/ma-core.js` (`AlmMaCore.pool`).

| Case | k | Source (verified) | Fixed-effect pooled OR (95% CI) |
|---|---|---|---|
| Streptokinase for AMI | 10 | Lau et al., NEJM 1992 (per-trial via `metadat::dat.lau1992`); GISSI-1 & ISIS-2 from the primary trials | **0.77 (0.72–0.82)** — benefit |
| Magnesium for AMI | 9 | Teo et al., BMJ 1991; LIMIT-2 (Woods), Lancet 1992; ISIS-4, Lancet 1995 (`metadat::dat.egger2001`; the Teo-7 sum-check to 25/657 vs 53/644) | **1.03 (0.97–1.10)** — null with ISIS-4 in |
| Antidepressants (Turner) | — | Turner et al., NEJM 2008 | journal-pooled Hedges g = 0.41 (0.36–0.45) vs FDA-set g = 0.31 (0.27–0.35); narrative only (per-drug g is appendix-only) |
| Antenatal corticosteroids | — | Crowley 1990 / Cochrane CD004454 | per-trial counts paywalled → **not embedded** (no fabricated data); provenance note shown instead |

The streptokinase-vs-magnesium contrast is the teaching core: the same fixed-effect engine yields a clear benefit for one and a null for the other, and the magnesium null appears only once the 58,050-patient ISIS-4 trial joins the seven small trials — the spec-collapse lesson, reproduced live.

## Narrative method (secular use of classical rhetoric)

Story mode borrows classical devices of Arabic / Qur'anic rhetoric **as secular narrative craft, with no scripture quoted** — only the form is used: *qaṣaṣ* (purposeful narration that lands on the method lesson), *iltifāt* (a shift to second person at the turn), a recurring-*fāṣilah* refrain that is deliberately **broken** at the synthesis/robustness reveal (the break is this app's adaptation, not a feature of the sūrah), *mathal* (a concrete image for an abstract statistic), and *ijmāl→tafṣīl* (the pooled magnitude withheld until earned).

## Links

- **Code:** https://github.com/mahmood726-cyber/allmeta
- **Dashboard:** https://mahmood726-cyber.github.io/allmeta/review-project/

## Verification

- Playwright: `tests/playwright/review-project-shell.config.mjs` — 10/10 pass (Story mode, real-trial loader bus-roundtrip, JASP pane, evidence map).
- `scripts/lint_repo.py` + `scripts/drift_sweep.py` green; inline script parse-checked.
- All trial counts verified against PubMed / primary sources; none estimated.

## Authorship (per workbook rule)

Student rewriter = first author; supervising faculty = last/senior author; Mahmood Ahmad = middle author only (Conceptualization, Methodology, Software, Data curation). Target: *Synthēsis* — Methods Note. Manuscript CC-BY-4.0; code MIT.
