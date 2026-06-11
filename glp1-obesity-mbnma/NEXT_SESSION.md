# Handoff — continue in a new session

**Repo/branch:** worktree `C:\Projects\glp1-doseresp-nma`, branch `glp1-obesity-doseresp-nma`, remote
`github.com/mahmood726-cyber/allmeta` (dedicated branch; do NOT merge to master without review). All work
lives in `glp1-obesity-mbnma/`. Data policy: AACT + PubMed abstracts + authoritative reference
distributions only; no IPD, no full text. rapidmeta repos untouched.

## Current state (complete + verified)
Registry-native synthesis → HTA → 6 wide-gap methods → GRADE/CINeMA guideline scaffold → exact joint-
posterior contrast → certainty league table → decision-sensitivity → external validation (**n=7** published
NMAs/guidelines concordant) → 2 portfolio-method integrations (Benford integrity, entropy-balancing
transport) → **4-class generality** (incretin/PCSK9/SGLT2/psoriasis = continuous-weight / continuous-LDL /
hard-outcome-HR / binary-responder). One-command reproducible (`python run_all.py`), **33-test** self-
verifying. Key docs: `PAPER.md`, `GUIDELINE_SUPPORT.md`, `WIDE_GAP_METHODS.md`, `GENERALITY_MATRIX.md`.

## Remaining frontiers (pick up here)
1. **5th outcome type** — count/rate (e.g., exacerbation rate-ratio, IRR-NMA) or activate registry-ipd KM
   reconstruction on a class that *does* post KM curves (incretin CVOTs don't; find one that does).
2. **Promote one class to the full 40-stage pipeline** — e.g., PCSK9: transport (LDL to a target lipid
   population) + league + GRADE + dashboard, not just the core repoint. Proves full-depth generality.
3. **Data-policy-blocked methods (activate only if scope changes):** quantile MA (`ipd-qma`, needs IPD);
   umbrella CCA (`umbrellareview`, needs each review's included-study list) — would let the concordance
   battery test whether the 7 validators are *independent* or recycle trials.
4. **Complementary methods (optional):** UBCMA (`ubcma`) as the inferential pair to the ghost-measurement;
   grey relational MA (`grma`) as a robust-pooling sensitivity check. (Dissonance Field Synthesis: keep OUT
   of the guideline layer — novel/unvalidated.)

## Honesty guardrails to carry forward
- Decision-support scaffold, NOT a guideline; judgement domains (RoB/values) stay with the human panel.
- No CV-benefit claim from weight loss (not a validated surrogate). k=1 apex agents = INSUFFICIENT.
- Classes 2–4 are *core repoints*, not full pipelines — state that. Concordance is logic-level (abstracts).
- Run `python run_all.py` (self-verifies) before citing any headline number; update `tests/baselines.json`
  only with a recorded reason.
