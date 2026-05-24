# shared/vendor — vendored CDN dependencies (V9-E07)

This directory holds copies of third-party JavaScript libraries that were
previously loaded from public CDNs. Vendoring closes the "fully offline"
claim — without it, the apps in `Truthcert1`, `IPD-Meta-Pro`, `HTA`,
`nma-pro-v2`, `nma-dose-response-app`, and `dosehtml` would fail without
network access despite shipping a service worker.

## Contents

See `manifest.json` for the canonical record (filename → source URL →
SHA-384 SRI hash → byte size). Every consumer references its dependency
via:

```html
<script src="../shared/vendor/<file>"
        integrity="sha384-<hash>"
        crossorigin="anonymous"></script>
```

The browser refuses to execute a script whose SRI doesn't match — so a
silent on-disk corruption of any vendored asset is loud rather than quiet.

## Refresh procedure

```sh
python scripts/vendor_cdn_assets.py            # download missing files
python scripts/vendor_cdn_assets.py --force    # re-download everything
```

The script writes `shared/vendor/manifest.json` with new SRI hashes. If
the hashes change, every consumer's `integrity="…"` attribute must be
updated to match (otherwise the browser blocks the script).

## Apps that consume these files

| Lib                          | Apps                                                |
| ---------------------------- | --------------------------------------------------- |
| `plotly-2.27.0.min.js`       | Truthcert1, dosehtml/dose-response-pro-v19.0        |
| `plotly-2.35.0.min.js`       | nma-pro-v2/nma-pro-v8.0                             |
| `jspdf-2.5.1.umd.min.js`     | Truthcert1, IPD-Meta-Pro/Submission                 |
| `html2canvas-1.4.1.min.js`   | Truthcert1                                          |
| `xlsx-0.18.5.full.min.js`    | Truthcert1, IPD-Meta-Pro/Submission                 |
| `jszip-3.10.1.min.js`        | HTA, HTA/Submission                                 |
| `chart-4.4.1.umd.min.js`     | HTA, HTA/Submission, nma-dose-response-app(+/Submission) |
| `d3-7.9.0.min.js`            | HTA, HTA/Submission                                 |
| `docx-7.1.0.js`              | nma-dose-response-app, nma-dose-response-app/Submission |

`Pairwiseai/_archive/`, `dosehtml/archive/`, and every `e156-submission/`
folder are intentionally NOT touched — they are frozen historical copies
of submitted artifacts.
