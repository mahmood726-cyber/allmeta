# How the cardiometabolic classes compare to published network meta-analyses

> **Scope note (2026-06-12):** restricted to the **two cardiometabolic siblings** of the obesity flagship
> (PCSK9, SGLT2) after the immunology repoints (psoriasis / asthma / RA) and the DTA class were removed to keep
> the repo focused on the GLP-1 obesity question.

The incretin flagship is already benchmarked against 7 published obesity NMAs/guidelines
(`concordance_battery.py`, `COMPARISON_PUBLISHED.md`). This file does the same for the **two cardiometabolic
repoints** — one PubMed-verified published NMA each. Engine values are read programmatically from each class
league JSON (`class_concordance.py` → `class_concordance.json`); every reference DOI was resolved on PubMed on
2026-06-11. Comparison is at the level the abstracts support (class direction / overlap order / "no clean
within-class winner"), **not** a re-pooling of the published effect sizes — the contrasts differ, and each row
states its boundary.

| Class (outcome type) | Published reference | Published finding | Engine finding | Verdict |
|---|---|---|---|---|
| **PCSK9i** (continuous, LDL-C) | Jiang 2025, *Front Cardiovasc Med* — [DOI](https://doi.org/10.3389/fcvm.2024.1415668) (68 trials) | LDL-C monotherapy: evolocumab > alirocumab > **inclisiran** (last) | Same order for the 3 shared agents; lead bococizumab is a withdrawn agent absent from the published net | **Concordant** (overlap order + class direction) |
| **SGLT2i** (survival/HR, HF-hosp) | Tsapas 2020, *Ann Intern Med* — [DOI](https://doi.org/10.7326/M20-0864) (453 trials) | SGLT2i reduce HF hospitalisation **as a class**; no within-class winner | All agents reduce HF-hosp (canagliflozin nominal lead, **Low certainty**) | **Concordant** (class direction; both decline a winner) |

**Headline: 2/2 cardiometabolic classes concordant with an independent published NMA.**

According to PubMed, the references above are real and DOI-resolved. Attribution:
- Jiang et al. 2025, *Frontiers in Cardiovascular Medicine* — [https://doi.org/10.3389/fcvm.2024.1415668](https://doi.org/10.3389/fcvm.2024.1415668)
- Tsapas et al. 2020, *Annals of Internal Medicine* — [https://doi.org/10.7326/M20-0864](https://doi.org/10.7326/M20-0864)

## Honest boundaries, stated per row
The SGLT2 and PCSK9 references report at class level / pool combination arms; bococizumab (our nominal PCSK9
lead) is a withdrawn agent outside the published network, and our SGLT2 canagliflozin lead is explicitly
Low-certainty. None of these are papered over. The engine's SGLT2 behaviour — declining to crown a within-class
winner — independently matches Tsapas's class-level conclusion, which is a stronger signal than reproducing a
single point estimate.
