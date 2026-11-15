# Derived-number notice

Comparison against origin/main a3f20c28096cb41c1f333bdd187ac00d92e5ef31. Inputs below are synthetic software cases, not clinical findings. R reference: effect-size-converter/tests/fixtures/p20-p22-evalue-na-reference.R and .json (offline EValue 4.1.4 formula transcription, cross-checked with recorded native outputs). Existing native fixtures were not modified.

NA is JSON null, displayed as not applicable with a missing/far-limit reason. A crossing CI still has nearest-limit E-value 1.

| R dataset/case | Field | Before | After |
|---|---|---|---|
| RR-FALSE-above-missing | ci | 1.000000000000000 | NA (null) |
| RR-FALSE-above-far-only | ci | 1.000000000000000 | NA (null) |
| RR-FALSE-below-missing | ci | 1.000000000000000 | NA (null) |
| RR-FALSE-below-far-only | ci | 1.000000000000000 | NA (null) |
| OR-FALSE-above-missing | ci | 1.000000000000000 | NA (null) |
| OR-FALSE-above-far-only | ci | 1.000000000000000 | NA (null) |
| OR-FALSE-below-missing | ci | 1.000000000000000 | NA (null) |
| OR-FALSE-below-far-only | ci | 1.000000000000000 | NA (null) |
| OR-TRUE-above-missing | ci | 1.000000000000000 | NA (null) |
| OR-TRUE-above-far-only | ci | 1.000000000000000 | NA (null) |
| OR-TRUE-below-missing | ci | 1.000000000000000 | NA (null) |
| OR-TRUE-below-far-only | ci | 1.000000000000000 | NA (null) |
| HR-FALSE-above-missing | ci | 1.000000000000000 | NA (null) |
| HR-FALSE-above-far-only | ci | 1.000000000000000 | NA (null) |
| HR-FALSE-below-missing | ci | 1.000000000000000 | NA (null) |
| HR-FALSE-below-far-only | ci | 1.000000000000000 | NA (null) |
| HR-TRUE-above-missing | ci | 1.000000000000000 | NA (null) |
| HR-TRUE-above-far-only | ci | 1.000000000000000 | NA (null) |
| HR-TRUE-below-missing | ci | 1.000000000000000 | NA (null) |
| HR-TRUE-below-far-only | ci | 1.000000000000000 | NA (null) |
| SMD-FALSE-above-missing | ci | 1.000000000000000 | NA (null) |
| SMD-FALSE-above-far-only | ci | 1.000000000000000 | NA (null) |
| SMD-FALSE-below-missing | ci | 1.000000000000000 | NA (null) |
| SMD-FALSE-below-far-only | ci | 1.000000000000000 | NA (null) |
| D-FALSE-above-missing | ci | 1.000000000000000 | NA (null) |
| D-FALSE-above-far-only | ci | 1.000000000000000 | NA (null) |
| D-FALSE-below-missing | ci | 1.000000000000000 | NA (null) |
| D-FALSE-below-far-only | ci | 1.000000000000000 | NA (null) |
| MD-FALSE-above-complete | point | 2.720759220056126 | 1.956110185985549 |
| MD-FALSE-above-complete | ci | 1.000000000000000 | 1.418294064071869 |
| MD-FALSE-above-crossing | point | RangeError | 1.956110185985549 |
| MD-FALSE-above-crossing | ci | RangeError | 1.000000000000000 |
| MD-FALSE-above-missing | point | 2.720759220056126 | 1.956110185985549 |
| MD-FALSE-above-missing | ci | 1.000000000000000 | NA (null) |
| MD-FALSE-above-near-only | point | 2.720759220056126 | 1.956110185985549 |
| MD-FALSE-above-near-only | ci | 1.000000000000000 | 1.418294064071869 |
| MD-FALSE-above-far-only | point | 2.720759220056126 | 1.956110185985549 |
| MD-FALSE-above-far-only | ci | 1.000000000000000 | NA (null) |
| MD-FALSE-below-complete | point | RangeError | 1.956110185985549 |
| MD-FALSE-below-complete | ci | RangeError | 1.418294064071869 |
| MD-FALSE-below-crossing | point | RangeError | 1.956110185985549 |
| MD-FALSE-below-crossing | ci | RangeError | 1.000000000000000 |
| MD-FALSE-below-missing | point | NaN | 1.956110185985549 |
| MD-FALSE-below-missing | ci | 1.000000000000000 | NA (null) |
| MD-FALSE-below-near-only | point | NaN | 1.956110185985549 |
| MD-FALSE-below-near-only | ci | NaN | 1.418294064071869 |
| MD-FALSE-below-far-only | point | NaN | 1.956110185985549 |
| MD-FALSE-below-far-only | ci | 1.000000000000000 | NA (null) |

All 80 oracle cases additionally pin lower/upper fields: previously absent, now numeric only for the near-null limit; the farther or absent limit is null. New fields do not replace the scalar ci. Full field values are in the adjacent R-generated JSON.

Existing P20 pin changes: p20-r7-evalue-ci.test.mjs missing RR CI engine and widget assertions change 1 to null (RR=2, no CI). Partial near-bound assertions and all valid/crossing native references stay unchanged. The R7 replay script reads the changed engine but its four complete-CI cases retain every old numeric value. No P20 conversion-table/export-provenance values change. No old corpus/reference JSON was rebaselined. Added reference files: p20-p22-evalue-na-reference.R/.json; evalue-legacy-paths.json is a path inventory, not a numeric oracle.
