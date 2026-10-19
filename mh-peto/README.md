# MH / Peto Pooling

Mantel-Haenszel (OR, RR, RD) and Peto one-step odds-ratio pooling for binary outcomes, following the
conventions of metafor `rma.mh` / `rma.peto`: the pooled estimates use the counts as entered, with no
continuity correction. Per-study OR/RR add 0.5 to every cell of a table with a zero (display only).
meta::metabin's default (`MH.exact = FALSE`) adds 0.5 inside the MH estimate, so its result can differ.

What the page shows:

- MH and Peto pooled estimates with 95% CI, z and p; an estimate that cannot be computed (for example
  no events in one group in every study) is shown as "not estimable" with the reason.
- Cochran's Q, I² and H² for each method; for the odds ratio, the Cochran-Mantel-Haenszel test,
  Tarone's test and the Breslow-Day test, as printed by metafor.
- Per-study table, forest plot (with x-axis) and L'Abbé plot; a separate DerSimonian-Laird fragility index.
- Input checking: every line is either used or listed with its line number and reason (non-integer,
  negative, events larger than total, wrong number of values). Nothing is dropped or rounded silently.
- "Export self-checking R script": a .R file with the data, the matching `rma.mh` / `rma.peto` calls
  and the page's numbers; running it in R prints a PASS/FAIL comparison at 1e-9.
- "Validate this analysis in R" (webR, in the browser) and an offline replay of the published validation.

Part of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.

Live: https://mahmood726-cyber.github.io/allmeta/mh-peto/
