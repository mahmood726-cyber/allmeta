# Real paper extraction validation

Run `node validation/realpaper/run.mjs validation/realpaper/dev.json` from the repository root.
The runner prints every row, the required REALPAPER line, all failure categories, and writes
`dev.results.json` next to the input. It accepts another fixture path without code changes.

The development fixture is an unmodified byte copy of the supplied 65-row fixture.
SHA-256: `8ed9ebba6b5c6494f63af4e4476443a19bb7ed6da2e45b1eed017dbf47f3b322`.
The supplied topic split is preserved in `split.json`, SHA-256:
`c015c7427d5e6490ae1b78bef06b04be8adff121153ce6d0a2f7a63a33674bfc`.
Corpus: `mahmood726-cyber/meta-harness@f498cba6aeb057889b76bda47f0f338a7d89c906`.
No held-out text is included or accessed.

Before extraction, each expected numeric value must occur as a complete literal numeric token
in visible source text (tag attributes excluded). Unicode signs, middle-dot decimals, thousands
separators and trailing zeros are accepted. Missing values are NOT_IN_TEXT and excluded from N.
This check tests occurrence, not whether a coincidentally identical number denotes the intended result.
Counts require exactly two arms, compared as a multiset. Values, measure and every original
UTF-16 span are independently checked. Any correct candidate among multiple candidates is
AMBIGUOUS_PASS, even if candidates have identical numeric values but different source spans.
No numeric tolerances or manual corrections are applied.

Failures receive exactly one category, in priority order: WRONG_SPAN for exact values with
invalid source spans; WRONG_MEASURE for valid values/spans with the wrong named scale;
WRONG_VALUE when candidates of the requested kind exist but none match; otherwise TABLE_LAYOUT
for table text, SPLIT_ACROSS_SENTENCES for separated explicit denominators, or NOT_FOUND.
OTHER is reserved for exceptions. The runner exits nonzero for WRONG_VALUE or OTHER.
The unit tests plant altered values, spans and scales to verify these distinctions.
