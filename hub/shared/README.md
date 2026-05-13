# hub/shared/ — reusable UX modules

Each module attaches one property to `window.alm` (allmeta namespace).
Apps include via `<script src="../hub/shared/<module>.js">` before their
own inline script. No build step, no CDN.

Modules:
- csv-upload, chart-download, axis-controls, results-export,
  url-state, reset-undo, tooltips (+ glossary.json)

Module API: each `window.alm.<name>` is a callable that also carries
methods (init via call, imperative API via dotted access).

See `docs/superpowers/specs/2026-05-13-cycle-2.1-flagship-hardening-design.md`.
