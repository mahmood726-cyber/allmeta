# Gap-Validated Methods Benchmark vs R

- Seed: `12345`
- Centered interaction datasets: `continuous, network_antidepressants`
- Survival datasets (piecewise + RMST): `survival, ovarian_survival, hiv_survival`
- Piecewise intervals: `8`
- RMST tau quantile: `0.80`

## Summary

- Centered pass criteria: within |effect| <= `0.100`, within |SE| <= `0.100`, across |effect| <= `0.100`, across |SE| <= `0.150`
- Piecewise pass criteria: |logHR| <= `0.020`, |SE| <= `0.020`
- RMST pass criteria: |effect| <= `0.100`, |SE| <= `0.100`, |tau| <= `0.000001`
- Rows compared: `8`
- Overall pass rate: `1.000`
- Centered pass rate: `1.000`
- Piecewise pass rate: `1.000`
- RMST pass rate: `1.000`
- Max |centered within effect diff|: `0.000000`
- Max |piecewise logHR diff|: `0.000000`
- Max |RMST effect diff|: `0.000000`

## Detailed Rows

| Track | Dataset | Key Diff 1 | Key Diff 2 | Pass |
|---|---|---:|---:|:---:|
| centered | continuous | 0.000000 | 0.000000 | YES |
| centered | network_antidepressants | 0.000000 | 0.000000 | YES |
| piecewise | survival | 0.000000 | 0.000000 | YES |
| piecewise | ovarian_survival | 0.000000 | 0.000000 | YES |
| piecewise | hiv_survival | 0.000000 | 0.000000 | YES |
| rmst | survival | 0.000000 | 0.000000 | YES |
| rmst | ovarian_survival | 0.000000 | 0.000000 | YES |
| rmst | hiv_survival | 0.000000 | 0.000000 | YES |
