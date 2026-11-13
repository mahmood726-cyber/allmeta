# Derived-number notice

Comparison against origin/main a3f20c28096cb41c1f333bdd187ac00d92e5ef31. Inputs below are synthetic software cases, not clinical findings. R reference: effect-size-converter/tests/fixtures/p20-p22-evalue-na-reference.R and .json (offline EValue 4.1.4 formula transcription, cross-checked with recorded native outputs). Existing native fixtures were not modified.

NA is JSON null, displayed as not applicable with a missing/far-limit reason. A crossing CI still has nearest-limit E-value 1.

The P22 page already replaced missing CI with null. Its existing point/nearest-CI values therefore do not change; the shared engine now carries that null directly. Lower/upper fields are newly exposed. Missing/far limits render not applicable with a reason, replacing a dash for missing CI. The original evalue-input-oracle.json and all its numeric assertions are unchanged. The UI text assertion in evalue-input-integrity.spec.mjs changes dash to not applicable plus missing.

All 80 oracle cases additionally pin lower/upper fields: previously absent, now numeric only for the near-null limit; the farther or absent limit is null. New fields do not replace the scalar ci. Full field values are in the adjacent R-generated JSON.

New oracle: ../effect-size-converter/tests/fixtures/p20-p22-evalue-na-reference.R/.json. No existing corpus/reference JSON changed.
