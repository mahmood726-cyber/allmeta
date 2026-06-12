# Handoff — current state

**Repo/branch:** worktree `C:\Projects\glp1-doseresp-nma`, branch `glp1-obesity-doseresp-nma`, remote
`github.com/mahmood726-cyber/allmeta` (dedicated branch; do NOT merge to master without review). All work lives
in `glp1-obesity-mbnma/`. Data policy: AACT + PubMed abstracts + authoritative reference distributions only; no
IPD, no full text. rapidmeta repos untouched.

## What this repo IS (read `SPEC.md`)
A **GLP-1/GIP obesity dose-response network meta-analysis** — primary estimand = **% change in body weight** vs
placebo, modelled as a dose-response surface per agent in one connected network, registry-native from AACT. That
is the project. The flagship lives at the repo root (`nma_league.py`, `incretin_obesity_dashboard.html`,
`PAPER.md`, `fit_network.py`, the workstream_*.py files) and has its own adversarial review in `PANEL_REVIEW.md`
(verdict: honest, reproducible, sound engineering — not a clinical/statistical breakthrough).

## Scope cleanup (2026-06-12)
The repo had accreted "generality repoints" — the engine repointed onto other drug classes to argue it is
reusable. Two rounds of cleanup refocused it:
- **DTA class removed** — a cancer-imaging diagnostic-accuracy class (`class7_dta`) was off-topic AND a
  poorly-scoped keyword dragnet. Reverted; the adversarial verdict is kept as `DTA_CLASS_REVERTED.md`.
- **Immunology repoints removed** — psoriasis / asthma / RA (`class4`/`class5`/`class6`) were technically sound
  but off-topic for an obesity project (dermatology/respiratory/rheumatology). Removed along with the orphaned
  shared binary harvester `rm_harvest_binary.py`.

**What remains:** the obesity flagship + the **two cardiometabolic siblings** that GLP-1 agents directly affect
and that sit in obesity's metabolic neighbourhood:
- `class2_pcsk9` — PCSK9 inhibitors, continuous %LDL. League (freq + Bayesian), transport (%→mmol/L in a NHANES
  target), dashboard, RapidMeta conversion. Surrogate test returns the VALIDATED direction (vs weight's failure)
  — the discrimination proof.
- `class3_sglt2` — SGLT2 inhibitors, survival HF-hospitalisation HR. Bayesian single-endpoint league (resolves
  the I²=87% composite artifact), transport (HR→ARR/NNT), dashboard, RapidMeta conversion. canagliflozin lead,
  ertugliflozin k=1 → INSUFFICIENT.

Both are wired into `run_all.py` (stages C2*, C3*), pinned by the suite, and concordant with a PubMed-verified
published NMA (`class_concordance.py` → 2/2; Jiang 2025 PCSK9, Tsapas 2020 SGLT2). Docs: `GENERALITY_MATRIX.md`,
`COMPARISON_PUBLISHED_CLASSES.md`, `RAPIDMETA_CONVERSION.md` all reflect the 2-class scope.

## State
- **Suite: 49 green** (`python -m pytest -q`). One-command reproducible: `python run_all.py` (self-verifies;
  slow stages hit AACT + NUTS, fast stages read cached JSON).
- Run `python run_all.py` before citing any headline number; update `tests/baselines.json` only with a recorded
  reason.

## Honesty guardrails to carry forward
- This is an obesity NMA decision-support scaffold, NOT a guideline; RoB/values judgement stays with the panel.
- No CV-benefit claim from weight loss (not a validated surrogate). k=1 nodes = INSUFFICIENT.
- The two kept generality classes are demonstration-grade cardiometabolic cross-checks, not full systematic
  reviews; concordance is logic-level (abstracts).
- **Scope discipline (the lesson of the DTA + immunology removals):** new "generality" repoints that wander away
  from GLP-1/obesity are scope creep. If a repoint is proposed, it must (a) be metabolically adjacent and (b)
  search AACT by drug name, not outcome keyword (the dragnet that sank DTA).
