# IPD Simulation Lab Benchmark (Loop 7)

- Seed: `12345`
- Scenarios: `null, linear, nonlinear`
- Replicates per scenario: `40`
- Min valid replicates gate: `30`

## Summary

- Scenario rows: `3`
- Overall pass rate: `1.000`
- Mean |high-low bias|: `0.0104`
- Mean |curvature bias|: `0.0291`

## Criteria

- |High-low bias| <= `0.12`, high-low coverage >= `0.80`
- Curvature coverage >= `0.80`
- If true curvature = 0: significant-rate <= `0.10`
- If true curvature != 0: significant-rate >= `0.75`
- Spline high-low RMSE <= linear comparator RMSE + `0.07`

## Detailed Rows

| Scenario | Status | Valid reps | HL bias | HL cov | Curv bias | Curv cov | Curv sig-rate |
|---|:---:|---:|---:|---:|---:|---:|---:|
| linear | YES | 40 | 0.0047 | 0.950 | -0.0102 | 0.975 | 0.025 |
| nonlinear | YES | 40 | -0.0041 | 0.925 | 0.0657 | 0.900 | 0.975 |
| null | YES | 40 | -0.0223 | 0.975 | 0.0115 | 0.950 | 0.050 |
