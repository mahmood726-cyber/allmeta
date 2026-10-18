# Direct comparison: AllMeta local LR and ASReview

The new browser-local lexical ranker did **not** outperform ASReview ELAS u4 on these two public review datasets. ASReview achieved higher WSS@95 on every matched seed. This is a narrow retrospective comparison, not evidence of global superiority or feature parity.

Three prespecified seeds (101, 202, 303), full datasets, matched two-positive/two-negative oracle starting labels, batch size 10, title/abstract only. Starting labels count toward workload, but the effort to find those oracle seeds is not measured. The semantic option and protocol rules are off in this primary comparison. Seed ranges are descriptive, not confidence intervals or independent-review uncertainty estimates.

| Dataset (records; reference positives) | Engine | Mean WSS@95 (seed range) | Mean workload saved at 95% | Achieved recall / missed at 95% | Mean recall at 20% workload / missed range |
|---|---|---|---|---|---|
| Appenzeller-Herzog_2020 (3,453; 29 eligible) | screen-hybrid-lr-1 | 36.24% (36.18–36.27) | 41.24% | 96.55% / 1 | 89.66% / 3–3 |
| Appenzeller-Herzog_2020 (3,453; 29 eligible) | ASReview 3.0.8 ELAS u4 | 49.89% (49.79–50.08) | 54.89% | 96.55% / 1 | 89.66% / 3–3 |
| Kwok_2020 (2,481; 120 eligible) | screen-hybrid-lr-1 | 69.67% (69.41–70.21) | 74.67% | 95.00% / 6 | 90.83% / 11–11 |
| Kwok_2020 (2,481; 120 eligible) | ASReview 3.0.8 ELAS u4 | 71.60% (70.78–72.07) | 76.60% | 95.00% / 6 | 91.67% / 9–11 |

WSS@95 subtracts the 5% workload achievable by random ordering at a 95% target: `0.95 − screened/N`. Workload saved is `1 − screened/N`. The achieved recall can exceed 95% because eligible counts are integers. “Missed” means eligible reference records remaining at that retrospective point, not records automatically excluded by the application. Gold labels are used only when a selected record is revealed, and by the retrospective metric calculation.

## Evidence and limitations

- [Protocol](PROTOCOL.md), [source manifest](sources.json), [raw primary runs](results/summary.json), [repeated runs](repeatability/summary.json), and [code/data evidence hashes](evidence.json) preserve all configurations and complete screening orders. The shipped `hybrid-core.js` is called directly; the comparator uses installed ASReview 3.0.8, not a proxy implementation. Each seed is reported, with no outcome-based tuning.
- Repeating seed 101 reproduced the **entire screening order, metrics and model configuration exactly** for both engines on both datasets. This demonstrates same-environment repeatability, not identical floating-point behavior on every browser or machine.
- The Wilson CSV contains 29 eligible labels; its paper reports 26 reports (23 studies). This unresolved source difference is retained and disclosed, not “corrected.” The review had duplicate independent full-text screening, but not duplicate screening of every title/abstract. Kwok documents independent title/abstract review; neither dataset exposes a complete per-record adjudication log. These are public reference labels, not newly independently re-adjudicated gold standards.
- ASReview u4 was optimized on SYNERGY data. These datasets are not unseen domains for that comparator. Two review topics and three seeds are insufficient for general efficacy claims.
- Runtime seconds are preserved in each raw run. They are end-to-end algorithm wall time on an interactive machine, with other work and pauses during some runs. The repeated runs show substantial timing variation. AllMeta benchmark vectorization is reused between batches, whereas the UI currently rebuilds it. These timings are **not a controlled screening-speed comparison**, human reading time, usability evidence, or a browser throughput limit.
- MiniLM was tested with real WASM inference, semantic-relatedness fixtures, persistent vector reuse and offline fusion. Its incremental screening effectiveness is **unmeasured** here. Hardware WebGPU execution, multilingual accuracy and PICO extraction accuracy are also unvalidated.
- **Rayyan comparison, human screening speed and reviewer usability: unavailable.** No paid workspace, independent timed reviewers or fresh adjudication study was supplied. Documentation comparison is in [the workflow review](../UPGRADE-2026-10-18.md); it must not be substituted for measured comparative performance.

## Reproduce

Install the Python versions in `requirements.txt` and Node.js. From the repository root:

```text
python screen/benchmark/run.py
python screen/benchmark/run.py --seeds 101 --output screen/benchmark/repeatability
python screen/benchmark/summarize.py
```

The last command checks original CSV hashes, complete record permutations, independently recomputes metrics, verifies repeated orders/configuration, and regenerates this report. The first two commands can take many minutes. Model and dataset downloads are not part of the measured runs; both datasets are included with source attribution and their recorded CC-BY licenses.
