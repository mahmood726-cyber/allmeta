# Browser-local hybrid screening implementation contract

This extends the staged workflow in PR #138. Reuse: `workflow.js` decisions, reviewer exchange, audit, PRISMA/Extract; current parser/dedup/keyboard flow; existing ranker as a labelled legacy baseline. New: transparent protocol matcher, worker-based TF-IDF/logistic regression, optional pinned MiniLM runtime, offline shell, independent audit bounds and an actual ASReview comparison harness.

Verified ingredients: `screen/index.html`, `screen/workflow.js`, `screen/tests`, `tests/playwright/screen-workflow.config.mjs`, existing compressed screening corpora and their provenance notes. Existing corpus documentation identifies redistribution uncertainty for Cohen abstracts; new benchmark inputs must have verified open provenance. Existing rounded comparator claims are not independent raw benchmark evidence.

Milestones:
1. Pure engine contracts and integration tests: bounded literal/synonym regex matching with evidence spans; deterministic sparse LR; fixed random audit sample and exact hypergeometric bound.
2. Same-origin, pinned optional Transformers.js/MiniLM assets in a worker; WebGPU attempt with WASM fallback; persistent model/vector cache; offline shell.
3. UI/state integration, full portable project settings, ranking-only decisions, blinded training, stale-result rejection, keyboard/offline/browser tests.
4. Source-pinned public datasets, actual ASReview runs under matched seeds/batches, raw trajectories and metrics; documentation, review, PR checks.

Benchmark reporting separates model replay from human screening speed/usability. The user authorized public datasets and unavailable-comparison disclosure. No Rayyan or human-usability values will be invented. Dataset-level dual adjudication must be supported by source methods; otherwise identify the gap. Retrospective replay does not establish prospective safety or global superiority.

| Item | Static/dynamic | Disclosure |
|---|---|---|
| Feature settings, seed list, alpha spending | Static protocol | Versioned before evaluation, not tuned to benchmark outcomes |
| Rules and synonyms | User-authored protocol | Matches are hints, not inferred eligibility |
| MiniLM weights | Pinned pretrained artifact | General embedding model, not a calibrated clinical classifier |
| Scores and audit bound | Dynamic computation | Uses actual imported records/labels; no automatic exclusions |
| Benchmark labels | External published datasets | Source/hash/license and adjudication provenance required |
| Benchmark metrics/runtime | Measured | No Rayyan or human usability substitution |

Stopping contract: sample without replacement from a frozen remaining population, require completion of the prespecified sample, invert the hypergeometric lower tail for an upper bound on remaining eligible records, and spend alpha across repeated audits. Normal screening changes invalidate the frozen audit. Local reviewer identity and exported history are not authenticated.
