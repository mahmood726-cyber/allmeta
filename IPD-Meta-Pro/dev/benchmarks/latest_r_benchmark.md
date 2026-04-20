# IPD Meta-Analysis Pro vs R Benchmark

- Seed: `12345`
- Datasets: `survival, binary, continuous, ovarian_survival, statin_cvd, hiv_survival`
- Methods: `FE, DL, REML, PM, SJ, HE, ML`

## Summary

- Rows compared: `42`
- Overall pass rate vs `metafor`: `1.000`
- Max repeat diff (reproducibility): `0.000000000000`
- Median runtime per run (ms): `27.75`
- P95 runtime per run (ms): `126.94`

## By Method (vs `metafor`)

| Method | Pass Rate | Mean |tau2| diff | Max |tau2| diff | Mean |I2| diff |
|---|---:|---:|---:|---:|
| FE | 1.000 | 0.000000 | 0.000000 | 0.1271 |
| DL | 1.000 | 0.000111 | 0.000544 | 0.1271 |
| REML | 1.000 | 0.000065 | 0.000308 | 0.0730 |
| PM | 1.000 | 0.000137 | 0.000629 | 0.1596 |
| SJ | 1.000 | 0.000344 | 0.001469 | 0.0909 |
| HE | 1.000 | 0.000133 | 0.000796 | 0.1214 |
| ML | 1.000 | 0.000014 | 0.000087 | 0.0065 |

## Detailed Rows

| Dataset | Method | |pooled diff| | |tau2 diff| | |I2 diff| | Pass |
|---|---|---:|---:|---:|:---:|
| survival | FE | 0.000282 | 0.000000 | 0.0665 | YES |
| survival | DL | 0.000434 | 0.000124 | 0.0665 | YES |
| survival | REML | 0.000421 | 0.000080 | 0.0306 | YES |
| survival | PM | 0.000424 | 0.000128 | 0.0731 | YES |
| survival | SJ | 0.000897 | 0.001469 | 0.2451 | YES |
| survival | HE | 0.000282 | 0.000000 | 0.0000 | YES |
| survival | ML | 0.000366 | 0.000087 | 0.0393 | YES |
| binary | FE | 0.000000 | 0.000000 | 0.0000 | YES |
| binary | DL | 0.000000 | 0.000000 | 0.0000 | YES |
| binary | REML | 0.000000 | 0.000000 | 0.0000 | YES |
| binary | PM | 0.000024 | 0.000022 | 0.0578 | YES |
| binary | SJ | 0.000000 | 0.000000 | 0.0000 | YES |
| binary | HE | 0.000000 | 0.000000 | 0.0000 | YES |
| binary | ML | 0.000000 | 0.000000 | 0.0000 | YES |
| continuous | FE | 0.000000 | 0.000000 | 0.0000 | YES |
| continuous | DL | 0.000000 | 0.000000 | 0.0000 | YES |
| continuous | REML | 0.000000 | 0.000000 | 0.0000 | YES |
| continuous | PM | 0.000000 | 0.000021 | 0.0003 | YES |
| continuous | SJ | 0.000000 | 0.000000 | 0.0000 | YES |
| continuous | HE | 0.000000 | 0.000000 | 0.0000 | YES |
| continuous | ML | 0.000000 | 0.000000 | 0.0000 | YES |
| ovarian_survival | FE | 0.000022 | 0.000000 | 0.6960 | YES |
| ovarian_survival | DL | 0.000302 | 0.000544 | 0.6960 | YES |
| ovarian_survival | REML | 0.000173 | 0.000308 | 0.4075 | YES |
| ovarian_survival | PM | 0.000355 | 0.000629 | 0.8023 | YES |
| ovarian_survival | SJ | 0.000305 | 0.000592 | 0.2964 | YES |
| ovarian_survival | HE | 0.000021 | 0.000796 | 0.7285 | YES |
| ovarian_survival | ML | 0.000022 | 0.000000 | 0.0000 | YES |
| statin_cvd | FE | 0.000000 | 0.000000 | 0.0000 | YES |
| statin_cvd | DL | 0.000000 | 0.000000 | 0.0000 | YES |
| statin_cvd | REML | 0.000000 | 0.000000 | 0.0000 | YES |
| statin_cvd | PM | 0.000003 | 0.000024 | 0.0242 | YES |
| statin_cvd | SJ | 0.000000 | 0.000000 | 0.0000 | YES |
| statin_cvd | HE | 0.000000 | 0.000000 | 0.0000 | YES |
| statin_cvd | ML | 0.000000 | 0.000000 | 0.0000 | YES |
| hiv_survival | FE | 0.000038 | 0.000000 | 0.0000 | YES |
| hiv_survival | DL | 0.000038 | 0.000000 | 0.0000 | YES |
| hiv_survival | REML | 0.000038 | 0.000000 | 0.0000 | YES |
| hiv_survival | PM | 0.000038 | 0.000000 | 0.0000 | YES |
| hiv_survival | SJ | 0.000039 | 0.000000 | 0.0040 | YES |
| hiv_survival | HE | 0.000038 | 0.000000 | 0.0000 | YES |
| hiv_survival | ML | 0.000038 | 0.000000 | 0.0000 | YES |
