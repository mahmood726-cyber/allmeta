# Derived-number notice

Comparison against origin/main a3f20c28096cb41c1f333bdd187ac00d92e5ef31. Inputs below are synthetic software cases, not clinical findings. R reference: effect-size-converter/tests/fixtures/p20-p22-evalue-na-reference.R and .json (offline EValue 4.1.4 formula transcription, cross-checked with recorded native outputs). Existing native fixtures were not modified.

NA is JSON null, displayed as not applicable with a missing/far-limit reason. A crossing CI still has nearest-limit E-value 1.

Integrity-panel synthetic input RR=2 with no CI: previously displayed E-value 3.41 (nearest-CI-bound 1.00) and claimed CI included null; now E-value 3.41 (nearest-CI-bound not applicable: the CI bound nearest the null is missing). Point=3.414213562373095 is unchanged; CI 1 becomes null in the shared result. Complete/crossing results remain unchanged. No existing corpus/reference file changed. Changed implementation: shared/integrity-panel-v1.js; new test: p22-evalue-na.test.mjs.
