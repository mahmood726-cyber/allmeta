# HTA as the integrator — bringing every analysis together (defensible + cutting-edge)

## The question
"Can HTA bring all our analyses together, and what advanced statistics unify them?" — using the
portfolio's existing, validated assets, under the standing data policy (AACT / CT.gov / PubMed abstracts
+ authoritative reference distributions; worktree-only; no rapidmeta-repo edits).

## Why HTA is the natural integrator
Everything we built is an **input to a single reimbursement/coverage decision**:

| Our analysis | What it produces | HTA decision role |
|---|---|---|
| Dose-response MBNMA (continuous) | transported weight-loss effect + CrI | effectiveness input |
| Survival NMA (registry-ipd harvest) | cardiometabolic HR by agent | long-term outcome / Markov transition |
| Benefit–risk (AACT reported_events) | nausea / AE rates | disutility / discontinuation input |
| Transportability (Bayesian NMR) | effect in the **target jurisdiction's** population | the population the payer actually covers |
| Completeness (ghosts, INSPECT-SR) | evidence base + trustworthiness | certainty / bias adjustment |

HTA is where these stop being five separate numbers and become **one decision metric with quantified
uncertainty**. The decision layer is the unification.

## Portfolio reuse (NOT rebuilt)
- **`allmeta/HTA`** — validated 41-engine HTA platform (benchmarked vs TreeAge). Directly relevant engines:
  `networkMCDA.js`, `mcda.js` (multi-criteria value), `evppi.js` / `evsi.js` (Value of Information),
  `correlatedPSA.js` / `psa.js` (uncertainty propagation), `markovCohort` / `partitionedSurvival` /
  `decisionTree` (cost-effectiveness), `distributionalCEA.js` (equity), `thresholdAnalysis.js`.
- **`hta-transportability`** — R engine pulling CT.gov + NHANES/WHO/IDF target populations (the same
  approach as our `pymc_transport_v2`); maps trial vs target covariates to a transportability adjustment.
- **`rapidmeta-kit`** — `cinema-certainty.js`, `grade-nma-comparison.js`, `contribution-matrix.js` feed
  the certainty layer that an HTA dossier requires.

The new work here is **wiring our registry-native posteriors into that decision layer**, not new engines.

## The unifying advanced statistics
Two complementary unifiers, chosen because they are **defensible (ISPOR / NICE-DSU standard) yet
register as cutting-edge when driven end-to-end from a registry-native NMA posterior**:

### 1. Network MCDA — combines all outcomes, no cost data needed  ✅ proof-of-concept built
`hta_mcda.py` fuses the **transported** efficacy + CV HR + nausea per agent into one value score with
Monte-Carlo uncertainty from our actual posteriors (ISPOR MCDA good-practice; partial value functions +
elicited weights). This is the integrator we can run **fully within the data policy** — MCDA needs only
our own outcomes, no external cost/utility inputs.

Result (base weights efficacy .45 / CV .35 / safety .20):
```
tirzepatide  value 0.764 (0.489–0.829)  P(best) 0.92   [17.5pp / HR 0.62 / 22% nausea]
semaglutide  value 0.582 (0.525–0.636)  P(best) 0.08   [14.6pp / HR 0.81 / 16% nausea]
efficacy+safety only (no posted CV outcome): retatrutide 0.46, mazdutide 0.39, orforglipron 0.29
```
The MCDA flips the naive picture: retatrutide/mazdutide *lead on weight* but score lower here **because
the registry holds no CV-outcome evidence for them yet** — an honest data gap surfaced by the integrator,
not a verdict that they are worse.

### 2. Value of Information (EVPPI direction) — which uncertainty drives the decision  ✅ proxy shown
The VOI proxy in `hta_mcda.py` resolves each criterion's uncertainty in turn and reads the change in
P(best):
```
resolve CV       uncertainty -> P(tirzepatide best) 0.92 -> 1.00  (Δ +0.08)   <-- decision driver
resolve efficacy uncertainty -> 0.92 -> 0.92  (Δ 0)
resolve safety   uncertainty -> 0.92 -> 0.92  (Δ 0)
```
**The decision hinges on the cardiovascular evidence, not the weight-loss gap.** That is the single most
useful output of the whole program for a payer: more research on incretin CV outcomes (the under-posted,
KM-gap stratum from the survival arm) is where the value of information sits. Full EVPPI/EVSI in monetary
units is `allmeta/HTA`'s `evppi.js` / `evsi.js` (Strong–Oakley GAM / Heath regression) — the proxy here
gives the same direction registry-natively.

### 3. (Boundary, honest) Full cost-effectiveness — needs external data, not faked
ICER / net-monetary-benefit / CEAC require **drug price + health-state utilities (QALYs)**, which are
**not in AACT/CT.gov/PubMed** and are explicitly outside the data policy. The wiring is specified —
our transported efficacy + survival HR are exactly the effectiveness inputs a `markovCohort` /
`partitionedSurvival` run consumes — but we **do not fabricate cost/utility values**. This is the
correct defensible boundary: MCDA + VOI we deliver registry-natively; CEA is a one-config step in the
validated engine once a jurisdiction's price/utility inputs are supplied.

## The end-to-end pipeline (registry → decision)
```
AACT ─┬─ MBNMA (weight) ──┐
      ├─ survival NMA (HR)─┤
      ├─ benefit-risk ─────┼─► transport to target population ─► Network MCDA ─► decision value + P(best)
      └─ completeness ─────┘   (pymc_transport_v2 / hta-transp.)        └─► VOI (EVPPI dir.) ─► where research is worth most
                                                                         └─► [CEA via allmeta/HTA when price/utility supplied]
```
This is the novel, defensible contribution: a **registry-native NMA posterior driven all the way to a
transported, multi-criteria coverage decision with value-of-information** — every prior analysis is a
named input, no step fabricated, the cost layer honestly deferred to external data.

## Honest scope
- Built & run here: `hta_mcda.py` (network MCDA + VOI proxy) on our real posteriors → `hta_mcda.json`.
- Reused (not rebuilt): `allmeta/HTA` engines, `hta-transportability`, `rapidmeta-kit` certainty modules.
- Deferred, not faked: monetary CEA/ICER/QALY (needs external price+utility; outside data policy).
- Limitation: MCDA weights and value-function ranges are illustrative base-cases (ISPOR requires elicited
  weights from the actual decision-maker); the integrator's *machinery* and *uncertainty propagation* are
  the contribution, not the specific weights. Agents lacking posted CV outcomes are scored on a reduced
  criterion set — flagged, not penalised as a clinical judgement.
