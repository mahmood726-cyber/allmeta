# allmeta

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

Seventy-six apps are listed in the hub, including 70 repository-hosted browser apps, 6 externally hosted apps, and 3 R/Shinylive pilot exports from the legacy Shiny portfolio.

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

See [`CITATION.cff`](CITATION.cff). Cite-this-repository works directly from
the GitHub project page.
