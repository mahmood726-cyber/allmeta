# Leave-one-out limit estimate validation

This is a new tier, separate from the existing primary and sensitivity tiers.
It validates the optional `loo-limit.js` feature using freshly generated R
composite fits. No existing corpus, reference, manifest, or contract is changed.

`corpus.json` selects, in original order, every configuration with
`4 <= length(te) <= 200` from `../corpus/corpus.json`: 165 configurations and
5,304 study deletions from 109 datasets (observed k range: 4–186). It retains identifiers, definitions, source rows, effects,
and SEs. The source corpus SHA-256 and this tier's input/reference hashes are in
`MANIFEST.json`. The four excluded configurations have k = 389, 678, 1653, 1828.
The UI enforces the same 4–200 domain. No larger-k validation is claimed.

`generate.R` asserts and prints meta 8.5.0, metasens 1.5.3, metafor 5.2.1,
and jsonlite 2.0.0. For every omitted study it calls
`metasens::limitmeta(meta::metagen(..., method.tau="DL"), method.adjust="beta0")`.
It records limit estimate, limit SE, DL random-effects estimate and tau².
Errors become explicit refusals, with no filled numerical results. Each row
is flushed as a checkpoint. Optional worker arguments allow at most three
workers; merge their CSV rows in corpus/deletion order before pinning.

`r_lacks.R` and `r_lacks.log` demonstrate the R API distinction: meta 8.5.0
`metainf()` rejects a `limitmeta` object and metafor 5.2.1 has no applicable
`leave1out()` method. metasens 1.5.3 `limitmeta()` has no subset/influence
argument. **R can compose the same operation in a short loop.**

`replay.cjs` follows `../../tests/page-probe.cjs`: it evaluates the actual first
inline page script in a Node VM with minimal DOM stubs, loads the actual
`plus-opt.js` and `loo-limit.js`, and calls the production leave-one-out API.
The page bridge calls the same pure `limitMA(rows)` function as the main
analysis. The existing sensitivity engine's REML convergence check is applied
to each deletion. This is numerical and functional evidence, not browser
rendering or accessibility evidence.

`compare.py` checks both files against corpus identities, rejects missing,
extra, or duplicate rows, checks k and exact status, and compares all four
numerical fields using `abs(app-R)/max(1,abs(R)) <= 1e-9`. Refusals require
null numerical fields and the exact R error message. `defects.py` must reject
a relative 1e-8 estimate perturbation, a refusal changed into a number, and a
dropped row. Raw comparator failures are saved in `defect-*.log`.

Run from the repository root (PowerShell on the supplied node):

```powershell
$env:R_ENVIRON_USER='NUL'
$env:R_LIBS_USER='C:/Users/User/allmeta-offload/Rlib_dta'
$env:R_LIBS='C:/Users/User/allmeta-offload/Rlib_extra'
& 'C:/Program Files/R/R-4.6.0/bin/Rscript.exe' limit-ma/validate/loo/r_lacks.R
# Regenerate to a candidate file; do not overwrite the pinned reference.
& 'C:/Program Files/R/R-4.6.0/bin/Rscript.exe' limit-ma/validate/loo/generate.R limit-ma/validate/loo/corpus.json limit-ma/validate/loo/reference-candidate.csv
node limit-ma/validate/loo/replay.cjs
python limit-ma/validate/loo/compare.py
python limit-ma/validate/loo/defects.py
node limit-ma/validate/loo/test-feature.cjs
# Expected failure: all feature checks must fail when the feature is disabled.
node limit-ma/validate/loo/test-feature.cjs --disabled
```

The production output adds `leave_one_out` to the existing page JSON only
after calculation. Its `rows` contain study, one-based dropped index, limit
estimate, change from full limit, limit SE, RE estimate, DL tau², normal 95%
CI endpoints, status, and reason. A refused row has null numerical fields.
The dedicated CSV uses those columns in that order and prefixes dangerous
untrusted string cells with an apostrophe; signed numerical values stay numeric.
Editing input or rerunning analysis clears old rows. A validation snapshot
restores completed leave-one-out results after an independent replay.

Browser coverage is in `hub/shared/tests/limit-ma-loo.spec.mjs`: keyboard and
labels, built-in k rows and same-engine values, plot coordinates, genuine
convergence refusals, CSV/JSON downloads, stale-state clearing, domain limits,
and literal rendering of malicious study labels. Every spec requires the new
control/API, so each fails on origin/main. Set `LOO_DISABLE_FEATURE=1` to remove
the feature in the browser as a negative control. See the lane's `RESULT.md`
for actual run counts and any environment limitations; authored specs alone
are not claimed as browser passes.

Recorded results: 3/3 input hashes verified; 31,514/31,514 comparator checks;
5,304/5,304 deletion rows (5,148 successful and 156 refused); 3/3 planted
defects rejected; 12/12 Node feature checks, versus 0/12 with the feature
disabled and 0/12 against the original page. The regenerated reference's eight
shared columns match the feasibility probe exactly: 42,432/42,432 field values.
`compare_probe.py <probe.csv>` reproduces that diff. Maximum normalized errors
were 8.53e-14 (limit estimate), 1.64e-10 (limit SE), 2.84e-15 (RE estimate), and
5.80e-15 (tau²). Detailed outputs are saved beside this README.

Eight browser specs were authored but not executed: the sandbox rejected
browser launch with `spawn EPERM`. Browser rendering, keyboard operation and
actual downloads therefore remain pending manager execution.
