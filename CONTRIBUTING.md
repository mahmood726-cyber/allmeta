# Contributing to allmeta

Thanks for considering a contribution. allmeta is a browser-only
research tool — every change ships to GitHub Pages within minutes of
landing on `main` and gets seen by real researchers running real
analyses. Please read this short guide before opening a PR.

> By contributing you agree to abide by the
> [Code of Conduct](CODE_OF_CONDUCT.md) and license your contribution
> under the project's MIT licence.

## How decisions are made

See [GOVERNANCE.md](GOVERNANCE.md) for the maintainer list, review
policy, and how methodology contributions are validated.

## Ways to contribute

| Contribution                       | Path                                   |
| ---------------------------------- | -------------------------------------- |
| Report a bug                       | [GitHub Issues](https://github.com/mahmood726-cyber/allmeta/issues) |
| Suggest a feature / method         | GitHub Issues — label `feature`        |
| Fix a typo / clarify docs          | Open a PR directly                     |
| Add a method paper citation        | Edit `shared/citation.js`              |
| Add a new method (numerical app)   | Read § "Adding a new method" below     |
| Add a canonical dataset            | Edit `shared/canonical-datasets.js`    |
| Improve test coverage              | Always welcome                         |

## Setting up

```bash
git clone https://github.com/mahmood726-cyber/allmeta
cd allmeta
python -m pytest tests/                       # ~30 sec; needs node on PATH
cd tests/playwright && npm install && npx playwright install chromium
npx playwright test                            # ~1-2 min
python -m http.server 8080                     # browse at http://localhost:8080
```

Node ≥18, Python ≥3.10. No backend; no Docker; no cloud account.

## Adding a new method

This is the typical contribution path — a new numerical app implementing
one method paper. The checklist:

1. **Create the app folder** as a sibling to other apps, e.g.
   `/my-method/index.html`. Use an existing simple app
   (`/forest-plot/`, `/heterogeneity/`) as the template.
2. **Wire the cross-app moat** — your app should ideally:
   - Load `<script src="../shared/build-info.js">` (for receipt
     provenance);
   - Use `MaStudies.read()` to ingest from the pairwise bus or
     `MaComparisons.read()` for NMA-shape;
   - Expose its state via `window._almXxxState = function () {...}`
     so the report-bundle exporter can read it;
   - Add a citation entry in `shared/citation.js` with at least one
     Vancouver-formatted method-paper reference.
3. **Cross-link the app**:
   - Add it to `shared/app-flow.js` `CATALOG` (label, category, kind,
     blurb);
   - Add it to `hub/projects.js` (name, summary, tags);
   - Pick 1-2 places in `finder/decision-tree.json` where it should
     appear as a recommendation.
4. **Add a canonical worked example**:
   - If your method needs a specific dataset shape, add it to
     `shared/canonical-datasets.js` with the original published
     source citation;
   - Add the manifest in `shared/hero-examples.js` so the "Try with:
     ▾" dropdown picks it up.
5. **Write tests** (this is non-negotiable):
   - A pytest behavioural spec in `tests/test_<method>.py` calling
     your engine via `node` subprocess with `encoding="utf-8"`. Pin
     against R reference values (`metafor`, `meta`, `netmeta`, `mada`)
     at 1e-6 tolerance where applicable.
   - A Playwright sanity spec in `<your-app>/tests/sanity.spec.mjs`
     loading the app, running the demo, and asserting a plot or
     result table renders.
   - Pre-commit: `python -m pytest tests/` and the relevant Playwright
     spec must both pass.
6. **Document it**:
   - Run `python scripts/gen_app_readmes.py` — this auto-generates a
     README pulling from your `app-flow.js` blurb and citation entry.
     Hand-edit the section above `<!-- ALM-AUTO-README-BEGIN -->` to
     add a one-paragraph manual intro.
7. **Open the PR** with:
   - Title: `feat(<app-key>): <one-line summary>`;
   - Body: paper citation, sample input/output, R reference output
     for parity (paste the `metafor` console output);
   - Confirm tests pass (`python -m pytest tests/` and Playwright).

A maintainer will review for: method-paper fidelity, R parity within
1e-6, no console errors, accessibility (axe-core), and cross-link
hygiene. Expect one or two review rounds.

## Adding a citation only

Edit `shared/citation.js`:

```js
"your-app": [
  { vancouver: "Higgins JPT, Thompson SG. Quantifying heterogeneity in a meta-analysis. Stat Med. 2002;21(11):1539-1558. doi:10.1002/sim.1186",
    bibtex: "@article{higgins2002heterogeneity, author = {Higgins, Julian P. T. and Thompson, Simon G.}, title = {Quantifying heterogeneity in a meta-analysis}, journal = {Statistics in Medicine}, year = {2002}}" },
],
```

Run `python -m pytest tests/test_citation.py` to confirm the entry
parses.

## Filing a bug

A useful bug report includes:

- the app URL (e.g. `/forest-plot/`);
- the exact textarea / form contents that triggered it (paste the
  input — your data stays on your device, but copy it into the
  bug report so we can reproduce);
- browser + version;
- console error if any (Open DevTools → Console);
- expected vs actual behaviour.

If the bug is in a numerical engine (wrong pooled estimate, wrong CI),
also include the R reference output you compared against.

## Code style

- **JavaScript**: vanilla ES5+ targeting evergreen browsers — no build
  step, no transpilation. IIFE wrappers for shared modules. Two-space
  indentation. Strict mode where practical.
- **Python**: Black-formatted (line length 100). Type hints
  encouraged. Pure stdlib + pytest preferred; no scientific-stack
  dependencies (numpy, scipy) in test files since they should drive
  node subprocesses, not duplicate engine math.
- **HTML/CSS**: each app is a single file with inlined styles and
  scripts. CSP must remain `default-src 'self'`; no CDN sources.
- **Comments**: `// 2026-MM-DD <topic>:` for context-bearing fixes and
  important decisions; sparse otherwise.
- **No emojis** in code or commit messages unless the file is a
  user-facing dashboard or rendered HTML.

## What we will not accept

- Server-side dependencies. allmeta is browser-only by design; data
  privacy and offline capability are USPs.
- Closed-source vendored libraries.
- Methods without a citable peer-reviewed source.
- Engines that fail R parity > 1e-4 without a documented justification.
- Tracking code, telemetry, or third-party analytics.
- Tests against mock data when an R reference is available.

## Getting help

- Open a [Discussion](https://github.com/mahmood726-cyber/allmeta/discussions)
  for design questions or method clarifications.
- Open an [Issue](https://github.com/mahmood726-cyber/allmeta/issues)
  for bugs and feature requests.

Thank you for contributing — every method paper turned into a
browser-runnable tool widens access to good evidence synthesis.
