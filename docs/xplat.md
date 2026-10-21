# Cross-platform R verification (F4, `xplat-verify`)

Every app that has a live R adapter (the code behind its **Verify in R** button) is re-checked against
desktop R on three operating systems, two R versions and a pinned Docker image. The point: the numbers
the app shows for its built-in example match R wherever a reader runs the check, not only in webR in the browser.

## What runs

Workflow: [`.github/workflows/xplat-verify.yml`](../.github/workflows/xplat-verify.yml)

1. **export** (ubuntu, Chromium via Playwright): `scripts/xplat/export-checks.mjs` opens each app
   (discovered by globbing `*/alm-features.js`, plus every app whose `validate/*.js` mounts a live
   `AlmValidate` adapter) on its built-in example. In the page it calls the adapter's
   `currentState()`, `buildScript()`, `appValues()` and reads `compare` (tolerance and kind per quantity). It writes:
   - `check-<app>.R`: a self-contained, commented R script. It contains the adapter's R code (the same code
     webR runs), the app's own values embedded as literals, and the comparison rules of
     `AlmValidate.compare()` (`abs`; `rel` = |app − R| / max(1, |R|); `exact`; null = null passes; NaN, missing and
     non-finite values never pass). It prints one row per quantity, then `ALMCHECK <app> <passed>/<N>`, and exits 1 on any miss.
   - `plots-<app>.R`: the same adapter code, then each verify plot saved to `xplat-plots/<app>-<plot>.png`
     (base `grDevices::png()`: cairo on Linux, quartz on macOS, the default device on Windows; no ragg/system-font stack to pin).
   - `PLANTED-check-<app>.R` (first app only): identical to its check, except that one embedded app value
     is changed by 1e-3 relative. This copy **must fail**.
   - `manifest.json`: app, paper, N, packages and the SHA-256 of each script, plus any app that was skipped
     and why.
   - `entry/cases.json`: the F1 data-entry conversion grid (`validation/entry/gen_cases.mjs`), shipped so
     R-only rows need no Node.
2. **rcheck**: one job per row, with `fail-fast: false`:

   | os | R |
   |---|---|
   | ubuntu-latest, windows-latest, macos-latest | release, oldrel-1 |
   | ubuntu-latest | `container` = `rocker/r-ver:4.5.1` |

   Packages are pinned. If `.github/r/renv.lock` is committed, `.github/r/restore.R` runs on every row (host and
   container): on Linux it first installs the lock's system requirements (`pak::pkg_sysreqs()` -> apt-get, e.g.
   libglpk for igraph), then `renv::restore()` installs from the lock's dated P3M snapshot (binaries on Windows,
   Linux and R release/oldrel), then every installed version is checked against the lock. Any failure fails the
   row; there is no silent fallback. Only without a lock are the same versions from `.github/r/pinned.txt`
   installed with `r-lib/actions/setup-r-dependencies`. Each result records `packages_via` (`renv` only when the
   restore succeeded and verified on that row), `install` and `R.version.string`. `scripts/xplat/run-checks.R` runs every check in its
   own R process, so one failure never hides the rest. It then runs `validation/entry/check_entry.R` on the
   case grid (`ENTRY n/N`), the planted copy (it must exit nonzero with passed < N) and every plots script. It
   writes `result-<os>-<r>.json`, which contains: os, r, `R.version.string`, package versions, per app
   `{passed, N, exit}`, entry `{passed, N}` and `planted_detected`. A row fails if any check fails, the entry
   grid fails, a plots script fails, or the planted copy passes.
3. **report**: writes `xplat-results.json` and a job-summary table, one line per row:
   `k of K pass (q/Q quantities); entry n/N; planted detected`. It also adds a per-app × row table. On `main`
   only (push, or a dispatch from main), it commits `status/xplat-results.json`, `status/index.html` and shields
   endpoint badges to the branch **`xplat-status`**. The branch is created as an orphan on the first run. Every
   update is a plain fast-forward commit using `GITHUB_TOKEN`; it is never forced.

## How to trigger

- Automatically: on pushes to `main` that touch `*/alm-features.js`, `shared/alm-*`,
  `shared/webr-runner.js`, `validation/**`, `.github/r/**` or `scripts/xplat/**`, and on pull requests
  touching the same paths.
- By hand: **Actions → xplat-verify → Run workflow** (choose `main`).
- From another workflow: `uses: ./.github/workflows/xplat-verify.yml` (`workflow_call`).
- Locally (one app at a time):
  `node scripts/xplat/export-checks.mjs --apps proportion-ma --out xplat-out`, then
  `Rscript xplat-out/check-proportion-ma.R`.

### Pinning the R packages (renv.lock)

`.github/r/renv.lock` is generated, never written by hand. Run **Actions → xplat-verify → Run workflow** with
**snapshot** ticked. The `snapshot` job pak-installs exactly `.github/r/pinned.txt` on ubuntu with R 4.5.1 from a
dated P3M snapshot (metafor 5.2-1, meta 8.5-0, netmeta 3.7-0, metadat 1.6-0, mada 0.5.12, dosresmeta, mvmeta 1.0.3,
mixmeta 1.2.2, metasens 1.5-3, robumeta 2.1, clubSandwich 0.7.0, jsonlite). It fails if any pinned version did not install.
Recommended packages in the closure (Matrix, nlme, MASS, lattice, boot) are locked at that snapshot's CRAN builds,
not at the versions bundled with R 4.5.1 (those are source-only elsewhere; Matrix 1.7-3 does not compile on R 4.6).
R release/oldrel rows run a different R than the lock's 4.5.1; the packages are the same versions, and each row
records its own R version.
It then runs `renv::snapshot()` for those packages and their recursive dependencies, and uploads `renv.lock`
as the `renv-lock` artifact. A maintainer reviews the file and commits it as `.github/r/renv.lock`. From then on,
every row restores from it. The snapshot job also runs on pull requests, so the generation step itself stays tested.

## Reading the badges

Each matrix row has a badge `badge-<os>-<r>.json`. Each app has a badge `badge-app-<app>.json` that counts across all rows.

- **green `k/K pass`**: all K app checks matched R on that row. The entry grid passed, and the planted
  defect was detected.
- **red**: at least one quantity was outside its tolerance, the entry grid failed, the plots failed, or
  `planted missed` (the gate did not catch a known defect, so treat that row as unverified).
- **grey `no result`**: the row did not finish (cancelled or crashed). It is never counted as a pass.

Status page: <https://github.com/mahmood726-cyber/allmeta/blob/xplat-status/status/index.html>
(machine-readable: `status/xplat-results.json` on the same branch). The run logs, the generated R scripts
(`xplat-out`), the per-row results and the plots are attached to each workflow run as artifacts.

## Snippets

README (all rows):

```markdown
[![xplat-verify](https://github.com/mahmood726-cyber/allmeta/actions/workflows/xplat-verify.yml/badge.svg)](https://github.com/mahmood726-cyber/allmeta/actions/workflows/xplat-verify.yml)
[![ubuntu R release](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmahmood726-cyber%2Fallmeta%2Fxplat-status%2Fstatus%2Fbadge-ubuntu-latest-release.json)](https://github.com/mahmood726-cyber/allmeta/blob/xplat-status/status/index.html)
[![ubuntu R oldrel-1](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmahmood726-cyber%2Fallmeta%2Fxplat-status%2Fstatus%2Fbadge-ubuntu-latest-oldrel-1.json)](https://github.com/mahmood726-cyber/allmeta/blob/xplat-status/status/index.html)
[![windows R release](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmahmood726-cyber%2Fallmeta%2Fxplat-status%2Fstatus%2Fbadge-windows-latest-release.json)](https://github.com/mahmood726-cyber/allmeta/blob/xplat-status/status/index.html)
[![windows R oldrel-1](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmahmood726-cyber%2Fallmeta%2Fxplat-status%2Fstatus%2Fbadge-windows-latest-oldrel-1.json)](https://github.com/mahmood726-cyber/allmeta/blob/xplat-status/status/index.html)
[![macOS R release](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmahmood726-cyber%2Fallmeta%2Fxplat-status%2Fstatus%2Fbadge-macos-latest-release.json)](https://github.com/mahmood726-cyber/allmeta/blob/xplat-status/status/index.html)
[![macOS R oldrel-1](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmahmood726-cyber%2Fallmeta%2Fxplat-status%2Fstatus%2Fbadge-macos-latest-oldrel-1.json)](https://github.com/mahmood726-cyber/allmeta/blob/xplat-status/status/index.html)
[![rocker R 4.5.1](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmahmood726-cyber%2Fallmeta%2Fxplat-status%2Fstatus%2Fbadge-ubuntu-latest-container.json)](https://github.com/mahmood726-cyber/allmeta/blob/xplat-status/status/index.html)
```

Per app / paper (replace `<app>`, e.g. `proportion-ma` for paper 9):

```markdown
[![<app> verified in R on 7 platforms](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmahmood726-cyber%2Fallmeta%2Fxplat-status%2Fstatus%2Fbadge-app-<app>.json)](https://github.com/mahmood726-cyber/allmeta/blob/xplat-status/status/index.html)
```

Paper text (suggested): "The app's results for its built-in example were re-computed in R (pinned package
versions, `.github/r/renv.lock`) on Ubuntu, Windows and macOS with R release and oldrel-1 and in
rocker/r-ver:4.5.1; every quantity matched within the app's stated tolerance (workflow xplat-verify, run <URL>)."
Cite the run URL only for a run whose row badges are green.

Badges appear only after the first run on `main` has created the `xplat-status` branch.
