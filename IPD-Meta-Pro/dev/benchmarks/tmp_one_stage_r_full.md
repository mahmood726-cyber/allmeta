# One-Stage/Frailty Benchmark vs R

- Seed: `12345`
- One-stage gated datasets: `continuous, network_antidepressants`
- One-stage exploratory datasets: ``
- Frailty datasets: `survival, ovarian_survival, hiv_survival`
- One-stage lane is currently benchmarked for continuous outcomes only.

## Summary

- Pass criteria: one-stage |effect| <= `0.020`, one-stage |SE| <= `0.050`
- Pass criteria: frailty |HR| <= `0.005`, |SE| <= `0.005`, |theta| <= `0.010`
- Rows compared: `5`
- Overall pass rate: `1.000`
- One-stage gated pass rate: `1.000`
- One-stage coverage pass rate: `1.000`
- One-stage exploratory pass rate: `NA`
- Frailty pass rate: `1.000`
- Max |one-stage effect diff|: `0.017934`
- Max |frailty HR diff|: `0.000479`
- Max |frailty theta diff|: `0.000000`

## Detailed Rows

| Track | Dataset | Key Diff 1 | Key Diff 2 | Pass |
|---|---|---:|---:|:---:|
| one_stage | continuous | 0.017524 | 0.013620 | YES |
| one_stage | network_antidepressants | 0.017934 | 0.018988 | YES |
| frailty | survival | 0.000479 | 0.000000 | YES |
| frailty | ovarian_survival | 0.000179 | 0.000000 | YES |
| frailty | hiv_survival | 0.000005 | 0.000000 | YES |
