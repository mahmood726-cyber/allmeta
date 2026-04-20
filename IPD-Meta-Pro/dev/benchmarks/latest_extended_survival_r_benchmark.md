# Extended Survival Benchmark vs R

- Survival datasets: `survival, ovarian_survival, breast_endocrine, hiv_survival`
- Landmarks: `6, 12, 24`
- Horizon: `60`
- Seed: `12345`
- Overall pass rate: `1.000`
- AFT pass rate: `1.000`
- Landmark pass rate: `1.000`

## AFT Tolerances

- |treatment effect diff| <= `0.2`
- |time-ratio diff| <= `0.35`
- |scale diff| <= `0.1`

## Landmark Tolerances

- |HR diff| <= `0.15`
- |SE diff| <= `0.05`

## Rows

| Track | Dataset | Landmark | Diff 1 | Diff 2 | Pass |
|---|---|---:|---:|---:|:---:|
| aft_weibull | survival | - | 0.000005 | 0.000007 | YES |
| landmark | survival | 6 | 0.000469 | 0.000001 | YES |
| landmark | survival | 12 | 0.000712 | 0.000001 | YES |
| landmark | survival | 24 | 0.001860 | 0.000003 | YES |
| aft_weibull | ovarian_survival | - | 0.000002 | 0.000003 | YES |
| landmark | ovarian_survival | 6 | 0.000227 | 0.000001 | YES |
| landmark | ovarian_survival | 12 | 0.000232 | 0.000003 | YES |
| landmark | ovarian_survival | 24 | 0.000092 | 0.000005 | YES |
| aft_weibull | breast_endocrine | - | 0.000004 | 0.000006 | YES |
| landmark | breast_endocrine | 6 | 0.000012 | 0.000000 | YES |
| landmark | breast_endocrine | 12 | 0.000019 | 0.000000 | YES |
| landmark | breast_endocrine | 24 | 0.000022 | 0.000000 | YES |
| aft_weibull | hiv_survival | - | 0.000004 | 0.000008 | YES |
| landmark | hiv_survival | 6 | 0.000006 | 0.000000 | YES |
| landmark | hiv_survival | 12 | 0.000005 | 0.000000 | YES |
| landmark | hiv_survival | 24 | 0.000012 | 0.000000 | YES |
