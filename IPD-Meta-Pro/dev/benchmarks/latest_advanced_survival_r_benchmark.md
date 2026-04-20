# Advanced Survival Benchmark vs R

- Cure scenarios: `cure_benefit, cure_plateau`
- Competing-risk scenarios: `competing_primary_benefit, competing_tradeoff`
- Seed: `12345`
- Overall pass rate: `1.000`
- Cure-model pass rate: `1.000`
- Competing-risks pass rate: `1.000`

## Tolerances

- Cure pooled fraction diff <= `0.02`
- Cure pooled logit diff <= `0.12`
- Cure pooled SE diff <= `0.06`
- Uncured HR log diff <= `0.18`
- Uncured HR SE diff <= `0.05`
- Competing-risk pooled log-SHR diff <= `0.005`
- Competing-risk pooled SE diff <= `0.005`
- Competing-risk pooled CIF-RD diff <= `0.005`
- Competing-risk combined Gray log-p diff <= `0.08`

## Rows

| Track | Dataset | Cause | Diff 1 | Diff 2 | Diff 3 | Pass |
|---|---|---|---:|---:|---:|:---:|
| cure_meta | cure_benefit | - | 0.013292 | 0.037174 | 0.013117 | YES |
| cure_meta | cure_plateau | - | 0.000973 | 0.151397 | 0.017311 | YES |
| competing_meta | competing_primary_benefit | cause1 | 0.000365 | 0.000105 | 0.069353 | YES |
| competing_meta | competing_primary_benefit | cause2 | 0.000167 | 0.000051 | 0.028665 | YES |
| competing_meta | competing_tradeoff | cause1 | 0.000173 | 0.000128 | 0.047731 | YES |
| competing_meta | competing_tradeoff | cause2 | 0.000455 | 0.000136 | 0.067567 | YES |
