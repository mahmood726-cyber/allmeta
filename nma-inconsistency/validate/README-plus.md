# nma-inconsistency plus panel: scope and R reproduction

The plus panel (`#alm-plus`) adds, on top of the replay-validated page engine:

- **A. Leave-one-study-out inconsistency sensitivity.** Each study is removed in turn and the whole analysis is refitted with the selected model; random-effects τ² is **re-estimated** for every refit. Reported per removal: τ², global design-by-treatment Q/df/p, ΔQ, number of node-splits, number with p < 0.05, p of every full-network split (or "not estimable"), and whether the global or any split result crosses 0.05. Removals that leave fewer than 3 contrasts or a disconnected network are refused with the page's own refusal text.
- **B. Self-verifying R script.** The panel writes a native-R script (netmeta + metafor) that refits the analysis, optionally with every leave-one-out refit, compares every number shown in the app with R and prints `allmeta check: N/N quantities match`; it exits with status 1 on any mismatch. Paule-Mandel τ² uses metafor's internal, **unexported** `.QE.func` (the uncentred generalised Paule-Mandel equation, as in the P16 oracle). Only native R is claimed; the script was not run in webR.
- **C. FE / DL / PM side by side, plain-language reading and Methods/Results text.** The interpretation never states that consistency is shown. Its wording was revised after an independent second reading by a different model (claude-sonnet-5-5).
- **D. Network graph.** One line per directly compared pair. Line width is proportional to the number of studies, and colour and dash show the node-split result. Lines are keyboard-focusable.
- **Usability.** One-click real-data examples (two-arm-only subsets of netmeta Baker2009 and Linde2015 from the P16 R corpus). A model change re-runs the analysis, and so does an edit to valid input after a 500 ms pause; Ctrl/Cmd+Enter also runs it. Invalid input is explained line by line, while the previous results are kept and labelled as such. A restored draft is analysed.

The core (`plus-core.js`) receives the page's own engine functions (`inputIssue`, `estimateTau2`, `fitNMA`, `nodeSplit`, `dbt`). It never calls `run()`, never reads or writes the validated result regions, and leaves the engine untouched. The base results therefore stay exactly those of the 4,627-check replay.

## Oracle

`generate-plus.R` refactors the per-configuration body of the archived P16 `reference.R` into `fit(d, model)`, which covers the same input gate, PM τ² root, `netmeta(tau.preset)`, `netsplit(method="Back-calculation", tol.direct=0)`, independent-path membership, `decomp.design(tau.preset=tau)` and Q=0/df=0/p=NA no-loop rule. Leave-one-out refits are `fit(d[-i,], model)`, with treatments recomputed per removal. The script stops unless every full-network fit matches the archived final P16 reference: membership must be identical and numbers must agree within 1e-12 relative.

Two execution details are recorded here because they change only speed and output order, never values:

- **C collation.** The archived references were produced in the C collation, and netmeta orders treatments and splits by collation. The script sets `LC_COLLATE=C`. Without it, the split order of Linde2015 differs from the archive.
- **Memoised settings lookup.** `meta:::gs()` is a pure settings lookup that took about 70% of netmeta's run time, so it is memoised. On the first configuration (29 refits), memoised and plain runs gave byte-identical drop-fits.

Corpus (`plus/corpus.json`, selected by `pin-plus.py corpus` from the archive): every accepted archived configuration with a closed loop (48 FE, 48 DL and 48 PM), plus the first three accepted no-loop configurations per model. That is 153 configurations and 5,016 refits, of which 4,896 are on configurations with loops. The loop configurations cover 25 distinct dataset/outcome/subset networks; most appear with two effect measures (OR/RR or MD/SMD), so the number of independent networks is 25, not 48. The FE/DL/PM comparison is checked against 97 archived accepted dataset triples (`plus/estimators-reference.json`, assembled from the final archived references; no new fit).
