# Second frame: infectious disease — topic inputs, frozen before the run

**Status: FROZEN and committed BEFORE the ID frame was built.** The criteria in
`OPEN-COMPARATOR-PROTOCOL.md` are **unchanged and untouched** — this file supplies only
the per-topic inputs the protocol's §5.2 and §5.3 require for a new specialty.
Implementation `oa68k/opencomp_id.py`, which imports the frozen builder and replaces its
topic tables at run time; `opencomp.py` itself is not edited.

---

## ⛔ Why 20 is reached by a second frame and not a looser rule

The target is **twenty open-access comparators**. The frozen join gives 22 comparators —
but it includes matches we **proved unsound** by hand-reading three papers, and the join
was ruled at `nct_pmid` (**12 comparators / 13 pairs**) for that measured reason.

**Reopening the join to reach 20 would be choosing the criterion to hit the target**,
which is the exact failure the pre-registration exists to prevent. The ruled join stands.
Twenty is reached by adding a **second specialty**, not by relaxing anything.

⇒ **Under the ruled join, cardiology contributes 12. The ID frame must contribute ≥8 for
the combined total to reach 20.**

## ⛔ The timestamp bound, again and honestly

This file was written **after** the cardiology frame ran and after its results were read.
What that means concretely:

- I knew cardiology yielded 22 comparators from 4 topics, 18 of them on one topic;
- I knew acronym-only matches supplied 10 of those 22, and that the ruled join drops them;
- I knew `MATCH_UNDECIDABLE_NO_TRIAL_IDS` fires when our key table has no acronym and no
  PMID — which is the case for **most** ID topics below.

**The term lists are therefore written by someone who knows how this frame behaves.** They
are pre-specified with respect to *ID results* — no ID query has been run — and
retrospective with respect to *the cardiology run*. Said here rather than left to a reader.

---

## ⛔ Independence: what was excluded, by name

⭐ **A pair count is not a review count.** Everything below is reported as
**comparators / independent topics**, side by side, always.

| excluded | k | why |
|---|---|---|
| `hiv-prep-injectable-review` | 3 | its own title says **"DUPLICATE PAGE — see cab…"**. Counting it beside `cab-prep-hiv-review` would be near-duplicate inflation. |
| `malaria-vaccine` | 3 | near-duplicate of `malaria-vaccines` (k=7) on the same question. **Kept the larger, excluded the smaller.** |
| `menacyw-healthy-volunteers-auto-full-review` | 2 | near-duplicate of `menacwy-booster`. |
| `bamlanivimab-covid`, `casirivimab-covid`, `cryptococcal-meningitis`, `cryptococcal-meningitis-africa`, `pediatric-hiv-art`, `remdesivir-covid` | 1 | **k = 1.** The frozen rule needs ≥2 overlapping trials, so no comparator can ever match. Excluded by arithmetic, not by preference. |
| `emtricitabine-hiv-auto-full-review`, `etesevimab-covid-auto-full-review` | 0 | no trial set at all. |

⚠️ `lenacapavir-hiv` and `lenacapavir-prep` are **not** near-duplicates — treatment versus
prevention are different questions — but neither is in this frame, to keep the first ID
run to twelve well-specified topics rather than a wider set of thinner ones.

⚠️ `malaria-vaccines` lists **8 trial rows but k = 7**: `NCT00866619` appears twice, as two
cohorts of one trial. **A trial contributing two cohorts is one registration.**

---

## The twelve topics, frozen

### Stage-A term lists (protocol §5.2 form)

| topic | intervention terms | population terms |
|---|---|---|
| `malaria-vaccines` | RTS,S · RTSS · Mosquirix · R21 · Matrix-M · malaria vaccine | malaria · Plasmodium falciparum · children |
| `malaria-act-review` | artemisinin · artemether · lumefantrine · artesunate · amodiaquine · dihydroartemisinin · piperaquine | malaria · falciparum |
| `prevnar15-pneumo` | V114 · 15-valent pneumococcal · PCV15 · Prevnar 13 · PCV13 | pneumococcal · Streptococcus pneumoniae |
| `covid19-vaccines` | Gam-COVID-Vac · Sputnik · CVnCoV · CoronaVac · inactivated vaccine · COVID-19 vaccine | COVID-19 · SARS-CoV-2 |
| `mdr-tb-shortened` | bedaquiline · pretomanid · linezolid · BPaL | tuberculosis · drug-resistant · multidrug-resistant |
| `rotavirus-vaccine-africa-review` | Rotarix · RotaTeq · Rotasiil · rotavirus vaccine | rotavirus · gastroenteritis · infants |
| `menacwy-booster` | MenACWY · MenACYW · meningococcal conjugate | meningococcal · Neisseria meningitidis |
| `cab-prep-hiv-review` | cabotegravir · long-acting injectable | HIV · pre-exposure prophylaxis · PrEP |
| `agyw-hiv-prep-review` | dapivirine · vaginal ring | HIV · women |
| `nirsevimab-infant-rsv-review` | nirsevimab | RSV · respiratory syncytial virus · infants |
| `covid-oral-antivirals` | molnupiravir · nirmatrelvir · PF-07321332 · Paxlovid | COVID-19 · SARS-CoV-2 |
| `hepatitis-b-taf-tdf-review` | tenofovir alafenamide · TAF · tenofovir disoproxil | hepatitis B · HBV · chronic hepatitis |

### Stage-B included-trial sets (protocol §5.3 form)

Read from the corpus SSOT `inputs.trials[]` and fixed here. **k is distinct registrations.**

| topic | k | registrations |
|---|---|---|
| `malaria-vaccines` | 7 | NCT00866619 · NCT03896724 · NCT04704830 · NCT03276962 · NCT00436007 · NCT00380393 · NCT03143218 |
| `malaria-act-review` | 5 | NCT01704508 · NCT04565184 · NCT04767191 · NCT05192265 · NCT06076213 |
| `prevnar15-pneumo` | 7 | NCT02547649 · NCT03547167 · NCT03950622 · NCT03620162 · NCT03692871 · NCT03848065 · NCT03921424 |
| `covid19-vaccines` | 3 | NCT04530396 · NCT04652102 · NCT04510207 |
| `mdr-tb-shortened` | 3 | NCT02333799 · NCT02589782 · NCT03086486 |
| `rotavirus-vaccine-africa-review` | 3 | NCT00241644 · NCT00362648 · NCT02145000 |
| `menacwy-booster` | 3 | NCT00454909 · NCT01359449 · NCT02810340 |
| `cab-prep-hiv-review` | 2 | NCT02720094 · NCT03164564 |
| `agyw-hiv-prep-review` | 2 | NCT01539226 · NCT01617096 |
| `nirsevimab-infant-rsv-review` | 2 | NCT02878330 · NCT03979313 |
| `covid-oral-antivirals` | 2 | NCT04575597 · NCT04960202 |
| `hepatitis-b-taf-tdf-review` | 2 | NCT01940341 · NCT01940471 |

⛔ **A known asymmetry, declared in advance.** Our ID trial names are descriptive rather
than acronyms, and the SSOT holds no PMIDs for them, so **matching rests on NCT
identifiers alone** for every topic here. Under the ruled `nct_pmid` join that is the only
channel anyway — but it means an ID meta-analysis citing its trials by author-and-year will
return `MATCH_UNDECIDABLE_NO_TRIAL_IDS`. **That deficiency is in our key table, not in the
comparator**, and it is the main reason the prediction below is what it is.

---

## ⭐ Prediction, on the record, before the ID frame runs

> **I expect 18 eligible comparators, across 8 of the 12 topics.**
>
> Per topic: `nirsevimab` 3 · `covid-oral-antivirals` 3 · `malaria-vaccines` 3 ·
> `mdr-tb-shortened` 2 · `rotavirus-vaccine-africa` 2 · `cab-prep-hiv` 2 ·
> `agyw-hiv-prep` 2 · `hepatitis-b-taf-tdf` 1 · `malaria-act` 0 · `covid19-vaccines` 0 ·
> `prevnar15-pneumo` 0 · `menacwy-booster` 0.

**Direction of the miss: I expect to be too HIGH**, and this time the reason is measured
rather than felt. Cardiology's 22 fell to **12 under the ruled join** once acronym-only
matches were dropped — 3 comparators per topic through the NCT/PMID channel alone. **Every
ID topic here has only that channel**, and ID literatures cite trials by author-year far
more often than cardiology's acronym-heavy trials. So I am scaling 12/4 down, not 22/4.

⚠️ **I am not leaning against my last miss.** Cardiology's prediction was too LOW by 2.4×
because I forgot the population size; here the binding constraint is a *key channel*, not
population, and it points the other way. If I am wrong again it will most likely be because
ID meta-analyses report registry identifiers more often than I expect — in which case the
answer will be well above 18.

**Plausible range 6–30.** ⛔ **A zero on any topic measures the instrument until proven
otherwise** — answered by hand-running one known-good example, not by inspecting the frame
that produced it.

**Combined target arithmetic, stated before the run so it cannot be reverse-engineered
afterwards:** cardiology 12 comparators / 4 topics under the ruled join. **ID must return
≥8 comparators for the combined total to reach 20.** If it returns fewer, the honest report
is that we are short of twenty — not that the join should be revisited.
