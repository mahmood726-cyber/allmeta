# Yun et al. 2024 benchmark harness (F1 smart data entry)

Source and attribution: Yun HS, Pogrebitskiy D, Marshall IJ, Wallace BC. *Automatically Extracting
Numerical Results from Randomized Controlled Trials with Large Language Models* (2024),
arXiv:2405.01686v2. Annotations and code: `hyesunyun/llm-meta-analysis`, at the commit in
`PINNED_SHA.txt`, licensed Apache-2.0. Preserve upstream attribution and licence notices when
redistributing. The dataset contains 699 intervention-comparator-outcome comparisons from 120 OA
RCTs: 10 DEV / 110 TEST articles, or DEV 43 / TEST 656 items.

Scoring is frozen in [SCORING.md](SCORING.md), including **Amendment 2026-10-21, made before any
TEST run, no tuning**. This lane runs DEV only.

```sh
node validation/yun/run.mjs DEV
node validation/yun/run.mjs DEV --texts /path/to/full/md --out validation/yun/dev.results.json
```

## Three metrics

The whole article markdown is passed unchanged to `AlmEntry.extract(text, schema, {outcome})`.
Extraction and candidate ranking receive only the outcome string from the item. The automated
answer uses the first returned candidate, with arms assigned using case-insensitive token overlap
between returned arm cues/labels and intervention/comparator names. The assignment with greater
summed overlap wins; ties or no overlap retain printed order. Full details are in SCORING.md.

- **PC-EXACT**: automated per-comparison exact match. Every gold number must match the rank-1
  candidate in the correct arm: both arms' events and group sizes for binary, or means, SDs and
  group sizes for continuous. Missing fields or no candidate fail.
- **CANDIDATE-RECALL** (printed as RECALL): human-in-the-loop coverage, with gold offered anywhere
  among candidates and arm order free. Binary requires both events/group-size pairs; continuous
  retains the original mean/SD-only criterion using two distinct candidates. Literal source spans
  are required. Rank statistics, candidate burden and confusable candidates describe user effort.
- **PER-VALUE**: fraction of all gold numbers in eligible items equal to the rank-1 candidate's
  arm-assigned values. Each binary item contributes four numbers, each continuous item six.

**Only PC-EXACT is comparable to Yun et al.'s GPT-4 per-comparison exact-match rates (65.5% binary /
48.7% continuous on TEST).** RECALL and PER-VALUE must not be compared to those rates. A DEV result
or a run with unavailable article texts is not a full TEST head-to-head result. The current continuous
extractor returns one mean/SD arm per candidate without group sizes, so continuous PC-EXACT fails
regardless of whether the human-in-the-loop recall criterion passes. No candidates are combined for
the automated answer.

Only items with incomplete gold numbers are excluded (`GOLD_INCOMPLETE`, reported separately).
Missing texts, extraction errors and no candidates stay in the denominator and fail; they contribute
zero correct numbers to PER-VALUE. The `is_data_complete` flag alone does not determine eligibility.
Original recall miss categories and rank diagnostics remain available.

## Interpretation and future primary test

This dataset has been public since 2024 and is a **comparison set only**, not our primary test.
Possible LLM training contamination limits interpretation of comparisons on it. A fresh post-cutoff
trial set will be the primary test in a future study. No TEST items were inspected or scored for this
amendment, and no extraction or ranking rules were tuned.

## Licences and attribution

The annotations are Apache-2.0 with attribution to Yun and colleagues and the upstream repository.
Article texts retain their own per-article licences; the annotation licence does not cover them.
`licences.json` records the Europe PMC article licences: 72 CC-BY articles, with NC/ND/SA variants or
no listed licence for the remainder. **Only CC-BY article texts are committed**, with article
attribution and licence information retained. No article texts were added or changed in this amendment.

The default `texts/` directory contains the committed CC-BY texts. Other items report `NO_TEXT` and
remain failures in the denominator. For complete DEV text coverage, use `--texts` with a local folder
of `PMC<id>.md` files. Only articles belonging to the requested split are opened. Results include
per-licence breakdowns of all three metrics; licence does not alter scoring or eligibility.

## Files

- `run.mjs`: scorer and runner, including separate automated and recall results.
- `SCORING.md`: original specification and the controlling pre-TEST amendment.
- `metrics.test.mjs` and `hub/shared/tests/unit/yun-scoring.test.mjs`: synthetic unit tests, including
  a planted scorer that ignores arm assignment and fails the swapped-arm gate.
- `data/annotated_rct_dataset.json`, `licences.json`, `PINNED_SHA.txt`: unchanged upstream inputs.
- `texts/PMC*.md`: unchanged CC-BY article texts.
- `dev.results.json`: historical pre-amendment DEV candidate-recall results; not a PC-EXACT result.
