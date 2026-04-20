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

Twenty-five apps ship in this repository. Five more — AdaptSim, Al-Mizan, CardioOracle, CardioSynth, NICE Cardiology — are hosted in their own GitHub Pages sites and linked from the hub.

## Testing

A Playwright pre-flight (`tests/playwright/`) screenshots every internal app and checks for a rendered plot surface. CI runs on every push.
