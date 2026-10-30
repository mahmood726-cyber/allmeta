# Synthetic RevMan legacy-reader fixture

`legacy.rm5` was written by hand for software tests. All study names, identifiers,
years and values are invented; they are not review data, trial records or
research results. It lives outside `fixtures/revman/` because `rchecks/revman.R`
requires that directory to hold exactly its manifest's files.

It exercises the legacy reader `shared/revman-reader.js` (used by
`revman-importer`) with RevMan 5's own vocabulary, as read by `meta::read.rm5`
(meta 8.5.0, `read.rm5.rm5` / `extract_outcomes`): `CONT_OUTCOME`/`CONT_DATA`
(n in `TOTAL_1`/`TOTAL_2`), `IV_OUTCOME`/`IV_SUBGROUP`/`IV_DATA` (`EFFECT_SIZE`,
`SE`, `<EFFECT_MEASURE>` child), `DICH_OUTCOME`, `IPD_OUTCOME`, child-element
`<NAME>` / `<GROUP_LABEL_1>` / `<GROUP_LABEL_2>`, and `STUDY YEAR`. One tag per
line, because meta's reader is line-based.

Planted invalid rows (deliberate; the reader must list each in its outcome's
`skipped` list, never drop it silently): CONT `STD-Leg-D` SD_1 = 0,
`STD-Leg-E` no MEAN_2, `STD-Leg-F` SD_2 < 0 and TOTAL_2 = 0; IV `STD-Leg-C`
SE = 0, `STD-Leg-E` no SE; DICH `STD-Leg-F` no TOTAL_2; IPD `STD-Leg-C` VAR = 0.

`unit/revman-reader-legacy.test.mjs` parses it and writes the imported and
skipped rows to `rchecks-out/revman-legacy/`; `rchecks/revman-legacy.R` reads the
same file with `meta::read.rm5`, compares, and must detect two planted defects
before printing `R_CHECK_PASS`.
