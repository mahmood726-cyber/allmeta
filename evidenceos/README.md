# EvidenceOS

EvidenceOS is a serverless living-evidence watch that turns open trial and
publication metadata into a public update gate for a living meta-analysis.

This MVP ships one source-backed topic: finerenone in cardiorenal and
heart-failure populations. It uses ClinicalTrials.gov for trial records and
OpenAlex for publication candidates, then publishes a static browser dashboard
under the allmeta GitHub Pages site.

## Build

```bash
python3 evidenceos/scripts/build_report.py
```

Use the cached source payload for deterministic local rebuilds when
`data/source-cache.json` is present:

```bash
python3 evidenceos/scripts/build_report.py --offline
```

## Static vs Dynamic Disclosure

| Item | Status | Reason |
| --- | --- | --- |
| Topic query | Static | The MVP locks one demo topic so changes in evidence state are auditable. |
| Trial and publication records | Dynamic source-derived | Generated from ClinicalTrials.gov and OpenAlex JSON payloads. |
| Clinical effect estimates | Not inferred | No pooled effect is generated until source-backed effect extraction is connected. |
| Dashboard | Static | GitHub Pages serves the generated report without a backend. |

## Validation

```bash
pytest -q -p no:cacheprovider evidenceos/tests
node --check evidenceos/app.js
```

## Limits

EvidenceOS currently detects evidence-update signals. It does not change a
clinical pooled estimate until effect extraction is connected to the existing
allmeta/WebR analysis engines and source-backed extraction review passes.
