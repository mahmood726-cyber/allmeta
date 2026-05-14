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

## Testing

A Playwright pre-flight (`tests/playwright/`) screenshots every internal app and checks for a rendered plot surface. CI runs on every push.
