# R Shiny / Shinylive Pilot

This directory contains three legacy R Shiny apps exported with Shinylive so they can run from GitHub Pages without a Shiny server.

The shared `shinylive/` runtime is intentionally vendored here so first-page load does not depend on a separate runtime host. Each app still runs client-side in the browser through webR, so uploaded data stays local to the browser session.

| Surface | Static or dynamic | Disclosure |
| --- | --- | --- |
| Shinylive runtime | Static vendored asset | Exported by `shinylive` 0.4.1 using Shinylive assets 0.10.8. |
| R package binaries | Static vendored asset | WebAssembly package binaries were downloaded during export and stored under `shinylive/webr/packages/`. |
| App source | Static app bundle | Original Shiny files are embedded in each app's `app.json`; no backend server is used. |
| User uploads | Dynamic browser input | CSV uploads are read by the browser-side R session and are not uploaded to a server. |
| Computed outputs | Dynamic browser output | Plots and tables are computed at runtime in webR. |

Pilot apps:

- `annualised-plot/` - annualised outcome plotting.
- `dta-diagnostic/` - diagnostic test accuracy summaries and ROC/AUC.
- `mean-single-group/` - single-group mean meta-analysis using `metafor`.

Known limits: first load is large, browser memory matters, and packages that depend on unavailable native system libraries may need refactoring before additional legacy apps can be converted.
