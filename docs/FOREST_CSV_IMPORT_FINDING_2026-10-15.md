# Forest CSV import integrity follow-up (15 October 2026)

Status: application correction and nine browser regression cases are implemented in PR #114; current-head CI, merge and deployment must be checked separately. The user authorised merging this bounded repair if its checks pass. This is not comprehensive application certification.

## Confirmed original defect

At main `815aebc839779bec1d8781c8095c3797c1907aae`, the adapter used `rows.filter` before changing the native textarea. With header `study,yi,vi` and rows `A,0.1,0.04`, `B,0.3,0.04`, `C,9,-0.04`, it discarded the invalid third record. The remaining two records have fixed-effect estimate 0.20. No valid full analysis exists for the supplied negative variance; 0.20 is the result of an unannounced subset, not a corrected three-study estimate.

Correction to the initial audit note: the shared parser accepts a negative value as a finite float and does NOT warn about its sign. The loss occurs in the Forest adapter's `vi > 0` filter. Missing `yi` is a protective regression case, not an independently established second silent-subset defect: the shared parser returns null and a warning, and the native parser may subsequently block that row. Nine tests do not imply nine newly discovered numerical bugs.

## Bounded repair

Validate every typed effect, positive representable variance and native-compatible single-line label before changing the study set. Require unique exact `study`, `yi`, `vi` headers; reject parser warnings. On rejection, clear cached results through the existing render path, display an escaped/literal-text explanation, retain pasted CSV for correction, and preserve Undo to the pre-import analysis. Keep full representable precision for valid variance-to-SE conversion. Pooling estimators and shared numerical code are unchanged.

## Reproduction and verification

The original downloadable patch had malformed hunk metadata. Its exact two application replacements were applied to the verified main Pages artifact. Original Forest blob: `5cdec8649b13b33f457b0ee4061d6411893ab68d`; candidate blob: `174aad4a1848d7f26f4d3165ad70fbd33a2b6d54`. All seven inline JavaScript blocks passed local Node syntax checks. Local Chromium navigation was blocked before the app loaded (`ERR_BLOCKED_BY_ADMINISTRATOR`); do not count that as a browser pass.

`hub/shared/tests/forest-csv-import-atomic.spec.mjs` adds eight rejection/Undo cases plus one actual file-upload case checking quoted comma labels, variance precision and independent inverse-variance arithmetic. The upload assertion waits for newly imported data, not just k=3 (which was also true before import). Existing read-only Forest integrity CI runs these with its earlier browser and pinned-R checks using `npx playwright test forest --reporter=line`. Consult the current-head check results and PR timeline for executed evidence; no fresh-R result is asserted merely from source inspection.

## Remaining scope

The shared CSV tokenizer's broader grammar and extra row-cell handling, native JSON imports, receipt/state round-trips, accessibility/mobile behaviour and numerical extremes remain separate review work. The app register and its completion flags must not equate this scoped repair or a green smoke suite with full review.
