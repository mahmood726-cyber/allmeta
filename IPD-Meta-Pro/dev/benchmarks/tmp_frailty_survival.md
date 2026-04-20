# One-Stage/Frailty Benchmark vs R

- Seed: `12345`
- One-stage gated datasets: ``
- One-stage exploratory datasets: ``
- Frailty datasets: `survival`
- One-stage lane is currently benchmarked for continuous outcomes only.

## Summary

- Pass criteria: one-stage |effect| <= `0.020`, one-stage |SE| <= `0.050`
- Pass criteria: frailty |HR| <= `0.005`, |SE| <= `0.005`, |theta| <= `0.010`
- Rows compared: `1`
- Overall pass rate: `1.000`
- One-stage gated pass rate: `NA`
- One-stage coverage pass rate: `NA`
- One-stage exploratory pass rate: `NA`
- Frailty pass rate: `1.000`
- Max |one-stage effect diff|: `NA`
- Max |frailty HR diff|: `0.000479`
- Max |frailty theta diff|: `0.000000`

## Detailed Rows

| Track | Dataset | Key Diff 1 | Key Diff 2 | Pass |
|---|---|---:|---:|:---:|
| frailty | survival | 0.000479 | 0.000000 | YES |
