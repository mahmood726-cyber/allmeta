# Synthetic RevMan IPD (O-E and variance) fixture

`ipd.rm5` was written by hand for software tests. All study names, identifiers,
years and values are invented; they are not review data, trial records or
research results. It lives outside `fixtures/revman/` because `rchecks/revman.R`
requires that directory to hold exactly its manifest's files.

It has one comparison with a dichotomous outcome (`DICH_OUTCOME`/`DICH_DATA`) and
a time-to-event outcome in RevMan 5's O-E and variance form
(`IPD_OUTCOME`/`IPD_SUBGROUP`/`IPD_DATA` with `O_E` and `VAR` attributes), the
vocabulary read by `meta::read.rm5` (meta 8.5.0, `extract_outcomes`). One tag per
line, as RevMan writes it, because meta's reader is line-based.

`unit/alm-revman-ipd.test.mjs` parses it with `shared/alm-revman.js` and writes the
imported O-E, V and derived estimate/SE to ignored `rchecks-out/revman-ipd/`.
`rchecks/revman-ipd.R` reads the same file with `meta::read.rm5`, compares, and
must detect a planted wrong row before printing `R_CHECK_PASS`.
