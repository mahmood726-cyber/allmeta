# Frozen browser U4 + SPECTER2 ranker

The frozen candidate is ELAS U4 TF-IDF plus appendDense(X, E, 768, 0.5).
rank-config.js pins engine u4, embModel specter2, embW 0.5, pooling cls,
maxTokens 256 and empty prefix. E is L2-normalized CLS output for
title + ". " + abstract, q8, batches of 32. Lexical features retain
title + " " + abstract. The original screen/h2h files are untouched;
rank-core.js SHA-256 remains
15b243065a14ecc6ce11ff3cc128d6bfa70b648a25f95116047245314100f252.

The local pack is our own ONNX export of allenai/specter2_base, Apache-2.0,
source revision 3447645e1def9117997203454fa4495937bfbd83.
export_provenance.json records exporter, quantizer, versions and hashes.
The quantized model is 110,115,365 bytes, SHA-256
2b1dc054c82e7ad6cf20456b11bee978416468c1af399383dbbd66b307d5748a.
Its committed parts are 90,000,000 and 20,115,365 bytes, each below 95 MB.
Config/tokenizer/vocab/special-token files add 947,483 bytes; runtime assets
are additional downloads shared with MiniLM. "110 MB" on the button describes
the rounded model size, not total transfer or browser storage usage.

Rebuild the split pack without placing a whole ONNX in the repository:
```
python screen/tools/split_model.py C:/h2h/local-models/local/specter2_base/onnx/model_quantized.onnx screen/vendor/semantic/models/specter2
```

The one SPECTER2 opt-in button installs parts from the app origin.
specter2-pack.js validates each part, total size and assembled SHA-256, with
the full digest pinned independently of parts.json. It places the assembled
model in transformers-cache under the exact local ONNX URL Transformers.js
checks. A mismatch removes that model and the optional pack cache, reports
a clear error and prevents inference. Cached parts are verified again on use.
Config, tokenizer and runtime assets are cached during opt-in too.
The service worker shell version is screen-shell-rankcore-4; no model parts
are mandatory shell assets. All model access is local; remote models are
disabled. MiniLM remains available through the existing advanced controls.

Inference attempts WebGPU, falling back to WASM on initialization or execution
failure. Pause/resume takes effect between embedding batches; an in-flight
batch finishes first. Download verification and model initialization are not
interruptible. Progress reports completed records, measured docs/s and ETA
from active batch time, excluding paused time and model installation.
Cached hits are included in that processing rate. Cache keys include the
model digest, settings, text and SPECTER2 batch context. Missing rows are
computed with their full batch to preserve quantized batch context.

U4 continues to rank with text features until every eligible nonduplicate
record has a matching 768-dimensional vector from this pack. The UI reports
"AI ranking: text model; semantic model preparing N/M". Completion makes
vectors available; it does not change an existing ranking. The next refit
uses the hybrid, including the next ordinary screening decision or explicit
Start AI ranking action. rank.run.variant and each scored record's rankVariant
record u4 or u4+specter2; run.semantic records model, digest, dimension and
weight. Text/project changes discard in-memory vectors; clicking opt-in again
can reuse matching persisted vectors. Human decisions are unchanged.

The worker imports the frozen core verbatim, uses balancedWeights ratio 9.8,
C=0.11 and seed=1, and requires two relevant and two irrelevant labels.
It refits cold with labels in record order. simulate uses chronological labels
and warm starts, so full-session order differences must be measured.
Request/worker/project identity and input snapshots reject stale rankings.
Scores are priorities, not probabilities.

## Host validation (no network needed with existing dependencies)

```
python -m unittest discover -s screen/tests -p test_rankcore_static.py
python -m unittest discover -s screen/tests -p test_specter2_pack.py
node --test screen/tests/rankcore.test.cjs
node screen/tests/specter2_parity.mjs DEV.csv --ref path/to/review.f32
node screen/tests/session_parity.mjs DEV.csv --priors priors.json --emb path/to/review.f32
cd tests/playwright
node node_modules/@playwright/test/cli.js test --config screen-workflow.config.mjs screen-specter2.spec.mjs screen-rankcore.spec.mjs
```

Embedding parity requires an installed Node @huggingface/transformers
(prefer 3.8.1 to match the vendored browser runtime), or --transformers with
an absolute path/file URL to its Node entrypoint. It reassembles and verifies
the pack into an OS temporary directory, uses CPU q8, and removes that copy.
It compares the first 50 CSV rows against the first 50 rows in the reference,
prints max absolute difference and minimum cosine, and exits 1 below 0.9999.
CSV needs title and abstract. Use "synthetic" instead of DEV.csv to use the
deterministic 50-record fixture; the reference must use that same fixture.
References are raw little-endian float32, row-major, 768 columns.

Session parity invokes the actual rank-worker handler for every cold refit
and compares it with ScreenRank.simulate. CSV needs binary label, included,
or relevant; optional id must be unique. Priors JSON is an ordered array of
unique zero-based row indices, or { "prior": [...] }, with 2+2 labels.
Optional --emb must cover exactly all rows in CSV order; benchmark vectors
are assumed to be the frozen SPECTER2 export for this measurement.
Both sessions stop when all relevant records are found. WSS@95 is
0.95 minus the fraction screened to reach ceil(0.95 * relevant count).
It prints the first divergence index (-1 for none), both WSS values and both
orders. Exit 0 always, including an explicit diagnostic on invalid input.

Playwright exercises actual pack installation/hash verification, a tampered
cached part that must fail closed, offline demo inference, unchanged human
decisions and switching from text to hybrid at the next refit. Allow up to
ten minutes for the real model test; no synthetic embeddings replace it.

## Validation and limits

Python static/core-pin checks and real-pack/splitter tests passed locally.
Node, Playwright and inference could not run in this sandbox. Git executables
also fail to start (0xC0000142); no commits, pushes or branch changes were made.

Host-measured CPU/WASM docs/s: TO BE MEASURED.
Host-measured WebGPU docs/s: TO BE MEASURED.
Cold model initialization, download, peak memory and cache quota: TO BE MEASURED.
Embedding max absolute difference/minimum cosine: TO BE MEASURED.
Full-session first divergence and WSS@95: TO BE MEASURED.

Not done: host inference/parity/performance validation, benchmark quality claims,
automated eligibility decisions, stopping-rule changes or full-text extraction.
Cache storage holds both split and assembled model bytes (about 220 MB before
runtime/tokenizer assets), and transient reconstruction/inference uses more RAM.
Storage eviction or quota failure requires another opt-in installation.
