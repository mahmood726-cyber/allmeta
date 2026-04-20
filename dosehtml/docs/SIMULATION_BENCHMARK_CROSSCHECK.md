# Simulation Benchmark Cross-Check Format

Date: 2026-02-28
File consumed by app: `tests/r_simulation_benchmark_results.json`

## Purpose
Enable external (e.g., R-generated) simulation summaries to be compared against the app's benchmark-grid output.

## Minimum JSON shape
```json
{
  "generated_at": "2026-02-28T12:00:00Z",
  "benchmark": {
    "scenarios": [
      {
        "id": "k5_tau001_regular_common",
        "coverageHKSJ": 95.1,
        "type1HKSJ": 4.8,
        "bias": 0.0003
      }
    ]
  }
}
```

The app matches scenarios by `id` and compares:
- `coverageHKSJ`
- `type1HKSJ`
- `bias`

## Current tolerance in app
- `abs(delta coverageHKSJ) <= 5`
- `abs(delta type1HKSJ) <= 5`
- `abs(delta bias) <= 0.01`
- Scenario pass bands are stored per scenario in `bands` (small-K conservative-control).

## Scenario IDs expected by default benchmark grid
- `k5_tau0_regular_common`
- `k5_tau001_regular_common`
- `k10_tau001_regular_common`
- `k5_tau01_regular_common`
- `k5_tau001_wide_common`
- `k5_tau001_uneven_rare`

## Recommended workflow
1. Run app benchmark grid and export JSON (`Export Sim JSON`) for a schema reference.
2. Generate R simulation summaries for the same scenario IDs.
3. Save R summary JSON to `tests/r_simulation_benchmark_results.json`.
4. Click `Load R Sim Benchmark` in app to view pass/warn deltas.
