# External Comparator Inputs

This folder stores exported results from external tools used for parity checks.

## R comparator export

Generated with:

- `npm run external:export:r`

Expected output files:

- `external-comparators/r/<model>/results.json`

## TreeAge comparator export

Place one file per model:

- `external-comparators/treeage/<model>/results.json`
  - JSON shape:
    - `strategies.<strategy>.total_costs`
    - `strategies.<strategy>.total_qalys`
    - `strategies.<strategy>.life_years`
- or `external-comparators/treeage/<model>/results.csv`
  - Required columns:
    - `strategy,total_costs,total_qalys,life_years`

Templates are provided under:

- `external-comparators/treeage/templates/*.csv`

## Synchronizing into reference fixtures

After exporting comparator files:

- `npm run external:sync`

This updates `reference-models/*/external_reference.json` with strict comparator entries and provenance hashes.
