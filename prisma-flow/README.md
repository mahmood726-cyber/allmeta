<!-- sentinel:skip-file — hardcoded paths / templated placeholders are fixture/registry/audit-narrative data for this repo's research workflow, not portable application configuration. Same pattern as push_all_repos.py and E156 workbook files. -->

# PRISMA Flow

Single-file browser app that generates a PRISMA 2020 flow diagram from record
counts. Paste counts in, the SVG renders live, export as SVG or PNG for your
manuscript.

## Scope

- PRISMA 2020 "databases and registers only" template, after Page et al.,
  BMJ 2021;372:n71.
- Identification → Screening → Included, with side-branches for removed,
  excluded, not retrieved, and excluded-with-reasons.
- Optional free-text breakdowns for the removal and exclusion boxes.

## Use

- Open `index.html` directly (file://) or serve the `C:\HTML apps` folder with
  `.\serve-html-apps.ps1` and navigate to `/prisma-flow/`.
- The browser saves state to `localStorage` under the key `prisma-flow-v1`.
- Export buttons:
  - **Download SVG** — vector, ready for typesetting.
  - **Download PNG** — 2× scaled raster at 1680×2120.
  - **Download JSON** — full state for later reload.
  - **Import JSON** — restore a saved state.
  - **Reset** — all counts to zero (title kept).

## Consistency checks

The banner below the form flags when the boxes do not add up:

- `screened = databases + registers − removed`
- `sought = screened − excluded at screening`
- `assessed = sought − not retrieved`
- `excluded_with_reasons ≤ assessed`

Warnings are advisory; the diagram renders regardless.

## Determinism

Same inputs → byte-identical SVG output. No randomness, no timestamps in the
SVG body.

## Tests

```
cd "C:\HTML apps\prisma-flow"
python -m pytest tests/ -v
```

9 smoke tests cover:
- `index.html` exists and parses as HTML
- Every PRISMA label is in the source
- Every form input id the script wires up is present
- No forbidden placeholders (`{{...}}`, `REPLACE_ME`, `TODO:`)
- No external runtime CDN
- `prisma-flow-v1` localStorage key is present
- All export buttons are wired
- HTML tag balance passes
- No literal `</script>` inside the inline script body

## Non-goals

- Not a full systematic-review manager.
- No "updated reviews" variant (identified via previous reviews) in this
  version.
- No citation parsing or deduplication — bring your own count totals.
