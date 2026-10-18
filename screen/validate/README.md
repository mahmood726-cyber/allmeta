# Screen validation adapter

The adapter calls `window.__almScreenpro.simulateActiveLearning` from the loaded
Screen page. It does not implement or substitute a ranker. Inputs preserve source
row order, titles, abstracts and labels. The protocol is
`{records, batch: 1, rngSeed, buscar: true}`: 20 initial randomly selected records,
both classes forced present, then per-record retraining. Seeds are
101, 202, 303, 404, 505, 606, 707, 808, 909 and 1010.

Full mode runs 19 datasets x 10 seeds = 190 simulations. Available published
references support 29 comparisons: 19 WSS@95 dataset means and ten summaries
(WSS mean, median, minimum, maximum, Cohen mean, SYNERGY mean, three recall percentages and the number of datasets where Buscar never fired).
**190 is not a count of independently reference-checked results.**
The supplied source checkout has no `results/full/` directory, so per-seed
expected outputs cannot be packaged or independently checked.
The complete original `expected/paper_values.json` is retained in
`corpus/reference.json`; ASReview, de-duplication and comparative
statistical claims are not counted as validated.

Quick mode runs seed 101 on cohen_antihistamines, cohen_estrogens,
cohen_nsaids and cohen_urinaryincontinence, using the independent stored
`expected/quick_values.json` values. It performs four comparisons. It is explicitly
a subset, not a reproduction of the full paper. Full is the default.
The progress bar advances between simulations; remaining time is estimated from
elapsed runtime. Individual synchronous calls to the existing ranker can take
seconds and temporarily occupy the main browser thread.

## Reference and integrity rules

A comparison passes only if the result rounds to the exact published number at
the source's specified decimal precision (the original decimal precision in full mode, four places in
quick mode). Half the decimal unit is displayed as the tolerance, but the exact
rounding decision controls PASS/FAIL. A universal 1e-6 comparison would be
invalid for references supplied only to three decimal places.

Tier 2 reuses the 19 existing `../../benchmark/data/corpora/*.csv.gz` files.
`MANIFEST.json` and `pins.js` pin the compressed bytes by SHA-256; the
`corpus/reference.json` pin is unchanged. Hashes are checked before decompression
or any simulation. `DecompressionStream('gzip')` decompresses the CSV; parsing
preserves quoted commas, escaped quotes, embedded newlines, row order, titles,
abstracts and the benchmark's trimmed `label_included === '1'` mapping.
Missing files, changed bytes, missing columns and mismatched counts are refused.

Before deleting the duplicate JSON datasets and `offline.js`, all 35,432 ordered
[title, abstract, label] triples across 19 datasets were compared exactly with
the old packaged records. Uncompressed CSV hashes also matched each package's
source hash. Evidence and the original verification procedure are retained in
`../../integration-evidence/screen-corpus-parity.json` and
`../../integration-evidence/verify-screen-corpora.mjs`. The procedure requires the
legacy JSON inputs and original manifest from before this change. `benchmark/data/SHA256SUMS` was not
present in this checkout.

HTTP mode fetches same-origin files only. No remote resources, Python service
or R package are used by validation.

## Framework integration

Mount with `AlmValidate.mount(el, ScreenValidationAdapter)`.
The adapter is available globally immediately; await
`ScreenValidationAdapter.ready` before use. It initializes its manifest pins and
calls the shared mount itself. `corpus.run(files, onProgress)` accepts a path-keyed
object or Map of compressed CSV bytes and reference JSON text/bytes/parsed objects. Progress uses
`{done, completed, total, message, elapsed, etaSeconds}`.
Returned contract fields include checks, passed, failed, maxima, refusals and
summaryLines; extra fields retain every comparison and actual simulation.

For direct execution:

```js
const a = await ScreenValidationAdapter.ready;
a.corpus.mode = 'quick'; // or 'full'
const result = await a.corpus.run(await a.corpus.loadFiles(), console.log);
```

The shared widget is integrated. Its loader preserves pinned binary bytes,
accepts progress objects and reports quick mode separately from the full paper
scope. See `../../INTEGRATION_REPORT.md` for verified results and request logs.
For `file://`, use the shared file picker to select all 19 `.csv.gz` files from
`benchmark/data/corpora/` and `reference.json` from `screen/validate/corpus/`.
Because those files live in two directories, you may copy them into one temporary
folder for a single multi-file selection. Click **Re-run full validation** after
choosing full or quick mode. No bundled offline copy is needed. Direct callers
can pass the selected `File` objects to
`AlmValidate.loadFiles(a.corpus.files, selectedFiles, true)` and pass the returned
bytes to `a.corpus.run(files)`. The direct `loadFiles()` example above is for HTTP.
Quick mode has four checks versus the full paper's 29 Screen comparisons; its
scope must not be labelled a full-paper PASS.

`live: null` is intentional. Screen's comparator is ASReview (Python).
The honest link text is **R check available via the reproducible repo**.
No buildScript, fake ALMJSON line or R PASS rows are supplied. This follows the
contract's explicit Screen exception, which supersedes the generic live-R
instructions in the lane task.
The current page's built-in example is SGLT2, not Wilson disease; the complete
Wilson disease review is the corpus dataset appenzeller_herzog_2020.

## Data provenance and release limitation

Read SOURCE-README.md and SOURCE-ATTRIBUTION-allmeta.md, copied unchanged from
the reference checkout. The four SYNERGY corpora are CC-BY 4.0. The upstream
source documents unconfirmed redistribution rights for the 15 Cohen MEDLINE
abstract datasets. Allmeta already ships these files under `benchmark/`; this
validation now reuses them rather than adding copies. This change does not
resolve the upstream rights note. Nothing has been committed or published.

## Hardcode disclosure

| Item | Static or dynamic | Evidence/purpose |
|---|---|---|
| Expected values, dataset labels, sources, counts | Static source data | Original expected JSON and corpus manifest |
| Seeds, quick subset, per-record protocol | Static protocol | Source bench/run_screen.mjs and quick references |
| 190 simulations, 29/4 comparisons | Derived scope | 19 x 10; 19 dataset + 10 summary checks; quick subset |
| Model results, means, errors, PASS/FAIL | Dynamic | Current page's shipped simulator, never stored substitutes |
| Runtime and ETA | Dynamic | Measured in the current browser |
| R availability | Static unavailable | Python comparator; live:null |

The DOI in adapter.paper is the source repository archive DOI, not an invented article DOI.
