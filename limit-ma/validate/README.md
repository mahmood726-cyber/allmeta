# Limit meta-analysis validation

**Validate this analysis in R** runs the current rows with self-hosted webR 0.5.5, meta 8.3-0 and metasens 1.5-3. The paper used R 4.6.0, meta 8.5-0, metasens 1.5-3 and metadat 1.6-0. The panel shows both versions. All automated requests remain on the page origin; package archives are SHA-256 pinned. No package installation from the network occurs.

The live fit calls `meta::metagen(TE,seTE,method.tau='DL',method.random.ci='classic')`, then `metasens::limitmeta(m,method.adjust='beta0')`. Every exported FE/RE/limit estimate, SE, CI, tau/tau-squared, alpha.r, beta.r, slope, Q, Q.small, Q.resid, G-squared and shrunken study estimate is compared at `abs(App-R)/max(1,abs(R)) <= 1e-9`. Explicit null G-squared means the diagnostic is undefined. Missing or invalid evidence never passes. Invalid input lines are refused. Any R error, including non-convergence, is a validation error, not a pass.

**Replay published corpus (stored references)** runs the actual page on all 169 configurations, 113 datasets and 9852 effect rows. It includes table rendering, plotted study points, and the clipped rendered regression curve at 65 visible probes per successful reference configuration. It reports **55524/55525 passed; 1 failed**. The failed status is `dat.hartmannboyce2018::001`: metasens' internal REML refit refuses with `Fisher scoring algorithm did not converge. See 'help(rma)' for possible remedies.` The app returns a result. This refusal is never replaced by the diagnostic global-DL run (158/158 export checks).

Both corpus JSON files use LF bytes pinned in MANIFEST.json and the adapter. Exact cardinality, unique configuration keys, source-row identities, vector dimensions and numerical types are required before replay. The source reference is retained as a static oracle; app values are computed afresh. Replay locks input controls and restores pending edits, prior rendered results and axes without URL/history writes. After preparation, replay works offline; file users select the two corpus files.

The companion `limitma-reproducible` archive supports `Rscript validate.R` at its root with the paper package versions, jsonlite and digest installed. It checks SHA-256, refits every configuration, recomputes the R curve, writes `outputs/validate_R_table.csv`, and exits nonzero on unexpected failures, changed/disappearing documented refusal, wrong versions or coverage mismatch. Browser rendering evidence is replayed from the archive by this R command, not freshly rendered.

Scope: DL + beta0 only; no p-values displayed or compared. Plotting-only fixes do not alter estimates. Some package examples ignore dependence to test arithmetic, not clinical conclusions. No complete primary-oracle pass or release certification is claimed.

| Item | Static | Dynamic |
|---|---|---|
| Evidence | Pinned corpus, R reference, expected cardinality, tolerance | Page estimates, rendered geometry, differences and counts |
| Live check | Pinned package binaries and model specification | Current R fit and versions |
