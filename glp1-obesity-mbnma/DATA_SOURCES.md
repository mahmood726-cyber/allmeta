# Data-source policy (set 2026-06-10)

**Permitted sources only:**
1. **AACT** — the CTTI relational mirror of ClinicalTrials.gov (local snapshot
   `C:\Users\mahmo\AACT\20260601_pipe-delimited-export.zip`). Primary source for all
   arm-level data (doses, N, mean % weight change, dispersion).
2. **ClinicalTrials.gov** — the registry itself (same data as AACT; registry fields).
3. **PubMed abstracts** — for validating extracted values against the published headline
   and for trial discovery. **Abstracts only** — NOT full text / PDFs.

**Explicitly EXCLUDED for now:**
- Full-text / PDF extraction (e.g. `rct-extractor-v2` on publication bodies).
- Any non-registry, non-PubMed source.

## Compliance status
The entire pipeline (`discovery.py` -> `extract_full.py` -> `fit_network.py` ->
`bayes_mbnma.py`) reads **only** the AACT snapshot. No full text is touched. COMPLIANT.

PubMed abstracts (via the PubMed MCP tool) may be used to:
- cross-check a node's extracted weight loss vs the trial's published abstract value;
- discover additional registered trials.
Arm-level dose-response numbers still come from AACT results postings, since abstracts
rarely report every dose arm's mean + dispersion.
