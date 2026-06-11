# Wide-gap methods: what registry + PubMed abstracts let clinicians do that ordinary meta-analysis cannot

The gap is widest where **structured registry data carries information that published effect sizes throw
away**: arm-level structure, full adverse-event tables, baseline covariate distributions, multiple
timepoints, eligibility criteria, the *known denominator of unpublished trials*, and the trial pipeline.
Each method below is tied to a **patient/clinician question**, the **registry field that uniquely enables
it**, and a **validated method + portfolio engine**. Status = what is actually demonstrated here.

---

### 1. Component NMA — receptor decomposition   ✅ DEMONSTRATED (validated vs `netmeta::discomb`, 1e-9)
- **Patient/clinician question:** *Which receptor drives the weight loss, and what would a new combination
  do before anyone trials it?*
- **Registry-unique enabler:** arm-level intervention structure + known pharmacology of each agent.
- **Method/engine:** additive contrast CNMA (Welton 2009 / Rücker 2020); `allmeta/component-nma` (oracle
  fixture). `cnma_incretin.py` (parity PASS to 1e-9).
- **Result:** GLP-1 +13.1 / GIP +4.8 / glucagon +5.6 pp; triple agonism sub-additive (pred 23.5 vs obs
  21.4); predicts an un-trialled GIP+glucagon agent ~10.4 pp.
- **Why ordinary MA can't:** it pools each drug as a black box — no mechanism, no extrapolation to
  un-trialled combinations. *(Caveat: common-component-across-molecules is approximate; Q=20.3/df=4.)*

### 2. Surrogate-endpoint validation (trial-level)   ★ PROPOSED — highest patient value
- **Patient question:** *Does the weight I lose on this drug actually mean fewer heart attacks / longer
  life — or am I just chasing a number on the scale?*
- **Registry-unique enabler:** the registry captures **both** the surrogate (weight) **and** the final
  outcome (MACE/CV-death HR) across the *same drug class* — an obesity-scoped literature MA never has the
  CV outcomes in frame.
- **Method/engine:** meta-analytic surrogacy (Buyse 2000; Daniels–Hughes 1997) — trial-level R²
  (proportion of CV benefit explained by weight benefit) + surrogate threshold effect (STE). R `surrogate`.
- **Why ordinary MA can't:** the surrogate and the hard outcome live in different literatures; only a
  registry-native class-wide assembly pairs them. *Needs the full incretin class weight+CV pairs
  (liraglutide/LEADER, dulaglutide/REWIND, semaglutide/SELECT, tirzepatide/SURPASS-CVOT, exenatide/EXSCEL,
  lixisenatide/ELIXA, …), k≈8–9 — feasible registry-natively; a bounded next build.*

### 3. Multivariate / joint efficacy + safety NMA   ◑ AVAILABLE (engine + AE data in hand)
- **Patient question:** *Show me the benefit and the harms together — for the side-effect I care about
  most.*
- **Registry-unique enabler:** AACT `reported_events` — the **full structured MedDRA AE table per arm**,
  which abstracts rarely report jointly.
- **Method/engine:** multivariate MA borrowing strength across correlated outcomes (Achana; `mvmeta`);
  `allmeta/multivariate-ma`, `HTA/jointModel.js`. We already harvested nausea; the same path gives a
  coherent benefit–risk surface rather than separate one-outcome pools.

### 4. Registry-aware publication-bias / selection model   ◑ PARTIALLY DONE
- **Clinician question:** *Is the published effect inflated by trials I can't see?*
- **Registry-unique enabler:** the unpublished trials are **observed entities** (NCT IDs, posted-but-
  unpublished results) — the missing-data mechanism is partly *seen*, not assumed.
- **Method/engine:** Copas selection model (`allmeta/copas`) **informed by the observed ghosts** — we
  detected 6 and pooled the posted ones (3.2 pp lower, bias direction confirmed).
- **Why ordinary MA can't:** funnel/Egger/standard Copas infer bias from asymmetry of the *published* set;
  they cannot pool a posted-but-unpublished result or count the dark trials. The registry can.

### 5. Trial Sequential Analysis + living synthesis with the ONGOING pipeline   ◑ AVAILABLE
- **Clinician question:** *Is the evidence conclusive yet, or should I wait — and is more research even
  needed?*
- **Registry-unique enabler:** recruiting/active trial records → a **prospective** information fraction
  (including trials not yet reported), plus auto-refresh as results post.
- **Method/engine:** TSA (Wetterslev; O'Brien–Fleming α-spending — see advanced-stats.md TSA rules);
  `allmeta/tsa`, `sequential-ma`, `living-meta`, `HTA/livingHTA.js`.
- **Why ordinary MA can't:** it is retrospective on the published record; it cannot see the pipeline or
  size the remaining information.

### 6. Dose–time-response (longitudinal trajectory)   ◑ PARTIALLY (dose done; time arm available)
- **Patient question:** *How fast does it work, when does it plateau, and what's the maintenance dose?*
- **Registry-unique enabler:** multiple structured timepoints per arm in `outcome_measurements`.
- **Method/engine:** model-based longitudinal MBNMA (Pedder); `allmeta/dose-response-ma`.
- **Why ordinary MA can't:** it collapses each trial to one chosen landmark, discarding the trajectory.

---

## The thesis (where the gap is widest)
Ordinary meta-analysis is a function of **published aggregate effect sizes**. Five of these six methods
need information that is *structurally absent* from that input — receptor structure (1), the hard-outcome
pairing (2), the joint AE table (3), the unpublished denominator (4), the live pipeline (5), the trajectory
(6). Registry + abstracts don't just *speed up* the same meta-analysis; they enable analyses the ordinary
input **cannot represent at all**. That is the wide gap, and it is mechanistic, prognostic, and safety
information patients and clinicians actually ask for.

## Recommended next build
**Surrogate-endpoint validation (#2)** — it answers the single most patient-relevant question (does weight
loss buy hard-outcome benefit), it is the widest structural gap (two literatures the registry uniquely
joins), it is a validated method, and it ties this project's continuous arm to its survival arm into one
clinically decisive statement. Honest bound: drug-level k≈8–9, so report trial-level R² with a wide CI and
treat as hypothesis-strength, not proof.
