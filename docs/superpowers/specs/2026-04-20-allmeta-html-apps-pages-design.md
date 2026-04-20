# Design: `allmeta` — GitHub Pages deployment of `C:\HTML apps`

- **Date:** 2026-04-20
- **Owner:** mahmood726-cyber
- **Source:** `C:\HTML apps` (30 cards in `hub/projects.js`; 2.48 GB on disk)
- **Target:** `mahmood726-cyber/allmeta` → `https://mahmood726-cyber.github.io/allmeta/`
- **Gate before deploy:** Playwright pre-flight on all internal apps.

## 1. Goal

Publish the hub + 25 internal HTML apps under a single public Pages URL so users can both **download** (via repo) and **use** (via Pages) the apps. Pre-flight every internal app with Playwright so shipped apps have a known good "plots render" baseline.

## 2. Non-goals

- Not modifying `C:\HTML apps` in place. Work in `C:\Projects\allmeta`.
- Not shipping `Truthcert1_work/`, `__pycache__/`, `.pytest_cache/`, or any `.git/` subdirectories inside heavy app folders.
- Not running the Python contract tests in `C:\HTML apps\tests/` (different system).
- Not modifying existing repos for the 5 external apps (AdaptSim, Al-Mizan, CardioOracle, CardioSynth Phase 0, plus one more). We only verify their Pages URLs.
- Not shipping apps whose Playwright pre-flight fails unless explicitly approved "ship anyway".

## 3. Scope

- **30 hub cards:** 25 internal (`./`), 5 external (`../`).
- **External-link strategy:** Option B — rewrite `../` paths to `https://mahmood726-cyber.github.io/<repo>/`. Verify each target returns HTTP 200 before rewrite. On miss: enable Pages on that repo, drop the card, or copy the folder in (option A fallback) — per-card decision.
- **Trim target:** each heavy folder ≤ 25 MB after trim; repo soft target ≤ 500 MB.
- **Playwright scope:** all 25 internal apps (option C + ii — screenshot + auto-detect + click demo/run button if present).

## 4. Architecture

```
C:\Projects\allmeta\
├── index.html                         (copy of C:\HTML apps\index.html, hub UI)
├── hub/                               (styles + projects.js with rewritten external links)
├── <25 internal app folders>          (slimmed)
├── tests/playwright/                  (not shipped to Pages)
│   ├── package.json
│   ├── playwright.config.ts
│   ├── hub-crawl.spec.ts
│   └── artifacts/                     (gitignored; screenshots + JSON report)
├── .github/workflows/
│   ├── playwright.yml
│   └── pages.yml
├── .gitignore
├── .pages-exclude                     (informational log of what was trimmed)
├── docs/superpowers/specs/            (this file)
└── README.md
```

## 5. Trim plan per heavy folder

Baseline sizes (source: `Get-ChildItem`, 2026-04-20):

| Folder | Source MB | Action |
|---|---|---|
| Truthcert1_work | 460 | exclude entirely (work/backup folder, not in hub manifest) |
| Truthcert1 | 426 | keep entry HTML + referenced JS/CSS/JSON; drop backups, node_modules, large artifacts |
| living-meta | 322 | same rule |
| dosehtml | 300 | same rule |
| HTA | 300 | same rule |
| IPD-Meta-Pro | 270 | same rule |
| nma-pro-v2 | 222 | same rule |
| nma-dose-response-app | 147 | same rule |
| Pairwiseai | 31 | same rule (may already be OK) |
| 20+ others | <1 each | copy as-is |

**Trim method:** starting from each folder's entry HTML (path in `hub/projects.js`), grep for local asset references (`src=`, `href=`, `import`, `fetch(`) two levels deep. Keep the transitive closure. Anything outside that closure is excluded and logged in `.pages-exclude`.

## 6. External link verification

For each of the 5 external cards:
1. `gh api "repos/mahmood726-cyber/<repo>/pages" --jq .html_url` → if 200 and `status == "built"`, rewrite.
2. If not built, record in blocker list; decide per-card with user.

The 5 externals (enumerated from `hub/projects.js`):

| Card | Source path | Candidate Pages URL |
|---|---|---|
| AdaptSim | `../AdaptSim/index.html` | `https://mahmood726-cyber.github.io/AdaptSim/` |
| Al-Mizan | `../AlMizan/index.html` | `https://mahmood726-cyber.github.io/AlMizan/` |
| CardioOracle | `../Models/CardioOracle/index.html` | `https://mahmood726-cyber.github.io/CardioOracle/` (assumes repo name = folder name) |
| CardioSynth Phase 0 | `../cardiosynth/phase0/colchicine-stemi.html` | `https://mahmood726-cyber.github.io/cardiosynth/phase0/colchicine-stemi.html` |
| NICECardiology | `../NICECardiology/index.html` | `https://mahmood726-cyber.github.io/NICECardiology/` |

Candidate URLs are inferred; real URLs are discovered via `gh api repos/mahmood726-cyber/<repo>/pages` in Phase 2 before rewrite.

## 7. Playwright harness

**Stack:** Node + `@playwright/test` (Chromium only). Local server: `npx http-server . -p 8080` via Playwright's `webServer` config so local run hits the same paths as Pages.

**Per-app test body:**
1. `goto(path, { waitUntil: "networkidle", timeout: 15000 })`.
2. Listen for `page.on("console")` — collect entries with `type() === "error"`.
3. Probe plot surfaces with selector `canvas, svg:not([width="0"]):not([height="0"]), .plotly, .js-plotly-plot, [id*="chart"], [id*="plot"]`.
4. If zero plot surfaces present, query `button, input[type=button], input[type=submit]` with text matching `/load\s*(demo|example|data)|run|calculate|analy[sz]e|plot|compute/i`. If found, click first match, `page.waitForTimeout(3000)`, re-probe.
5. Assert at least one plot surface has `boundingBox()` with width ≥ 40 and height ≥ 40.
6. `page.screenshot({ path: artifacts/<slug>.png, fullPage: true })`.
7. Push row to `report.json`: `{ app, url, status: "pass" | "fail-plot-missing" | "fail-console-error" | "fail-load", duration_ms, console_errors: [...], notes }`.

**Acceptance rules:**
- `fail-load` (navigation error) → blocker, cannot ship that app.
- `fail-console-error` → blocker unless user approves "ship anyway" after inspecting the error.
- `fail-plot-missing` → manual review; many apps genuinely have no plot on landing (they require user input first). User decides per-app.
- `pass` → ship.

**Outputs:**
- `tests/playwright/artifacts/<slug>.png` (one per app)
- `tests/playwright/report.json`
- `tests/playwright/report.html` (Playwright's built-in reporter, gallery view)

## 8. CI workflows

**`.github/workflows/playwright.yml`** — on push / PR:
1. Checkout.
2. `npm ci` in `tests/playwright/`.
3. `npx playwright install --with-deps chromium`.
4. Run the harness.
5. Upload `artifacts/` + `report.json` + `report.html` as workflow artifacts.
6. Fail the workflow if any `fail-load` or un-allowlisted `fail-console-error` occurs.

**`.github/workflows/pages.yml`** — on push to `main`, after Playwright passes:
1. Checkout; add `.nojekyll`; use `rsync`/`robocopy` step to copy repo contents into `_site/` excluding `tests/`, `.github/`, `docs/`, `.pages-exclude`, `node_modules/`, and any `*.md` at repo root except `README.md`.
2. Upload `_site` via `actions/upload-pages-artifact@v3`.
3. Deploy with `actions/deploy-pages@v4`.

## 9. Execution phases

| Phase | Deliverable | Gate |
|---|---|---|
| 0 — scaffold | `C:\Projects\allmeta` initialised, this spec committed | Spec reviewed |
| 1 — trim | each heavy folder ≤25 MB; `.pages-exclude` log written | Size audit printed |
| 2 — hub rewrite | `hub/projects.js` external links verified + rewritten | `gh api` checks pass |
| 3 — Playwright local | `report.json` + screenshots under `tests/playwright/artifacts/` | User reviews report |
| 4 — ship decisions | Per-app pass / fail / ship-anyway marked | User sign-off |
| 5 — push + Pages | Repo created, first deploy live, deployed URLs smoke-tested | HTTP 200 on index + 3 sampled apps |
| 6 — CI | Both workflows green on a noop PR | Green check |

## 10. Risks

- **Hidden CDN dependencies**: an app that worked on `file://` may fail on Pages if it quietly relied on a local file present only in the source tree. Playwright runs against the to-be-shipped tree, so this surfaces before deploy.
- **Large binary assets deep in subfolders** (e.g., Python `.pkl`, R data): caught by trim audit; anything >10 MB triggers a manual review.
- **External Pages drift**: if an external project later disables Pages, the hub link breaks. Out of scope for v1; could be added as a weekly cron check.
- **Playwright false negatives on plot detection**: an app using WebGL only, or rendering plots inside shadow DOM, may be missed. Manifested as `fail-plot-missing`; user reviews screenshot and overrides.

## 11. Success criteria

- `https://mahmood726-cyber.github.io/allmeta/` returns HTTP 200 and shows the hub.
- Every shipped card from the hub resolves (HTTP 200 for internal, HTTP 200 for external targets).
- Playwright report committed to the repo under `tests/playwright/reports/<timestamp>/`.
- CI runs Playwright on every push and blocks deploy on blocker failures.
