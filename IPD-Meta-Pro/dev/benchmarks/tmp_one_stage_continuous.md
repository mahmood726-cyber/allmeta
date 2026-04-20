# One-Stage/Frailty Benchmark vs R

- Seed: `12345`
- One-stage gated datasets: `continuous`
- One-stage exploratory datasets: ``
- Frailty datasets: ``
- One-stage lane is currently benchmarked for continuous outcomes only.

## Summary

- Pass criteria: one-stage |effect| <= `0.020`, one-stage |SE| <= `0.050`
- Pass criteria: frailty |HR| <= `0.005`, |SE| <= `0.005`, |theta| <= `0.010`
- Rows compared: `1`
- Overall pass rate: `1.000`
- One-stage gated pass rate: `1.000`
- One-stage coverage pass rate: `1.000`
- One-stage exploratory pass rate: `NA`
- Frailty pass rate: `NA`
- Max |one-stage effect diff|: `0.017524`
- Max |frailty HR diff|: `NA`
- Max |frailty theta diff|: `NA`

## Detailed Rows

| Track | Dataset | Key Diff 1 | Key Diff 2 | Pass |
|---|---|---:|---:|:---:|
| one_stage | continuous | 0.017524 | 0.013620 | YES |
