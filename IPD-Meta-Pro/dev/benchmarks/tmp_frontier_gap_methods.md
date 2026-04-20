# Frontier Gap Methods Benchmark (Loop 3/4/6)

- Seed: `12345`
- Datasets: `hiv_survival, ovarian_survival`
- KM imputations: `80`
- Federated epsilon: `8.0`

## Summary

- Rows compared: `8`
- Overall pass rate: `1.000`
- KM reconstruction pass rate: `1.000`
- Transport sensitivity pass rate: `1.000`
- Transport overlap-stress pass rate: `1.000`
- Federated survival pass rate: `1.000`
- Max |federated utility gap|: `0.004661`

## Criteria

- KM: imputations >= `20`, at least 2 subgroup effects, finite interaction SE, event flip rate in `(0, 0.10]`
- Transport sensitivity: >=`7` delta scenarios, finite base TATE/SE, monotonic delta response, zero-delta consistency
- Transport overlap stress: >=`4` truncation scenarios, finite preferred TATE/SE, stability diagnostics reported, sign consistency, overlap in `[0,1]`, ESS fraction > 0, |stable span| <= `0.30`
- Federated: >=2 sites, finite DP estimate, centralized reference available, |utility gap| <= `0.25`

## Detailed Rows

| Track | Dataset | Status | Key Metric |
|---|---|:---:|---|
| km_reconstruction | hiv_survival | YES | imputations=80, subgroups=2, interaction_se=0.1221 |
| km_reconstruction | ovarian_survival | YES | imputations=80, subgroups=2, interaction_se=0.2779 |
| transport_sensitivity | hiv_survival | YES | base_tate=-0.1732, scenarios=9, delta_null=0.1732 |
| transport_sensitivity | ovarian_survival | YES | base_tate=-0.0887, scenarios=9, delta_null=0.0887 |
| transport_overlap | hiv_survival | YES | stable=0, min_overlap=0.169, stable_span=NA |
| transport_overlap | ovarian_survival | YES | stable=5, min_overlap=0.506, stable_span=0.0024 |
| federated_survival | hiv_survival | YES | n_sites=4, utility_gap=-0.0047, mean_noise=0.0013 |
| federated_survival | ovarian_survival | YES | n_sites=5, utility_gap=0.0025, mean_noise=0.0162 |
