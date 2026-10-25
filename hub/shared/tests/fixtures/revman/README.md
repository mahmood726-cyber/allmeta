# Synthetic RevMan fixtures

All study names, identifiers, years and values in this directory were invented
for software tests. They are not review data, trial records, or research results.

- `multi.rm5`: two comparisons; dichotomous, continuous and generic IV outcomes;
  two subgroups per outcome; zero events and Unicode study names. Uses `CONT_*`
  and `IV_*` tags, child `NAME` elements, `NO` identifiers and study `YEAR`.
- `binary.csv`: multiple comparisons, a zero cell, IDs and years.
- `continuous.csv`: RevMan 5 named arm columns, including negative means.
- `generic.csv`: Web analysis-row columns; displayed ratios and weights are
  deliberately different from GIV inputs so tests detect accidental substitution.
- `malformed.rm5`: mismatched closing tags; must be refused.
- `pairwise.csv` and `pairwise-binary.csv`: five synthetic studies for native
  input/result parity in influence, limit-ma, GOSH, publication-bias tests and
  cumulative/subgroup analysis. The binary file includes a zero-cell study.

The unit suite also constructs tab-separated copy-table inputs, malformed and
ambiguous variants, quoted labels, numerical-overflow inputs, UTF-8/ZIP cases,
and exact export/import round trips. Fixtures contain no pooled expected results;
the browser suite compares imported inputs with typing the same values into each
application and proves that changing a value changes its output.

`settings.rm5` adds explicitly declared RevMan 5 `METHOD`, `RANDOM`, `LOG_DATA`
and confidence levels: ten synthetic generic studies (IV, random/DL) and two
binary studies (MH, fixed RR). No expected analysis results are stored.

`rcheck-cases.txt` enumerates every comparison/outcome/subgroup in the valid
fixtures. Continuous CSV rows are selected explicitly in the single-study
converter. Pairwise apps retain their existing refusal to pool a single study;
those cases check row/export fidelity and absence of a pooled result. The
converter's SMD and SE are checked per study, not as a meta-analysis.

The browser spec writes actual page results and downloaded CSV bytes to ignored
`rchecks-out/revman/`. The R gate reads the source fixtures independently, checks
exact study IDs, names, years and numeric rows, checks all three RevMan Web CSV
files, and compares the page's analysis to metafor at absolute tolerance 1e-6.
It must reject an arm-swapped copy of an actual downloaded export. Run tokens
prevent stale/partial browser output from passing. `--self-test` checks only the
checker and never prints `R_CHECK_PASS`.

The generic-IV reference fits set `control=list(tol=1e-12)` in metafor. Its
default PM root-finding tolerance (`.Machine$double.eps^0.25`) is too coarse
for these fixtures' required 1e-6 agreement in derived SE, I2 and intervals.
This tightens the reference calculation; the acceptance tolerance remains
1e-6. The gate also checks the PM fits against the exact two-study solution
and a zero-heterogeneity control before examining page evidence, and rejects
a perturbed statistic. See the [metafor solver controls](https://wviechtb.github.io/metafor/reference/rma.uni.html#note).

Import fills inputs and leaves native analysis controls to the user. The R
spec sets those controls explicitly. Fixtures without model settings use the
manifest's stated PM (generic), MH (binary), or single-study SMD choices; this
is not a claim that those absent settings were recovered from the source.

Schema reference: [meta's read.rm5 implementation](https://rdrr.io/cran/meta/src/R/read.rm5-internal.R).
The converter uses [metafor SMD with vtype=LS](https://wviechtb.github.io/metafor/reference/escalc.html),
matching its existing native method; it does not recreate a RevMan forest plot.
