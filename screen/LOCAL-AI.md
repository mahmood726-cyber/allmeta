# Browser-local hybrid AI

The screening workflow keeps final decisions with human reviewers. Protocol matching, ranking and semantic similarity never write include/exclude decisions. The optional legacy cloud-inference client has been removed; the page's connection policy permits only its own origin. Existing file-based suggestion exchange remains an explicit export/import action.

## Components

- **PICO and eligibility evidence:** fixed, bounded structural regex cues extract literal population/intervention/comparator/outcome snippets. User protocol concepts support `require:`, `exclude:` and `prefer:` plus `|` synonyms. Terms are escaped as literal regex text, with Unicode word boundaries. Highlighting displays source spans and a simple nearby-negation cue. This is not a clinical entity extractor; absent text and negation cues require human interpretation. There is no automatic eligibility rule execution.
- **Lightweight learning:** deterministic, class-balanced L2 logistic regression over L2-normalized sublinear TF-IDF unigrams/bigrams. Vocabulary is transductive over available record text; only the current reviewer's labels are exposed while blind. A dedicated worker keeps fitting off the interface thread. Automatic retraining is opt-in and follows decisions. Changed text, reviewer, stage or settings invalidates scores; delayed stale results cannot overwrite the current ranking. The former Naive Bayes ranker remains available as a legacy baseline.
- **Optional semantics:** pinned quantized MiniLM-L6-v2, Transformers.js and ONNX Runtime assets are served from the app origin. The UI verifies SHA-256 before installing the optional cache. Inference runs in a module worker, trying WebGPU and falling back to single-thread WASM. Normalized 384-dimensional mean-pooled vectors use a 256-token window and an IndexedDB cache keyed by model/config/text hash. Semantic priority compares include and exclude centroids; the optional score is 80% LR plus 20% semantic priority. That weight is an engineering default, not empirically optimized or an accuracy claim. Its incremental benefit is not established by the primary lexical benchmark.
- **Offline and portability:** “Prepare offline use” caches the Screen shell; “Cache model and embed records” installs the optional model pack. After installation, these operate offline. JSON projects contain protocol rules, model configuration/latest fitted weights and label IDs, review decisions and audit history. Model assets and reusable vectors live separately in browser caches; another device needs the same optional model pack. Browser storage can be evicted or fill up; status remains explicit and backups remain necessary. Large projects are still limited by the inherited localStorage project envelope.

Full-text ranking uses title/abstract text; it does not read a linked PDF. Full-text eligibility requires the human to read the externally opened OA report. The inherited dual-reviewer, adjudication, duplicate, keyboard, RIS/CSV/JSON, PRISMA and Extract contracts remain in effect. Local identities/history are not authenticated or tamper-proof.

## Fixed-sample audit and stopping evidence

Freeze a prespecified sample of the remaining records after reconciling conflicts. A named separate auditor assesses the shuffled sample without ranking scores. The app records the population, sample IDs, crypto-generated PRNG seed, project fingerprint, requested sample size and labels. Sampling uses Fisher–Yates without replacement. No interim bound is shown, no sample size is extended after seeing results, and another audit cannot replace an incomplete unchanged sample. Project/protocol/decision changes invalidate its bound while retaining history.

For population size N, sample size n and x eligible sample records, the app inverts `P(X ≤ x | N, M, n)` to obtain an upper bound on the number M of eligible records in the frozen population. With F eligible records already found, the conservative recall lower bound is `F / (F + M_upper)`; newly discovered sample positives are not silently credited to the included set. Audit j uses alpha `0.05 / (j(j+1))`, summing to at most 0.05 across repeated audits. Only a completed sample with lower bound ≥0.95 supports the stated target under the assumptions.

The assumptions matter: representative sampling without replacement, prespecified sample size, correct reference decisions, complete audit history, no selective seed/project resets and follow-up of sampled eligible records. This does not validate earlier exclusions, the search strategy, duplicate identification, or unseen databases. Identities cannot be enforced locally. It is a statistical aid, not prospective clinical validation or an instruction to auto-exclude the remainder. SciPy oracle and exhaustive small-population coverage tests check the implementation. The hypergeometric sampling rationale is described by [Callaghan and Müller-Hansen](https://pmc.ncbi.nlm.nih.gov/articles/PMC7700715/); the fixed-sample, alpha-spending implementation here is explicitly specified above. The previous rank-sorted stopping heuristic remains excluded from guidance.

## Benchmark evidence

See [the prespecified benchmark protocol](benchmark/PROTOCOL.md), [source manifest](benchmark/sources.json), and [the generated comparison report](benchmark/README.md). Real final-inclusion labels are used without modification. Their adjudication and published-count limitations are recorded; they are not newly independently adjudicated by this project. The primary comparison runs the shipped lexical engine and actual ASReview 3.0.8 ELAS u4. Rayyan, human screening speed and reviewer usability are unavailable, not inferred from model timing. No parity or global-superiority claim follows from this implementation.

## Validation

Local validation of this hybrid milestone: 108 browser/integration tests passed, 40 Python tests passed (including numerical oracles and model-asset checksums), and 14 Node workflow/core tests passed. The 2,500-record synthetic load/filter/render fixture took 162 ms, against an 8-second regression threshold; this is a one-machine synthetic check, not reviewer speed. Two datasets × three seeds × two engines were run, with seed 101 repeated for exact-order equality. Remote CI and Overmind are separate release gates; this document does not imply either passed.

Use the environment pinned in `screen/benchmark/requirements.txt`:

```text
python -m pytest screen/tests -q -p no:cacheprovider
node --test screen/tests/workflow.test.cjs screen/tests/hybrid.test.cjs
```

From `tests/playwright`, run `node node_modules/@playwright/test/cli.js test --config screen-workflow.config.mjs`. This includes actual MiniLM WASM inference, vector-cache reuse, offline shell/model reload, rule highlighting, human-controlled decisions, sampling, and automatic retraining. Hardware WebGPU execution depends on the host; distinguish a real GPU pass from a fallback test.

| Item | Static/dynamic | Evidence boundary |
|---|---|---|
| Regex cues, LR hyperparameters, semantic fusion weight | Static software defaults | Not study findings or demonstrated accuracy |
| Quantized model/runtime | Pinned upstream artifacts | Manifest, licenses, checksums; no remote inference |
| Rankings, PICO spans, audit bounds | Computed from imported data and human labels | No automatic eligibility decisions |
| Benchmark measures | Actual seeded runs | Scope and missing comparisons remain explicit |
