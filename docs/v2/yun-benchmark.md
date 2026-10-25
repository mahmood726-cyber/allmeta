# Understanding the Yun benchmark harness

[Back to the guides](README.md)

The Yun harness evaluates the smart-entry extractor against annotated numerical results from open-access trial papers. It is a command-line evaluation for maintainers, not a clinical analysis or a button in the app. Attribution and licensing are in `validation/yun/README.md`; the runner is `validation/yun/run.mjs`, with tests in `validation/yun/metrics.test.mjs` and `hub/shared/tests/unit/yun-scoring.test.mjs`.

## What is measured

The runner gives the extractor the article text unchanged and the annotated outcome name. It then compares the returned candidates with the annotated values. The controlling amendment in `validation/yun/SCORING.md` separates these metrics:

| Metric | Meaning | Important limit |
| --- | --- | --- |
| PC-EXACT | Every required value from the first candidate matches the annotation in the assigned arm. | Missing values fail; the scorer cannot combine later candidates to improve the answer. |
| CANDIDATE-RECALL, printed as RECALL | Matching source-backed values occur somewhere in the candidate list for a person to find. | Arm order is free; continuous recall checks means and standard deviations, not group sizes. It does not mean the automated answer was correct. |
| PER-VALUE | The fraction of required numbers correctly returned by the first candidate after arm assignment. | Partial credit is possible, so it is not the same as getting a comparison right. |

Definitions and limitations are implemented in `validation/yun/run.mjs` and tested in `validation/yun/metrics.test.mjs`. Only PC-EXACT uses the per-comparison exact-match criterion discussed in `validation/yun/README.md`; recall and per-value accuracy must not be presented as that result. A DEV run or a run with unavailable texts is not a TEST head-to-head comparison.

## Run the development check

From the repository root, with Node available, run:

```sh
node validation/yun/run.mjs DEV
```

This command prints item diagnostics and the metric summaries. It uses the committed texts by default and writes no results file unless an output is requested. The runner also accepts a local text directory through --texts and a result destination through --out. The command and options are implemented in `validation/yun/run.mjs` and described in `validation/yun/README.md`; `validation/yun/metrics.test.mjs` exercises runner summaries with labelled synthetic test fixtures. Synthetic fixtures are test inputs, not benchmark findings.

The benchmark uses `shared/alm-entry.js`, but its scorer is tested by the Node tests above. `hub/shared/tests/features-entry-ux.spec.mjs` is the separate browser contract for reviewing extraction candidates and confirming their source in the app; it does not test or establish benchmark accuracy.

## Read failures and historical output correctly

The amendment at the end of `validation/yun/SCORING.md` controls scoring where it differs from the earlier text. Only items missing required annotation values are excluded. Missing article text, extraction errors and absent candidates remain failures in the denominator. Licence categories do not change eligibility. The committed text subset is restricted to CC-BY articles; other article licences are recorded in `validation/yun/licences.json`. Sources: `validation/yun/README.md` and `validation/yun/run.mjs`; denominator contract: `validation/yun/metrics.test.mjs`.

The current continuous extractor returns a single mean/standard-deviation arm per candidate without group sizes. Continuous PC-EXACT therefore fails even when candidate recall succeeds. That limitation is stated in `validation/yun/SCORING.md` and tested in `validation/yun/metrics.test.mjs`.

`validation/yun/dev.results.json` is historical candidate-recall output from before the scoring amendment, as identified in `validation/yun/README.md`; it is not an automated exact-match result. The benchmark documentation treats the public dataset as a comparison set and notes possible training contamination. Neither a successful extraction nor a benchmark score validates a treatment effect or removes the need to check the source paper.
