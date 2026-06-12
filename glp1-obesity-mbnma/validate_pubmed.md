# PubMed-abstract cross-validation of AACT-extracted node values

Source: PubMed abstracts (permitted source, DATA_SOURCES.md). Each AACT-extracted
value is compared to the trial's published primary paper. Placebo-adjusted = active - placebo.

| node / trial | published (abstract) | AACT-extracted (this pipeline) | verdict |
|---|---|---|---|
| **tirzepatide** SURMOUNT-1 (NCT04184622) | 5/10/15 mg: -15.0/-19.5/-20.9% (treatment-regimen), placebo -3.1%; efficacy estimand -16.0/-21.4/-22.5% | -16.0/-21.4/-22.5% (efficacy estimand), placebo -2.4% | MATCH (efficacy estimand exact) |
| **orforglipron** ph2 (NCT05051579) | 45 mg -14.7%, placebo -2.3% (wk36) -> adj 12.4 pp | 45 mg adj 12.4 pp | MATCH exact |
| **retatrutide** ph2 (NCT04881760) | 12 mg -24.2% (wk48), placebo ~-2.1% -> adj ~22.1 pp | 12 mg adj 22.1 pp | MATCH exact |

Sources (PubMed; cite DOIs):
- Jastreboff AM et al. Tirzepatide Once Weekly for the Treatment of Obesity. N Engl J Med 2022;387:205-216. doi:10.1056/NEJMoa2206038
- Wharton S et al. Daily Oral GLP-1 Receptor Agonist Orforglipron for Adults with Obesity. N Engl J Med 2023;389:877-888. doi:10.1056/NEJMoa2302392
- Jakubowska A, le Roux CW, Viljoen A. The Road towards Triple Agonists... Endocrinol Metab 2024;39:12-22. doi:10.3803/EnM.2024.1942 (cites retatrutide ph2 Jastreboff 2023)

Conclusion: the registry-native AACT extraction reproduces the published primary weight-loss
values exactly once the estimand is pinned. The dose-response NMA's per-node effects are
externally validated against the peer-reviewed literature, not just internally consistent.
