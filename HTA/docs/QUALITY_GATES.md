# Quality Gates

This project now enforces a production-style quality gate intended for top-tier HTA modeling reliability.

## Commands

- `npm run validate:reference`
  - Runs deterministic fixture checks against `reference-models/*/expected_results.json`.
  - Runs external parity checks when `reference-models/*/external_reference.json` is present.
  - Writes `reports/reference-validation.json`.
- `npm run external:export:r`
  - Runs independent R fixture model execution and writes comparator results under `external-comparators/r/*/results.json`.
- `npm run external:sync`
  - Rebuilds `reference-models/*/external_reference.json` from `external-comparators/r` and `external-comparators/treeage`.
- `npm run external:refresh`
  - Convenience command: run R export and then sync comparator definitions.
- `npm run validate:determinism`
  - Re-runs reference fixtures multiple times and ensures byte-stable hashes.
  - Writes `reports/determinism-check.json`.
- `npm run bench:ci`
  - Executes performance benchmark checks against thresholds in `benchmarks/performance-thresholds.json`.
  - Writes `reports/performance-benchmark.json`.
- `npm run quality:gate`
  - Full gate: lint, coverage-gated tests, reference validation, determinism, performance, and build.
- `npm run coverage:report`
  - Generates coverage metrics and reports.
  - Runs coverage in reporting mode without failing threshold gates.

## Coverage Enforcement

Coverage is enforced module-by-module in Jest `coverageThreshold`, currently for:

- `src/engine/markov.js`
- `src/parser/expression.js`
- `src/utils/sanitize.js`

Global thresholds are set to 0 while remaining modules are incrementally brought under enforced thresholds.

## CI

GitHub Actions workflow:

- Path: `.github/workflows/ci.yml`
- Node matrix: `20.x`, `22.x`
- Enforced steps:
  - lint
  - unit tests with module coverage gates
  - reference validation
  - determinism check
  - performance benchmark
  - build

Artifacts uploaded per run:

- `reports/*.json`
- `coverage/**`

## Performance Thresholds

Threshold file: `benchmarks/performance-thresholds.json`

- Tune these values when model complexity materially changes.
- Keep changes audited in PRs.
- Treat threshold increases as exceptions requiring explicit rationale.

## World-Class Milestones

- By April 1, 2026:
  - Stable quality gates active on all PRs.
  - Determinism report attached to each merge.
- By May 15, 2026:
  - Expanded external reference fixtures and published validation report.
  - Documented delta analysis vs external implementations (R/TreeAge).
- By June 30, 2026:
  - v1.0 methods-grade release with reproducibility package, audit checklist, and benchmark history.

## External Comparator Format

`reference-models/<model>/external_reference.json`:

```json
{
  "version": "0.1",
  "model_id": "markov_simple",
  "comparators": {
    "r_reference": {
      "source": "R benchmark snapshot",
      "strict": true,
      "tolerance": {
        "costs": 0.01,
        "qalys": 0.0001,
        "relative": 0.001
      },
      "strategies": {
        "base": {
          "total_costs": 5395.176272793299,
          "total_qalys": 4.31614101823464,
          "life_years": 5.395176272793299
        }
      }
    }
  }
}
```

Comparator source file location guidance:

- R exports: `external-comparators/r/<model>/results.json`
- TreeAge exports: `external-comparators/treeage/<model>/results.json` or `results.csv`
