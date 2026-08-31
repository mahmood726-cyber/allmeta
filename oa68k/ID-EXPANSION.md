# ID frame widened to 24 topics — inputs and prediction, frozen before the run

**Criteria unchanged**, frozen at `fe1f2fd`. `opencomp.py` is imported byte-for-byte and its
sha256 is recorded in the frame provenance. **Nothing was retuned for the new specialty or
for the new target.**

---

## ⛔ The seeding defect: not present in this builder, and checked rather than assumed

A defect was reported in which `search_topic` seeds the intervention from **the title's
first word** — so `iv-iron-hf` searched a *route* and `sglt2-hf` searched a *protein*,
returning 16,917 plausible-looking hits.

**That is a different instrument.** In this builder the seed is `TOPICS[t]["iv"]` and
`["pop"]` — hand-written frozen term lists committed before any run. `title` appears in
`opencomp.py` only inside the design gates that judge a **comparator's** title, never in
seed construction. The hit counts separate the two tools directly: **the reported seed
returned 16,917 for `sglt2-hf`; this frame's seed returned 460.**

⚠️ **The warning still lands, in a weaker but real form.** My seeds are hand-written, so
they cannot pick up a route by accident — but they can still be *wrong by omission*, and
nothing in the frame would flag that. **So the seed is now printed beside every topic before
any count exists**, because a plausible number is the dangerous case and a reader must see
*what* was searched, not only how much came back.

### Seed table — cardiology and the first ID frame, seed beside hit count

| specialty | topic | hits | seed (intervention terms) |
|---|---|---|---|
| cardio | `sglt2-hf` | 460 | sglt2 · sodium-glucose · dapagliflozin · empagliflozin · canagliflozin · ertugliflozin · sotagliflozin |
| cardio | `alirocumab-lipid` | 152 | alirocumab · PCSK9 |
| cardio | `arni-hfref` | 123 | sacubitril · LCZ696 · neprilysin · ARNI |
| cardio | `iv-iron-hf` | 82 | ferric carboxymaltose · ferric derisomaltose · iron isomaltoside · intravenous iron · ferric |
| cardio | `sotagliflozin-hf` | 54 | sotagliflozin |
| cardio | `bococizumab-lipid-review` | 6 | bococizumab |
| ID | `covid19-vaccines` | 233 | Gam-COVID-Vac · Sputnik · CVnCoV · CoronaVac · inactivated vaccine · COVID-19 vaccine |
| ID | `malaria-act-review` | 141 | artemisinin · artemether · lumefantrine · artesunate · amodiaquine · dihydroartemisinin · piperaquine |
| ID | `hepatitis-b-taf-tdf-review` | 56 | tenofovir alafenamide · TAF · tenofovir disoproxil |
| ID | `covid-oral-antivirals` | 48 | molnupiravir · nirmatrelvir · PF-07321332 · Paxlovid |
| ID | `mdr-tb-shortened` | 47 | bedaquiline · pretomanid · linezolid · BPaL |
| ID | `prevnar15-pneumo` | 42 | V114 · 15-valent pneumococcal · PCV15 · Prevnar 13 · PCV13 |
| ID | `rotavirus-vaccine-africa-review` | 38 | Rotarix · RotaTeq · Rotasiil · rotavirus vaccine |
| ID | `agyw-hiv-prep-review` | 18 | dapivirine · vaginal ring |
| ID | `cab-prep-hiv-review` | 14 | cabotegravir · long-acting injectable |
| ID | `malaria-vaccines` | 13 | RTS,S · RTSS · Mosquirix · R21 · Matrix-M · malaria vaccine |
| ID | `nirsevimab-infant-rsv-review` | 10 | nirsevimab |
| ID | `menacwy-booster` | 4 | MenACWY · MenACYW · meningococcal conjugate |

⭐ **`malaria-vaccines` returning 13 while `covid19-vaccines` returns 233 is exactly the
kind of thing the seed column exists to make inspectable** — the first seed is
drug-specific, the second contains the phrase "COVID-19 vaccine".

## The twelve topics added, k ≥ 2 throughout

`anidulafungin-candida` (3) · `raltegravir-hiv` (3) · `bezlotoxumab-cdi` (2) ·
`cvncov-covid19` (2) · `delamanid-tb` (2) · `doravirine-hiv` (2) · `drotrecogin-sepsis` (2) ·
`influenza-recombinant` (2) · `lenacapavir-hiv` (2) · `lenacapavir-prep` (2) ·
`rifapentine-tb` (2) · `sarilumab-covid` (2)

**Excluded by name** so the widening cannot smuggle in near-duplicates:
`hiv-prep-injectable-review` (its own title says *DUPLICATE PAGE*), `malaria-vaccine`
(near-duplicate of `malaria-vaccines`, larger kept),
`menacyw-healthy-volunteers-auto-full-review` (near-duplicate of `menacwy-booster`).

⚠️ **Shared registration, recorded not hidden:** `cvncov-covid19` and `covid19-vaccines`
both hold `NCT04652102`. Legitimate — one is the single-vaccine question inside the other —
but a comparator may be proposed for both, so **they are not two independent demonstrations
on that trial.**

⛔ The module asserts `k ≥ 2` for every topic and reports the **size** of each set, because
`all([])` is `True` and a vacuous set passes silently otherwise.

---

## ⭐ Prediction, on the record, before the widened frame runs

**Predicting LOW, explicitly**, because fourteen projections in a row have over-estimated,
including mine tonight: cardiology predicted 9 → got 22 (too low), ID predicted 18 → got 1
(18× too high).

> **I expect the widening to add 2 eligible comparators — ID total 3, combined 15
> comparators / 6 independent topics. Plausible range 0–5.**
>
> Candidates: I expect **+300 to +450**, taking the ID candidate pool to roughly 1,000 and
> the combined pool to roughly 1,800.

**Why so low.** The two constraints that produced 1-from-664 are *worse* in the added set,
not better: **ten of the twelve new topics are k = 2**, and `≥2 AND ≥50%` means a k = 2
topic demands **both** our trials — 100% overlap. And every ID topic matches on **NCT
identifiers alone**, because our trial names are descriptive and the SSOT holds no PMIDs;
23 of 61 examined in the first ID frame recovered no registry identifier at all.

**Direction of the miss: too HIGH again.** Several added topics (`drotrecogin-sepsis`,
`doravirine-hiv`, `bezlotoxumab-cdi`, `cvncov-covid19`) are niche enough that a
PROSPERO-registered, open-access, enumerating meta-analysis containing *both* their trials
may simply not exist.

⛔ **A zero measures the instrument until proven otherwise** — settled by hand-running one
known-good example, not by inspecting the frame that produced it.

---

## ⛔ On "at least 300" — the unit decides everything, and the arithmetic is already known

Stated now so it cannot be reverse-engineered later:

| reading of "300" | where we stand |
|---|---|
| **candidate meta-analyses screened** | cardiology 802 + ID 664 = **1,466 already**, before this widening |
| **eligible comparators** | **13** (12 cardiology + 1 ID). 300 is more than 20× away |
| **our reviews / independent topics** | **5** demonstrated; 30 topics will exist after this run |

⇒ **Under the candidates reading we passed 300 long ago. Under the comparators reading, 300
is not reachable on these criteria from this corpus** — and I would rather say that now than
produce a padded number later. ⭐ **`candidates → verified → judged` is reported at every
stage and never padded to a target.**

---

## Delegation note — a measured limit on where this can run

⛔ **Codex cannot build this frame.** Its sandbox blocks sockets — measured twice tonight,
`WinError 10013` on twelve consecutive fetch attempts — and this job is entirely network
bound (PubMed E-utilities, Europe PMC). It also cannot write outside its own tree, so
results come back on stdout.

⭐ **The split that works, and the one I am using:** Codex takes the large *offline* jobs —
it enumerated all 155 topic objects in one self-correcting invocation with a known-answer
control — and the network fetches stay here. Reporting this rather than repeatedly
discovering it.
