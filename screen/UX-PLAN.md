# Screen first-run UX plan (vs ASReview LAB)

Heuristic walkthrough by one developer on 19 October 2026, reading the code in this branch and the official ASReview LAB documentation. It is **not** a usability study: no participants, no timings, no task-success rates. Click counts are the minimum path a person who already knows where to click would take.

## Journey: "I have a RIS/CSV export" → "screening ranked records"

**ASReview LAB** (documentation, stable branch, read 19 Oct 2026):

| Step | Source |
|---|---|
| 1. Have Python ≥3.10; open a terminal; `pip install asreview` | [installation](https://asreview.readthedocs.io/en/stable/lab/installation.html) |
| 2. `asreview lab`; the app opens in the browser (local server; Docker is an alternative) | same |
| 3. Reviews page → choose data source (From File / URL / Discovery) → drop or browse the file | [project create](https://asreview.readthedocs.io/en/stable/lab/project_create.html) |
| 4. Check dataset charts; optional: tags, AI model (default ELAS ultra), prior knowledge | same |
| 5. Click **Screen**. Each decision retrains in the background | [screening](https://asreview.readthedocs.io/en/stable/lab/screening.html) |
| 6. Optional stopping threshold on "irrelevant since last relevant" (off by default) on the Dashboard; export RIS/CSV/TSV/Excel with `asreview_label` | [progress](https://asreview.readthedocs.io/en/stable/lab/progress.html) |

Count: 2 install/launch commands (plus a Python install if absent), then 2 required in-app decisions (data source, Screen) and up to 4 optional ones. Ranking needs no separate action. What ASReview shows before any prior knowledge was not verified here.

**Screen, before this branch** (verified in `index.html`, `hybrid-ui.js`): open the page (no install) → **Import records…** → pick file (format auto-detected; RIS/NBIB/CSV/JSON) → records appear in import order → label ≥2 includes and ≥2 excludes → scroll to the 7th of 12 sidebar panels, "Browser-local hybrid AI", and click **Train local hybrid ranker** (automatic retraining is an opt-in checkbox there). Count: 2 clicks to import, no install, but one hidden required decision: *which* trainer. The most prominent sidebar button, **Train & rank**, trains the legacy Naive Bayes baseline, and nothing tells the user about the 2+2 requirement until a train attempt fails.

## Friction points in Screen (ranked by impact ÷ effort)

| # | Friction | Impact | Effort | Quick win? |
|---|---|---|---|---|
| F1 | 2-include + 2-exclude gate is invisible until a training attempt; the hybrid trainer is buried far down the sidebar | High | Low | **Yes** — live gate hint and one "Start AI ranking" button beside the card |
| F2 | No drag-and-drop; empty state is a single sentence; detected format not reported | Medium | Low | **Yes** — drop zone first-run card with demo button; toast names the detected format |
| F3 | Progress sits at the bottom of the sidebar; no "relevant found" or "irrelevant since last relevant" counter | Medium | Low | **Yes** — live progress strip above the card (descriptive only, no stopping advice) |
| F4 | No ASReview interoperability, so switching tools costs a re-screen | Medium | Low–medium | **Yes** — ASReview-style CSV export; import of `included`-family columns and RIS `N1` ASReview labels |
| F5 | Undo-last-decision is a button only; `u` clears the *current* card instead | Low | Low | **Yes** — `z` / Ctrl+Z undo; shortcut overlay lists it and notes the i/e vs ASReview r/i difference |
| F6 | Three ranking entry points (Train & rank = legacy NB, hybrid, legacy auto-retrain) | High | Medium (saved projects, tests) | No — partly mitigated by F1 button |
| F7 | Hybrid retraining after decisions is opt-in, ASReview retrains every decision | Medium | Low, but changes cadence | No — out of scope (cadence frozen); the F1 panel exposes the existing toggle |
| F8 | 12 sidebar panels all expanded (audit, collaboration, AI hand-off) | Medium | Medium | No — needs progressive-disclosure design |
| F9 | Keyboard map differs from ASReview (`i` = include here, irrelevant there) | Low–medium | Remapping would break existing users | No — documented in the overlay only |

## Implemented in this branch (feat/screen-ux-quickwins)

F1–F5. Constraints honoured: no change to the ranking model, features, cadence or `ml*`/`hybrid-core` maths; no new network calls or CDNs; no stopping or recall-guarantee language (the consecutive-irrelevant count is labelled descriptive only, as in ASReview, where stopping is "left to you"). Logic lives in `ux.js` (pure, Node-tested); DOM wiring in `ux-ui.js`.

After the change the Screen path is: open page → drop file (or click to choose / try demo) → label 2+2 while the hint counts up → click **Start AI ranking** in the strip above the card. No install, nothing leaves the browser.

Local validation, 19 Oct 2026 (Windows, installed Chrome): 45 Screen Python tests, 19 Node tests and 114 Screen browser tests passed (`screen-workflow.config.mjs`, including the new `screen-ux.spec.mjs`). The ASReview CSV export follows the documented column names; it was not imported into a real ASReview install.
