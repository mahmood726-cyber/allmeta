# NMA validation adapter

The corpus is a lossless compact JSON packaging of `nma-reproducible`'s archived
`results/full/corpus.csv`, `results/full/netmeta.jsonl`, and
`expected/paper_values.json`. No R results were regenerated. The source checkout
has no `data/` directory. `MANIFEST.json` records both packaged-byte hashes and
source-file hashes. All 506 contrast records (including source study labels,
treatment order and numeric values) were checked against the hub parity fixture.
The R reference values come from the archived full run, not from the app output.

The 410 checks are 26 fit/refusal checks and 16 numerical families for each of the
24 successful analyses. The two Dong2013 refusals match acceptance status, not
literal error messages. Treatment names reindex matrices before comparison.
The comparison definitions are copied from `_nma_parity_check.mjs`: 1e-9 absolute
for probabilities, I-squared and P-scores; 1e-9 relative with denominator
`max(1, abs(reference))` for estimates, standard errors, intervals, Q and tau-squared.
`df` is absolute; decomposition combines relative Q/df and absolute probabilities.
Numerical failures report the family's maximum discrepancy against zero.
Every invocation runs the shipped `AlmNmaMultiarm.analyse`; no archived engine
results are bundled or replayed.

The shared widget verifies SHA-256 before calling `corpus.run`. Under `file://`,
select both JSON files in `validate/corpus` using its file selector. This is needed
because browsers restrict fetching local JSON. Once selected, the corpus works
without HTTP requests. Under HTTP(S), corpus resources are same-origin only.
The adapter itself makes no network requests.

Live validation snapshots the page's contrasts, reference, common/random model,
normal/t-based CI option, ranking direction and displayed scale. It calls the
page's `__almNmaCompute` (its parser and shipped engine), refuses malformed data,
and compares Q, degrees of freedom, Q p-value, tau-squared, I-squared and its CI,
reference contrasts (estimate, SE, CI, p), non-reference P-scores, and random-model
prediction bounds. This is a defined subset of the full corpus coverage; it does
not include design decomposition or all league-table cells. `sm="MD"` in R keeps
already-transformed contrasts on their entered analysis scale. Displayed estimates
and interval bounds are exponentiated explicitly when requested. Treatment columns
are swapped because the page uses treatment2 minus treatment1. `sprintf("%.17g")`
serializes finite R quantities into exactly one `ALMJSON:` record without jsonlite.

Live tolerance is 1e-6 absolute for every quantity. The pinned browser package is
netmeta 3.4-0; the paper used 3.7-0. The adapter supplies the widget's `paperVersions`
and a visible state note. Version differences never relax tolerance. A mismatch
is FAIL, with the version difference shown. Runtime package/R/webR versions come
from the shared runner. Missing framework/runtime assets are unavailability, not
successful validation. A paper DOI and specific Actions run were not present in
the inspected source metadata: DOI is null, and the link goes to repository Actions.

| Item | Static or dynamic | Evidence / transformation |
|---|---|---|
| Corpus contrasts and R references | Static archived evidence | Lossless packaging; source and packaged SHA-256 hashes |
| Paper count and tolerance | Static validation contract | `expected/paper_values.json`, parity helper and `make_outputs.py` |
| Browser results, counts, maxima and refusals | Dynamic | Shipped engine rerun for every corpus analysis |
| Live inputs and app results | Dynamic | Current page controls, parser and shipped engine |
| Live reference values and versions | Dynamic | Same-origin vendored webR/netmeta session |
| Browser/paper version annotations | Static expected metadata | Contract pins 3.4-0 / 3.7-0; runtime versions displayed separately |

`hub/shared/tests/validate-nma.spec.mjs` includes direct offline replay, an engine
perturbation check, widget buttons, file hash refusal, option-sensitive script
construction and live R (`@slow`, 180-second timeout). The shared framework is
integrated. Run with `hub/shared/tests/playwright.config.mjs` and `PW_CHANNEL=chrome`;
the configuration starts the loopback server on port 8088. See
`../../INTEGRATION_REPORT.md` for verified results and request logs.
