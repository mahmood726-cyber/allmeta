# How the generality classes compare to published network meta-analyses

The incretin flagship is already benchmarked against 7 published obesity NMAs/guidelines
(`concordance_battery.py`, `COMPARISON_PUBLISHED.md`). This file does the same for the **five
generality repoints** — one PubMed-verified published NMA per outcome type. Engine values are read
programmatically from each class league JSON (`class_concordance.py` → `class_concordance.json`); every
reference DOI was resolved on PubMed on 2026-06-11. Comparison is at the level the abstracts support
(class direction / top-tier membership / "no clean within-class winner"), **not** a re-pooling of the
published effect sizes — the contrasts differ, and each row states its boundary.

| Class (outcome type) | Published reference | Published finding | Engine finding | Verdict |
|---|---|---|---|---|
| **PCSK9i** (continuous, LDL-C) | Jiang 2025, *Front Cardiovasc Med* — [DOI](https://doi.org/10.3389/fcvm.2024.1415668) (68 trials) | LDL-C monotherapy: evolocumab > alirocumab > **inclisiran** (last) | Same order for the 3 shared agents; lead bococizumab is a withdrawn agent absent from the published net | **Concordant** (overlap order + class direction) |
| **SGLT2i** (survival/HR, HF-hosp) | Tsapas 2020, *Ann Intern Med* — [DOI](https://doi.org/10.7326/M20-0864) (453 trials) | SGLT2i reduce HF hospitalisation **as a class**; no within-class winner | All agents reduce HF-hosp (canagliflozin nominal lead, **Low certainty**) | **Concordant** (class direction; both decline a winner) |
| **Psoriasis** (binary, PASI-90) | Sbidian 2022, *Cochrane* — [DOI](https://doi.org/10.1002/14651858.CD011535.pub5) (167 trials) | anti-IL17/IL23 **> TNF**; top tier bimekizumab/ixekizumab/risankizumab | Lead **bimekizumab** 89%; reproduces IL-17/23 > TNF, P=1.000 | **Concordant** (top-tier + hierarchy) |
| **Asthma** (count/rate, AAER) | Menzies-Gow 2022, *J Med Econ* — [DOI](https://doi.org/10.1080/13696998.2022.2074195) (16 trials) | **tezepelumab ranked first**, but all biologics similar (no significant difference) | **tezepelumab** first (IRR 0.48); flags heterogeneity → no clean winner | **Concordant** (two-part: nominal lead + no-winner) |
| **RA** (ordinal, ACR) | Singh 2017, *Cochrane* — [DOI](https://doi.org/10.1002/14651858.CD012657) (19 trials) | biologics improve ACR50 (NNTB 7); downgraded for **inconsistency** | All agents improve ACR; **heterogeneity_flag=true** (PO RMSE 2.0) → no clean winner | **Concordant** (class benefit + flag mirrors inconsistency) |

**Headline: 5/5 classes concordant with an independent published NMA.**

According to PubMed, the references above are real and DOI-resolved. Attribution:
- Jiang et al. 2025, *Frontiers in Cardiovascular Medicine* — [https://doi.org/10.3389/fcvm.2024.1415668](https://doi.org/10.3389/fcvm.2024.1415668)
- Tsapas et al. 2020, *Annals of Internal Medicine* — [https://doi.org/10.7326/M20-0864](https://doi.org/10.7326/M20-0864)
- Sbidian et al. 2022, *Cochrane Database of Systematic Reviews* — [https://doi.org/10.1002/14651858.CD011535.pub5](https://doi.org/10.1002/14651858.CD011535.pub5)
- Menzies-Gow et al. 2022, *Journal of Medical Economics* — [https://doi.org/10.1080/13696998.2022.2074195](https://doi.org/10.1080/13696998.2022.2074195)
- Singh et al. 2017, *Cochrane Database of Systematic Reviews* — [https://doi.org/10.1002/14651858.CD012657](https://doi.org/10.1002/14651858.CD012657)

## Two findings worth flagging
1. **The engine's self-flagging is itself validated.** In asthma and RA the engine refuses to crown a clean
   winner; the published NMAs (Menzies-Gow: "no significant difference"; Singh: "downgraded for inconsistency")
   independently reach the *same* hesitation. Reproducing a published *caveat* is a stronger signal than
   reproducing a point estimate.
2. **Honest boundaries, stated per row.** The RA NNT is placebo-anchored (response-rate), not the published
   biologic-vs-MTX incremental NNTB; the SGLT2 and PCSK9 references report at class level / pool combination
   arms; bococizumab and infliximab fall outside one network or the other. None of these are papered over.
