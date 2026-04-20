# allmeta — HTML Apps Hub

Live site: https://mahmood726-cyber.github.io/allmeta/

Mirror of the portable, browser-only evidence-synthesis tools in `C:\HTML apps`. Each app is a single-file HTML artifact (or a small bundle of HTML + JS + CSS) and runs without a backend.

## Local use

```bash
git clone https://github.com/mahmood726-cyber/allmeta
cd allmeta
python -m http.server 8080
# Open http://localhost:8080
```

## What's shipped

- **25 internal apps** copied into this repo.
- **5 external cards** in the hub (AdaptSim, Al-Mizan, CardioOracle, CardioSynth Phase 0, NICECardiology) link to their own GitHub Pages deployments.

## Testing

Every push runs a Playwright pre-flight that screenshots each app and verifies at least one plot surface renders. See `tests/playwright/`.
