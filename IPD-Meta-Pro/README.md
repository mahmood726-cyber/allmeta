# IPD Meta-Analysis Pro

IPD Meta-Analysis Pro is a browser-based application for individual participant data meta-analysis. The distributable app remains a single HTML file, but development now runs through a verified module manifest so core statistical code can be edited and tested in smaller pieces.

## Repository layout

- `ipd-meta-pro.html`: distributable single-file app.
- `dev/modules/`: editable split source for the main app bundle.
- `dev/modules/manifest.json`: assembly order for the generated HTML.
- `dev/modules/export_schema_module.js`: export/report schema helper, now bundled into the generated HTML.
- `dev/modules/02_00_vendor_xlsx.js` and `dev/modules/02_00_vendor_jspdf.js`: vendored runtime libraries inlined into the distributable build.
- `dev/modules/02_21a_embedded-validation-manifest.js`: build-generated validation manifest that embeds build-matched benchmark summaries into the distributable for offline evidence views.
- `dev/build.py`: split, rebuild, and verify the module manifest against the distributable HTML.
- `dev/build-scripts/`: validation, browser automation, and R parity gates.

## Development workflow

Use the module manifest as the source of truth for day-to-day changes:

```bash
python dev/build.py build
python dev/build.py verify
python dev/build.py bootstrap-from-html --force
```

- Edit the relevant files in `dev/modules/` rather than patching the large inline script in `ipd-meta-pro.html`.
- Run `build` after module edits to regenerate the distributable HTML.
- Run `verify` before commit or release to ensure the manifest and `ipd-meta-pro.html` are in sync.
- Startup-critical runtime dependencies are vendored into the manifest build so the generated HTML does not need CDN access to boot.
- The build also regenerates an embedded validation manifest from compatible benchmark artifacts in `dev/benchmarks/`, allowing the single-file app to show build-specific validation scorecards in `file://` mode.
- `bootstrap-from-html --force` is recovery-only. It exists for emergency reconstruction from a trusted built artifact, not as a normal development step.
- Legacy scripts that mutate `ipd-meta-pro.html` directly are retired; the only supported write path for the app artifact is `python dev/build.py build`.

## Validation

Fast local browser-facing gate:

```bash
python dev/build-scripts/release_checklist.py --skip-selenium
```

Full local browser gate:

```bash
python dev/build-scripts/release_checklist.py
```

Standalone browser harness for benchmark-backed unit coverage:

```bash
python dev/build-scripts/browser_test_runner.py
```

DOM-free core stats/meta validation:

```bash
node dev/tests/core_stats_meta_test.js
```

Focused real-user-flow smoke suite:

```bash
python dev/build-scripts/user_flow_smoke_test.py
```

Full parity gate against R reference implementations:

```bash
python dev/build-scripts/ipd_parity_gate.py --with-frontier-gap --with-loop7
```

`release_checklist.py` also validates that the core, browser harness, smoke, and parity scripts emit fresh PASS JSON artifacts in `dev/benchmarks/`, so stale benchmark files no longer count as a green gate.

The CI workflow uses `requirements-ci.txt` for Python browser dependencies and `dev/build-scripts/install_r_parity_dependencies.R` for the R benchmark stack.

## Reproducibility

- Manuscript: `F1000_Software_Tool_Article.md`
- Review checklist: `F1000_Submission_Checklist_RealReview.md`
- Release checklist: `RELEASE_CHECKLIST.md`
- Validation workflow: `.github/workflows/validation.yml`
