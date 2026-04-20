# CLAUDE.md — IPD-Meta-Pro

## Project Overview
**51K-line single HTML file**, 1.87 MB, 1184 functions — fully client-side IPD (Individual Patient Data) meta-analysis application.

## Key File
- `index.html` — the entire application (~51K lines)

## Architecture
- Single HTML file, all CSS/JS embedded for offline use
- Build system: `dev/build.py` (split/build/stats/minify)
- 48 dev scripts in `dev/build-scripts/`

## Critical Warnings
- **Undo system**: JSON-patch diff-based (not full deep-clone) to prevent multi-GB memory on large datasets
- **GOSH**: k>15 uses random sampling (32K subsets); exact enumeration only for k<=15
- **GOSH had 2 identical function copies** — use `replace_all=true` when fixing duplicate code
- **Determinism**: `SeededRNG.patchMathRandom(seed)` wraps Math.random during analysis; must be restored after
- **Seeded PRNG**: xoshiro128** is the standard
- **TruthCert**: SHA-256 input hashing, provenance chain, validation (PASS/WARN/REJECT/BLOCK), bundle export
- **PlotDefaults**: 17 named presets (functions returning fresh objects to prevent mutation) — do not use inline margin defs
- **Offline CDN deps**: cached via Cache API (ServiceWorker Blob URL doesn't work in browsers)
- **Privacy**: one-time localStorage warning banner with `ipdMetaPro_privacyAcknowledged` flag

## Do NOT
- Add npm/build dependencies for the main app (must work offline)
- Use full deep-clone for undo (memory explosion on large datasets)
- Use inline margin definitions for plots (use PlotDefaults presets)
- Skip SeededRNG restoration after analysis (breaks subsequent randomness)

## Workflow Rules (from usage insights)

### Data Integrity
Never fabricate or hallucinate identifiers (NCT IDs, DOIs, trial names, PMIDs). If you don't have the real identifier, say so and ask the user to provide it. Always verify identifiers against existing data files before using them in configs or gold standards.

### Multi-Persona Reviews
When running multi-persona reviews, run agents sequentially (not in parallel) to avoid rate limits and empty agent outputs. If an agent returns empty output, immediately retry it before moving on. Never launch more than 2 sub-agents simultaneously.

### Fix Completeness
When asked to "fix all issues", fix ALL identified issues in a single pass — do not stop partway. After applying fixes, re-run the relevant tests/validation before reporting completion. If fixes introduce new failures, fix those too before declaring done.

### Scope Discipline
Stay focused on the specific files and scope the user requests. Do not survey or analyze files outside the stated scope. When editing files, triple-check you are editing the correct file path — never edit a stale copy or wrong directory.

### Regression Prevention
Before applying optimization changes to extraction or analysis pipelines, save a snapshot of current accuracy metrics. After each change, compare against the snapshot. If any trial/metric regresses by more than 2%, immediately rollback and try a different approach. Never apply aggressive heuristics without isolated testing first.
