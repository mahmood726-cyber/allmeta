# Handoff — continue in a new session

**Repo/branch:** worktree `C:\Projects\glp1-doseresp-nma`, branch `glp1-obesity-doseresp-nma`, remote
`github.com/mahmood726-cyber/allmeta` (dedicated branch; do NOT merge to master without review). All work
lives in `glp1-obesity-mbnma/`. Data policy: AACT + PubMed abstracts + authoritative reference
distributions only; no IPD, no full text. rapidmeta repos untouched.

## Current state (complete + verified)
Registry-native synthesis → HTA → 6 wide-gap methods → GRADE/CINeMA guideline scaffold → exact joint-
posterior contrast → certainty league table → decision-sensitivity → external validation (**n=7** published
NMAs/guidelines concordant) → 2 portfolio-method integrations (Benford integrity, entropy-balancing
transport) → **5-class generality** (incretin/PCSK9/SGLT2/psoriasis/asthma = continuous-weight / continuous-
LDL / hard-outcome-HR / binary-responder / count-rate-IRR), with **PCSK9 promoted to full depth** (league +
GRADE + transport + offline dashboard) and **complementary methods** (UBCMA + GRMA, `COMPLEMENTARY_METHODS.md`).
One-command reproducible (`python run_all.py`), **39-test** self-verifying. Key docs: `PAPER.md`, `GUIDELINE_SUPPORT.md`, `WIDE_GAP_METHODS.md`, `GENERALITY_MATRIX.md`.

## Remaining frontiers (pick up here)
1. ~~**5th outcome type** — count/rate (exacerbation rate-ratio, IRR-NMA)~~ **DONE** (`class5_asthma/`):
   asthma anti-eosinophil/anti-TSLP biologics, annualised-exacerbation IRR. All 4 agents significantly reduce
   the rate (class IRR 0.70); engine flags the raw cross-agent ranking as baseline-rate/eosinophil effect
   modification (I²=96%), not a clean winner. Pinned by `test_generality_class5_asthma_rate`. Next count/rate
   extension if wanted: registry-ipd KM reconstruction on a class that *does* post KM curves.
2. ~~**Promote one class to the full 40-stage pipeline** — PCSK9~~ **DONE (all 4 named depth stages)**:
   - **league + GRADE** — `class2_pcsk9/pcsk9_league.py` → `pcsk9_league.json`: full pairwise LDL league with
     per-comparison GRADE/CINeMA certainty, *same* domains as `nma_league.py` (6 Moderate / 6 Low / 12 comps,
     bococizumab lead, no k=1). Pinned by `test_pcsk9_league_depth`.
   - **transport** — `pcsk9_transport.py` → `pcsk9_transport.json`: % LDL → absolute mg/dL & mmol/L in a real
     NHANES elevated-LDL US target (baseline 132 mg/dL; bococizumab −2.61 → inclisiran −1.99 mmol/L), *same*
     NHANES reference source as the incretin transport. Pinned by `test_pcsk9_transport_depth`. (Transport is
     of the LDL **surrogate**, explicitly NOT a CV claim.)
   - **dashboard** — `pcsk9_dashboard.py` → `pcsk9_dashboard.html`: single-file, fully-offline render of
     league + GRADE + transport. Pinned by `test_pcsk9_dashboard_offline`.
   Honest bounds: PCSK9 league uses the frequentist normal contrast (no Bayesian draw matrix for this class);
   transport assumes the % reduction is approximately population-transportable (carried modifier = target
   baseline LDL, not the %). Suite now **37 green**. Next depth idea if wanted: promote a *second* class, or
   give PCSK9 a Bayesian draw matrix for CrI-based contrasts.
3. **Data-policy-blocked methods (activate only if scope changes):** quantile MA (`ipd-qma`, needs IPD);
   umbrella CCA (`umbrellareview`, needs each review's included-study list) — would let the concordance
   battery test whether the 7 validators are *independent* or recycle trials.
4. ~~**Complementary methods (optional):** UBCMA + grey-relational MA~~ **DONE** (see
   `COMPLEMENTARY_METHODS.md`), both on the semaglutide-2.4mg node, both honest sensitivity/corroboration
   pairs (headline ranking unchanged):
   - **UBCMA** (`ubcma_reporting_bias.py` → `ubcma_reporting_bias.json`) = inferential pair to the
     ghost-measurement. Fit blind to the ghosts on the visible 13, infers μ 11.30 (vs DL 11.60) — a downward
     correction in the *same direction* the ghosts directly reveal. Pinned by
     `test_ubcma_reporting_bias_inferential_pair`. Deterministic (`restart_seed`); imports the portfolio
     package via `sys.path` to `C:/Projects/ubcma/src`.
   - **GRMA** (`grma_robust_pool.py` → `grma_robust_pool.json`) = robust-pooling sensitivity. μ 11.27 vs IV
     11.47 (Δ −0.20) → robust to the pooling rule. Pinned by `test_grma_robust_pool_sensitivity`. Faithful
     **Python port** of `C:/Projects/grma/grma_meta.R` (R unavailable; NOT in metafor so no 1e-6 cross-check —
     stated openly). Dissonance Field Synthesis kept OUT of the guideline layer (novel/unvalidated).
   Suite now **39 green**.

## Honesty guardrails to carry forward
- Decision-support scaffold, NOT a guideline; judgement domains (RoB/values) stay with the human panel.
- No CV-benefit claim from weight loss (not a validated surrogate). k=1 apex agents = INSUFFICIENT.
- Classes 3–5 are *core repoints*, not full pipelines — state that (PCSK9/class 2 is the full-depth
  exception). Concordance is logic-level (abstracts). Complementary methods (UBCMA/GRMA) are sensitivity
  pairs, not headline claims; GRMA has no metafor cross-check (not in metafor).
- Run `python run_all.py` (self-verifies) before citing any headline number; update `tests/baselines.json`
  only with a recorded reason.
