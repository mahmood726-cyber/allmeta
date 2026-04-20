# IPD Parity Gate (Loop 2 + Loop 3/4/6 + Loop 7)

- Generated: `2026-03-12T10:20:39Z`
- Status: `PASS`
- Two-stage pass rate (vs metafor): `1.000`
- One-stage pass rate (vs lme4): `1.000`
- One-stage coverage pass rate: `1.000`
- One-stage exploratory pass rate: `1.000`
- Frailty pass rate (vs survival::coxph): `1.000`
- Centered interaction pass rate (vs R): `1.000`
- Piecewise survival pass rate (vs R): `1.000`
- RMST IPD pass rate (vs R): `1.000`
- Extended survival pass rate (AFT/landmark vs survival): `1.000`
- Advanced survival pass rate (cure/competing vs flexsurvcure+cmprsk): `1.000`
- KM uncertainty-reconstruction pass rate (Loop 3): `1.000`
- Transportability IOW pass rate (Loop 4): `1.000`
- Federated survival DP pass rate (Loop 3): `1.000`
- Transportability sensitivity pass rate (Loop 4): `1.000`
- Transportability overlap-stress pass rate (Loop 6): `1.000`
- Simulation lab pass rate (Loop 7): `1.000`
- Publication replication pass rate (Loop 7): `1.000`

## Gate Thresholds

- Min two-stage pass rate: `1.000`
- Min one-stage pass rate: `1.000`
- Min frailty pass rate: `1.000`
- Min centered pass rate: `1.000`
- Min piecewise pass rate: `1.000`
- Min RMST pass rate: `1.000`
- Min extended survival pass rate: `1.000`
- Min advanced survival pass rate: `1.000`
- Min KM pass rate: `1.000`
- Min transport IOW pass rate: `1.000`
- Min federated pass rate: `1.000`
- Min transport sensitivity pass rate: `1.000`
- Min transport overlap-stress pass rate: `1.000`
- Min simulation-lab pass rate: `1.000`
- Min publication-replication pass rate: `1.000`

## Largest Two-Stage Gaps

| Dataset | Method | |pooled diff| | |tau2 diff| | |I2 diff| | Pass |
|---|---|---:|---:|---:|:---:|
| survival | SJ | 0.000897 | 0.001469 | 0.2451 | YES |
| survival | DL | 0.000434 | 0.000124 | 0.0665 | YES |
| survival | PM | 0.000424 | 0.000128 | 0.0731 | YES |
| survival | REML | 0.000421 | 0.000080 | 0.0306 | YES |
| survival | ML | 0.000366 | 0.000087 | 0.0393 | YES |

## Largest One-Stage/Frailty Gaps

| Track | Dataset | Diff 1 | Diff 2 | Pass |
|---|---|---:|---:|:---:|
| one_stage | network_antidepressants | 0.017934 | 0.018988 | YES |
| one_stage | continuous | 0.017524 | 0.013620 | YES |
| one_stage (exploratory) | covid_treatments | 0.001401 | 0.001813 | YES |
| frailty | survival | 0.000479 | 0.000000 | YES |
| one_stage (exploratory) | statin_cvd | 0.000393 | 0.001363 | YES |

## Largest Gap-Method Gaps

| Track | Dataset | Diff 1 | Diff 2 | Pass |
|---|---|---:|---:|:---:|
| rmst | hiv_survival | 0.000000 | 0.000000 | YES |
| piecewise | hiv_survival | 0.000000 | 0.000000 | YES |
| rmst | survival | 0.000000 | 0.000000 | YES |
| rmst | ovarian_survival | 0.000000 | 0.000000 | YES |
| piecewise | ovarian_survival | 0.000000 | 0.000000 | YES |

## Largest Extended Survival Gaps

| Track | Dataset | Landmark | Diff 1 | Diff 2 | Pass |
|---|---|---:|---:|---:|:---:|
| landmark | survival | 24 | 0.001860 | 0.000003 | YES |
| landmark | survival | 12 | 0.000712 | 0.000001 | YES |
| landmark | survival | 6 | 0.000469 | 0.000001 | YES |
| landmark | ovarian_survival | 12 | 0.000232 | 0.000003 | YES |
| landmark | ovarian_survival | 6 | 0.000227 | 0.000001 | YES |

## Largest Advanced Survival Gaps

| Track | Dataset | Cause | Diff 1 | Diff 2 | Pass |
|---|---|---|---:|---:|:---:|
| cure_meta | cure_benefit | - | 0.013292 | 0.037174 | YES |
| cure_meta | cure_plateau | - | 0.000973 | 0.151397 | YES |
| competing_meta | competing_tradeoff | cause2 | 0.000455 | 0.000183 | YES |
| competing_meta | competing_primary_benefit | cause1 | 0.000365 | 0.000553 | YES |
| competing_meta | competing_tradeoff | cause1 | 0.000173 | 0.000017 | YES |


## Largest Frontier Gap-Method Gaps

| Track | Dataset | Diff 1 | Diff 2 | Pass |
|---|---|---:|---:|:---:|
| km_reconstruction | ovarian_survival | 0.282219 | 0.020916 | YES |
| transport_sensitivity | hiv_survival | 0.173249 | 0.016355 | YES |
| km_reconstruction | hiv_survival | 0.121611 | 0.007579 | YES |
| transport_iow | ovarian_survival | NA | NA | YES |
| transport_sensitivity | ovarian_survival | 0.088662 | 0.037525 | YES |

## Raw Artifact Paths

- Two-stage JSON: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_r_benchmark.json`
- Two-stage MD: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_r_benchmark.md`
- One-stage JSON: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_one_stage_r_benchmark.json`
- One-stage MD: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_one_stage_r_benchmark.md`
- Gap-method JSON: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_gap_methods_r_benchmark.json`
- Gap-method MD: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_gap_methods_r_benchmark.md`
- Extended survival JSON: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_extended_survival_r_benchmark.json`
- Extended survival MD: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_extended_survival_r_benchmark.md`
- Advanced survival JSON: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_advanced_survival_r_benchmark.json`
- Advanced survival MD: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_advanced_survival_r_benchmark.md`
- Frontier JSON: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_frontier_gap_methods_benchmark.json`
- Frontier MD: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_frontier_gap_methods_benchmark.md`
- Simulation JSON: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_ipd_simulation_lab_benchmark.json`
- Simulation MD: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_ipd_simulation_lab_benchmark.md`
- Replication JSON: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_publication_replication_gate.json`
- Replication MD: `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_publication_replication_gate.md`
- Validation Snapshot JSON (Loop 9): `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_ipd_superiority_snapshot.json`
- Validation Snapshot MD (Loop 9): `C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\latest_ipd_superiority_snapshot.md`

