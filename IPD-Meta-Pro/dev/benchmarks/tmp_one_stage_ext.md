# One-Stage/Frailty Benchmark vs R

- Seed: `12345`
- One-stage datasets: `continuous, network_antidepressants`
- Frailty datasets: `survival, ovarian_survival, hiv_survival`

## Summary

- Pass criteria: one-stage |effect| <= `0.100`, one-stage |SE| <= `0.250`
- Pass criteria: frailty |HR| <= `0.010`, |SE| <= `0.010`, |theta| <= `0.020`
- Rows compared: `5`
- Overall pass rate: `0.800`
- One-stage pass rate: `0.500`
- Frailty pass rate: `1.000`
- Max |one-stage effect diff|: `0.258618`
- Max |frailty HR diff|: `0.000479`
- Max |frailty theta diff|: `0.004721`

## Detailed Rows

| Track | Dataset | Key Diff 1 | Key Diff 2 | Pass |
|---|---|---:|---:|:---:|
| one_stage | continuous | 0.094293 | 0.208141 | YES |
| one_stage | network_antidepressants | 0.258618 | 0.216564 | NO |
| frailty | survival | 0.000479 | 0.004721 | YES |
| frailty | ovarian_survival | 0.000179 | 0.000332 | YES |
| frailty | hiv_survival | 0.000005 | 0.000072 | YES |
