# Benchmark corpora — provenance & licensing

These labelled systematic-review screening corpora are redistributed here **only**
to make the allmeta recall/dedup benchmarks reproducible offline. They are the
work of their original authors and the ASReview project, not of allmeta.

| File | Source review | Records | Included | Gold extras | License |
|---|---|---:|---:|---|---|
| `cohen_ace_inhibitors.csv` | Cohen AM, Hersh WR, Peterson K, Yen P-Y. *Reducing Workload in Systematic Review Preparation Using Automated Citation Classification.* JAMIA 2006;13(2):206–219. (ACE-Inhibitors drug-class review) | 2,544 | 41 | — | Custom open license (OHSU TREC genomics / drug-class review data, freely available for research) |
| `cohen_triptans.csv` | Cohen et al. 2006, *ibid.* (Triptans drug-class review) | 671 | 24 | — | Custom open license |
| `nagtegaal_2019.csv` | Nagtegaal R, Tummers L, Noordegraaf M, Bekkers V. *Nudging healthcare professionals towards evidence-based medicine: A systematic scoping review.* J Behav Public Adm 2019. | 2,019 | 101 | `duplicate_record_id` (11 author-labelled duplicate pairs) | **CC0 1.0** |

All three were obtained via the ASReview **systematic-review-datasets** collection
(`metadata-v1-final` branch), `https://github.com/asreview/systematic-review-datasets`,
which curated, deduplicated and label-verified them. See:

- ASReview datasets: De Bruin J, et al. *SYNERGY — Open machine-learning dataset on
  study selection in systematic reviews.* (2023). https://github.com/asreview/synergy-dataset
- Cohen 2006: https://dmice.ohsu.edu/cohenaa/systematic-drug-class-review-data.html
- Nagtegaal 2019: Harvard Dataverse, https://doi.org/10.7910/DVN/WMGPGZ (CC0)

## Why these

- **Cohen ACE-Inhibitors** is *the* canonical technology-assisted-review (TAR)
  benchmark and is topically a cardiology drug-class review — a natural fit for
  allmeta's audience. 41/2,544 (1.6 %) prevalence makes it a hard, realistic
  active-learning target.
- **Cohen Triptans** is small (671) so the in-CI assertion runs in seconds.
- **Nagtegaal** ships an author-curated `duplicate_record_id` column — real,
  human-labelled duplicate pairs — used as the gold set for dedup *recall*.

## How they are used

`benchmark/run_benchmark.mjs` drives the **shipped** Screen app code (via the
in-browser `window.__almScreenpro` hook, no re-implementation) over these corpora
and reports WSS@95, recall@k, and dedup recall/precision. Numbers land in
`../BENCHMARK.md`. The dedup *precision* / reformatted-duplicate stress test uses a
transparent perturbation protocol described in that script and in `BENCHMARK.md`.
