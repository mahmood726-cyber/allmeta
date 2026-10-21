# Yun et al. 2024 benchmark harness (F1 smart data entry)

Source: Yun HS, Pogrebitskiy D, Marshall IJ, Wallace BC. *Automatically Extracting Numerical Results from
Randomized Controlled Trials with Large Language Models* (2024). Code and annotations:
`hyesunyun/llm-meta-analysis` at the commit in `PINNED_SHA.txt` (Apache-2.0). 699 ICO items from 120 RCTs,
split DEV 43 / TEST 656. Scoring rules: [`SCORING.md`](SCORING.md) (frozen before any TEST run).

```
node validation/yun/run.mjs DEV                                   # CC-BY subset committed here (CI)
node validation/yun/run.mjs DEV  --texts /path/to/full/md         # all 120 article texts, local only
node validation/yun/run.mjs TEST --texts /path/to/full/md --out validation/yun/test.results.json   # held-out, pending freeze
```

## What is measured — and what is not

Each item's whole article markdown (abstract + results, tables as space-aligned text) is passed to
`AlmEntry.extract` as one paste. This simulates a user pasting the results section; nothing is trimmed
or pre-selected. The only item field passed in is the `outcome` string the user would type.

F1 does not answer on its own: it lists ranked **candidates** with source spans and the user picks one and
maps the printed arms to intervention/control. The harness therefore measures **candidate recall** — whether
the gold per-arm numbers are offered, verbatim, with spans that slice to the printed numbers — plus the rank
at which they appear and how many differing candidates sit above them (**CONFUSABLE**, the risk the user picks
a wrong one). No "tool answer" is ever computed and no WRONG_VALUE accuracy is reported.

Yun et al. report GPT-4 **end-to-end** exact-match accuracy (65.5% binary / 48.7% continuous on TEST): the model
reads the article and outputs final numbers, including values it derives (events from percentages, SD from SE).
F1 never derives numbers and always needs a human choice. **These numbers are not a head-to-head accuracy
comparison** and must not be presented as one. In particular, continuous mode does not offer group sizes, so the
continuous recall here covers mean and SD only (`continuous_with_n` is reported as 0/N for transparency).

Items whose gold is incomplete (Yun's `is_data_complete` / empty fields) are `GOLD_INCOMPLETE` and excluded
from N. Misses are put in exactly one category: `PERCENT_ONLY`, `SD_SE_AMBIGUOUS`, `NOT_FOUND`,
`IN_TABLE_LAYOUT`, `SPLIT_ACROSS_SENTENCES`, `OTHER` (definitions in `SCORING.md`).

## Licences

`licences.json` lists the Europe PMC licence of each article: 72 are `cc by`, the rest are NC/ND/SA variants
or none listed. **Only the 72 CC-BY article texts are committed** (`texts/`). The gold annotations
(`data/annotated_rct_dataset.json`, Apache-2.0) are committed whole. Without `--texts` the runner reads `texts/`,
and items whose article is not present are reported as `NO_TEXT` (excluded from N); this is the CI mode. With
`--texts` pointing to a local folder holding all 120 `PMC<id>.md` files it scores every item. Results are always
broken down by licence group (`cc by` vs other); licence never changes scoring.

## Files

- `run.mjs` — runner (`scoreItem`, `run`); unit tests with planted defects in
  `hub/shared/tests/unit/yun-scoring.test.mjs`.
- `SCORING.md` — frozen scoring spec.
- `data/annotated_rct_dataset.json`, `licences.json`, `PINNED_SHA.txt` — upstream inputs, unmodified.
- `texts/PMC*.md` — the 72 CC-BY article texts, unmodified.
- `dev.results.json` — DEV run on all 120 texts (numbers and categories only; no article text).
