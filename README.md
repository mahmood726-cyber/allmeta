# allmeta

[![Pages](https://github.com/mahmood726-cyber/allmeta/actions/workflows/pages.yml/badge.svg)](https://github.com/mahmood726-cyber/allmeta/actions/workflows/pages.yml)
[![shared-tests](https://github.com/mahmood726-cyber/allmeta/actions/workflows/shared-tests.yml/badge.svg)](https://github.com/mahmood726-cyber/allmeta/actions/workflows/shared-tests.yml)
[![Playwright](https://github.com/mahmood726-cyber/allmeta/actions/workflows/playwright.yml/badge.svg)](https://github.com/mahmood726-cyber/allmeta/actions/workflows/playwright.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20516880.svg)](https://doi.org/10.5281/zenodo.20516880)

Open, browser-only tools for evidence synthesis.

**Live:** https://mahmood726-cyber.github.io/allmeta/

A catalog of research tools for systematic review, meta-analysis, trial design, diagnostic test accuracy, risk-of-bias assessment, GRADE, PRISMA, TSA, and clinical decision support. Each app is self-contained HTML + JS + CSS. No backend. Data stays on your device.

## Run it locally

```bash
git clone https://github.com/mahmood726-cyber/allmeta
cd allmeta
python -m http.server 8080
```

Open http://localhost:8080.

## What's inside

The hub lists 103 catalog entries — 97 repository-hosted browser apps (including the R/Shinylive pilot exports from the legacy Shiny portfolio) and 6 externally hosted apps.

## Cross-tool study bus — `ma-studies-v1`

Extract once, pool everywhere. Apps share study-level effect rows through a
single `localStorage` envelope so the user never re-types data. See
[`shared/ma-studies-v1.md`](shared/ma-studies-v1.md) for the formal spec and
[`shared/ma-studies-v1.js`](shared/ma-studies-v1.js) for the canonical helper.

## Accessibility

- Skip-link + `prefers-reduced-motion` + `:focus-visible` across the hub and all apps.
- Windows High Contrast / `forced-colors: active` mode — see
  [`shared/forced-colors.css`](shared/forced-colors.css). Injected portfolio-wide
  via [`scripts/add_forced_colors.py`](scripts/add_forced_colors.py).
- iOS Safari auto-zoom defeated (`font-size: 16px` on inputs at ≤640 px).

## Testing

- Pytest harness at the repo root (`tests/`) including the cross-tool bus
  contract (`tests/test_ma_studies_v1.py`). Run with `python -m pytest tests/`.
- Per-app pytest in each `<app>/tests/` directory — R-parity, behavioural specs,
  contract drift guards.
- Playwright pre-flight (`tests/playwright/`) screenshots every internal app
  and checks for a rendered plot surface. CI runs on every push.

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for the phased plan toward best-in-class
browser-only evidence-synthesis status.

## Cite

Archived on Zenodo — concept DOI [10.5281/zenodo.20516880](https://doi.org/10.5281/zenodo.20516880)
(version-less; always resolves to the latest release; v1.0.0 is
[10.5281/zenodo.20516881](https://doi.org/10.5281/zenodo.20516881)). See
[`CITATION.cff`](CITATION.cff) for full metadata — "Cite this repository" also
works directly from the GitHub project page.
