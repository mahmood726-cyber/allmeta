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
