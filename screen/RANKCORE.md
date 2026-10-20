# Pinned browser U4 ranker

Start AI ranking now uses rank-worker.js, which imports h2h/js/rank-core.js verbatim.
Its required SHA-256 is
15b243065a14ecc6ce11ff3cc128d6bfa70b648a25f95116047245314100f252.
Neither that file nor run_js.mjs is modified.

Features use title + " " + abstract in eligible, nonduplicate record order.
The worker calls tfidf with ELAS_U4, balancedWeights with ratio 9.8,
trainSVM with C=0.11 and seed=1, and score. Only visible human labels are
sent; at least two relevant and two irrelevant records are required.
Undecided records sort by descending score then ascending record index.
After starting, each decision change invalidates scores and starts a fresh fit.
Request ids, worker identity, project identity and input snapshots reject stale results.
Fits start cold, with labels in record order; this does not reproduce simulate's
later warm-start optimization path or chronological prior order. The first-fit
fixture explicitly checks numerical/order parity for matching priors.

rank-config.js is the single configuration object for engine, embModel and embW.
A FREEZE manifest can name and hash it alongside the core. The shipped setting
is {engine:'u4', embModel:null, embW:0.5}: lexical-only. To freeze an embedding
candidate, set embModel to the existing local model id Xenova/all-MiniLM-L6-v2.
Only complete vectors for the exact current record text and matching model are
passed, in record order as Float32Array, through appendDense. That core normalizes
each vector before weighting it; this is feature concatenation, not score blending.
Until matching vectors exist, ranking is lexical and run.semantic is null.
The existing verified local model pack, revision and inference settings remain
unchanged. Config alone does not pin model bytes: include the existing model
manifest/revision in a freeze as well.

Advanced ranking trainers retains the logistic-regression hybrid and legacy
Naive Bayes controls. U4 has separate score fields and its own sort option.
The service-worker shell version is bumped and caches the exact core, config,
worker and UI. No remote calls or CSP relaxation were introduced.

Not done: benchmark runs, accuracy claims, automated eligibility decisions,
new model downloads, full-text extraction, or any stopping-rule changes.
Rank scores are priorities, not probabilities. Large-project memory/performance
and real WebGPU execution have not been validated here.

Host validation:
- node --test screen/tests/rankcore.test.cjs
- python -m unittest discover -s screen/tests -p test_rankcore_static.py
- from tests/playwright: node node_modules/@playwright/test/cli.js test --config screen-workflow.config.mjs screen-rankcore.spec.mjs

The Node fixture is entirely synthetic (__control_*). It checks actual worker
imports, the pinned SHA, first-fit simulate parity, stable ties, dense features,
input immutability, error replies and the 2+2 gate. Playwright checks the demo
flow, worker use, unchanged decisions, displayed top record and automatic refit.
