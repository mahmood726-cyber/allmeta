# RoB benchmark corpus — RoBBR

**Gold labels** for the allmeta `/rob/` Risk-of-Bias auto-suggestion benchmark.

## Dataset

**RoBBR — Risk of Bias Benchmark** (Measuring Risk of Bias in Biomedical Reports).
- Paper: Lou, Tao, et al. *Measuring Risk of Bias in Biomedical Reports: The RoBBR Benchmark.* EMNLP 2025 (main). arXiv:2411.18831. <https://aclanthology.org/2025.emnlp-main.160/>
- Data: <https://huggingface.co/datasets/RoBBR-Benchmark/RoBBR> · Code: <https://github.com/RoBBR-Benchmark/RoBBR>
- **License: CC-BY-NC 4.0** (dataset). Redistributed here for non-commercial research reproducibility, with attribution, per that licence. allmeta is a free/non-commercial open research toolkit.

Each record = one (paper × bias-domain) judgment. Fields: `paper_doi`, `bias`
(Cochrane Handbook RoB-1 domain name), `bias_definition` (Handbook low/high/unclear
criteria; present in the full Cochrane test only), `PICO`, `objective`, `full_paper`
(full text), `label` ∈ {`low`, `high`, `unclear`}. Gold labels are the published
Cochrane review authors' RoB-1 judgments, extracted by the RoBBR team.

## Files

| File | Committed | Records | Papers | Notes |
| --- | --- | --- | --- | --- |
| `Main_task_Cochrane_test_RobotReviewer_subset.json[.gz]` | ✅ (gz) | 99 | 69 | The exact subset on which the RoBBR paper benchmarks RobotReviewer — 4 RR-assessable domains only. **The head-to-head set.** |
| `Main_task_Cochrane_test.json` | ✗ (fetch) | 906 | 127 | Full Cochrane test, all 6 canonical domains + outcome-specific/ROBINS-I variants. |
| `Main_task_Cochrane_train.json` | ✗ (fetch) | 774 | 83 | Used only to sanity-check rule calibration (rules are derived from the published Handbook, not fitted to labels). |

Large files are **git-ignored** and fetched on demand:

```
node benchmark/fetch_rob_corpus.mjs        # downloads train + full test (+ RR subset)
```

The 3.7 MB RobotReviewer subset is committed gzipped (~1.1 MB) so the headline
head-to-head reproduces from a fresh clone without network.

## RobotReviewer published baseline (the bar to beat)

RoBBR paper, **Table 8** — Main Task on the RobotReviewer subset. Binary judgment
(`low` vs `high`/`unclear`, per RobotReviewer's specification), metric **Macro-F1**,
± 95% CI. See `robotreviewer-baseline.json`.

| Model | Avg | AllocConceal (n=32) | BlindOutcome (n=19) | BlindPart (n=18) | RandSeq (n=30) |
| --- | --- | --- | --- | --- | --- |
| **RobotReviewer** (Marshall 2016) | **56.7 ± 8.4** | 75.0 | 39.1 | 43.8 | 68.9 |
| LR (Dias 2025) | 53.1 ± 9.7 | 71.9 | 50.4 | 51.8 | 38.4 |
| SVM (Dias 2025) | 44.8 ± 8.6 | 45.9 | 55.2 | 41.9 | 36.0 |
| GPT-4o | 65.6 ± 8.5 | 83.6 | 59.1 | 41.9 | 77.8 |
| Claude Sonnet-3.5 | 67.5 ± 8.4 | 77.0 | 82.5 | 41.9 | 68.8 |

The RoBBR authors note the 4 RR domains are "considered straightforward because
superficial keywords often directly indicate bias risk (e.g. 'opaque envelope',
'random number generator')" — i.e. a deterministic phrase model is a legitimate,
expected approach for these domains.
