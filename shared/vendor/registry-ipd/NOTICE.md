# Vendored: registry-ipd engine

`engine.js` and `examples.js` are vendored **verbatim** (offline, no CDN) from
the **registry-ipd** project — *Registry-Native Pseudo-IPD Reconstructor*
(reconstructs pseudo individual-patient survival data from ClinicalTrials.gov /
AACT structured summary tables, **without digitizing a Kaplan–Meier figure**).

- **License:** MIT (compatible with allmeta's MIT licence; permissive, not copyleft).
- **What it does:** `RIPD.reconstruct(trial, opts)` returns a tiered verdict —
  Tier A (rich: KM-estimate points + number-at-risk → Guyot inverse-KM /
  censoring-informed anchor-exact / QP, best-of by 1-Wasserstein to the
  anchors), Tier B (median + HR → parametric + seeded bootstrap envelope),
  Tier C (HR only → **fail closed**, never fabricated). Output is always
  *pseudo-*IPD, never true IPD.
- **Why vendored, not rebuilt:** the engine is already validated (see
  registry-ipd's VALIDATION.md / FUSION.md) and self-contained offline JS;
  reuse beats re-implementation. The allmeta app `registry-survival/` is a thin,
  honest UI over this engine.

Do not edit these files in place — re-copy from the upstream project if it
updates, so provenance stays intact.
