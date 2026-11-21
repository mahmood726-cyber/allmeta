# Duplicate review: T7

Owner decision: **warn and ask before removing any suspected duplicate, including exact identifiers**. Implemented against c71c8dca1a0e341e002114f68276a260235e5b40 on fix/screen-persona-p0. Changes remain in the working tree. No commit, push, branch change or network access.

## Behaviour

- Detection is read-only. It returns pairs without assigning dup, dupManual, dupOf, screening decisions or history. runDedup stores pairs and derives the legacy possibleDupOf compatibility links for unresolved pairs.
- Reason priority: exact-doi, exact-pmid, exact-title, similar-title, then similar-title+author-year. Every pair carries a readable explanation. The first three are exact matches. Exact title normalisation retains words (including stopwords), folds case and accents, and normalises punctuation/spacing; existing Unicode-aware fuzzy normalisation and thresholds remain in use.
- DOI keys ignore case, DOI URL prefixes and doi:. Two different nonempty DOI keys prohibit a pair, even when PMID/title matches. Exact buckets are exhaustive; fuzzy blocks and sorted neighbourhood remain a heuristic for larger imports. Brute detection uses the same reason rules, including author/year assist.
- Imports, examples and project loads show a visible live-status warning linking to Review duplicates. Before any removal it says **“Nothing has been removed.”** After user removals it says only confirmed removals were applied. Screening remains available.
- Each pair shows both titles, IDs, first authors, years, journals, DOI/PMID and source file. File imports retain the filename in sourceFile; older records display their existing source.
- Keep both resolves a pair without changing records. Remove targets the second displayed record; Swap changes that target. Native keyboard buttons have record-specific accessible labels. Focus returns to the review summary after decisions; Swap retains focus on that pair's control.
- “Remove all exact matches (N)” plans safe removals over unresolved exact pairs, then confirms N, reasons and targets. Cancel changes nothing. Similar pairs and previously kept pairs are never included.
- Overlapping pairs: three identical records produce three pairs but only two distinct safe removals. Bulk displays 2, removes two records after confirmation, and leaves the third pair unresolved. It never silently records Keep both for related pairs. Keep/Remove are disabled while a pair contains an already removed record; Undo the linked removal to review that pair. An anchor of another removal cannot itself be removed, preventing DOI bridges. Swap may make a blocked direction reviewable.
- The existing manual Duplicate control opens pair review when a suspected pair exists. For an unrelated manually identified duplicate it asks for confirmation and retains the audited toggle/restore behaviour. Legacy explicit manual flags remain user choices.

## Data model and persistence

The existing screen-v1 / workflow v2 envelope remains compatible.

- duplicatePairs[] contains id, firstId, secondId, reason, reasonText and exact. The ID is a JSON-encoded sorted two-record ID array; initial presentation follows import order. Pair data is recomputed on load/re-detection.
- duplicateDecisions[] contains decision/pair IDs, both record IDs, machine/readable reason, action (keep/remove), removedId, keptId, actor, timestamp, bulk flag and prior duplicate fields. Undo adds undoneAt/undoneBy and a separate audit event. A later decision creates another history entry.
- Each participating record's duplicateHistory[] retains decision IDs, including undone decisions. Removed records stay in the project with their own title/abstract and full-text decisions, evidence, labels and history. Removal never copies the other record's decisions.
- dup, dupManual and dupOf preserve existing screening/ranking eligibility. dupManual denotes an explicit user removal, including reviewed bulk actions. Detector results never set these fields.
- localStorage, project JSON and bundles include all records, pairs, decisions and audit entries. Restore validates decision identities, actions, reasons, timestamps and consistency of active removals. Undo restores the record without overwriting screening/evidence fields.
- On load, dup without dupManual is released even for exact DOI matches. Releases are audited as dedup-recheck; stale rankings and full-text stage transitions are handled as before. Persisted manual choices are restored, never inferred from detection.

## Audit, PRISMA and exports

Every reviewed Keep/Remove writes duplicate-kept or duplicate-confirmed, including actor, timestamp, pair, reason, action and target. Bulk writes one event per removal with bulk:true. Undo appends duplicate-undo with the decision/pair/reason and restored record ID. Original decision events remain intact. Actor is the existing local reviewer slot, not authenticated identity.

ScreenWorkflow.flow().duplicates counts explicit persisted/user removals once per record. unresolvedDuplicatePairs counts pairs with no active decision, including related pairs left unresolved after another removal. Progress and the workflow summary expose unresolved pairs. PRISMA removed uses confirmed removals only, labels the breakdown “User-confirmed duplicate removals”, and includes unresolvedDuplicatePairs. Existing pending-screening and blind-review export restrictions remain intact.

CSV excludes confirmed duplicate rows and adds duplicate_review JSON per retained record. RIS remains the existing final-full-text-includes export, excludes confirmed duplicates through effective eligibility, and adds an N1 duplicate-review annotation. Both annotate active/undone decisions and unresolved pairs involving retained records, so the retained partner carries the removal decision. JSON/bundle remain complete restorable backups including removed rows.

## Every changed existing test assertion

No unrelated expectations were relaxed. No persona tests/specs were added to another runner.

| File / case | Assertion change | Reason |
| --- | --- | --- |
| screen/tests/persona_fixes.test.cjs, S06 | Card expects data-review-duplicates instead of data-confirm-dup. | Open side-by-side review before removal. |
| Same S06 case | Exact-DOI PRISMA duplicates changes 1 to 0; adds exact-doi reason. | Identifiers are suggestions until user removal. Explicit-confirmation/Undo/conflicting-DOI assertions remain. |
| screen/tests/test_persona_fixes.py, S06 | Emission guard expects info.pairs.push instead of possibleDupOf.push inside detection. | Detector returns pairs; compatibility links are derived separately. |
| Same static case | Candidate UI guard expects data-review-duplicates. | Full pair review replaces the card-only confirmation button. |
| Same static case | Audit guard expects the Keep/Remove dispatcher instead of the old single literal call. | Both use the same audited handler; behavioral tests still require duplicate-confirmed. |
| tests/playwright/alm-screen-core.spec.mjs, exact DOI | Removed count 1 becomes 0; second dup true becomes false; dupOf “a” becomes null. Adds one pair and exact-doi reason. | No record is removed during detection. First record's false flag remains unchanged. |
| Same file, case-insensitive DOI | Automatic count 1 becomes removed count 0; adds one exact-doi pair. | Case folding still detects the match without removing it. |
| tests/playwright/alm-screen-upgrade.spec.mjs, blocked/brute parity | Existing lower bound, equality and zero-missed assertions compare returned pair ID sets instead of candidate-record ID sets. | Pair-level detection is the contract; using each return value independently avoids comparing shared state to itself. |
| Same file, author/year low similarity | Existing zero expectation checks pairs.length instead of merges. | Merge count is always zero; the strengthened check verifies no false candidate. |
| tests/playwright/screen-workflow.spec.mjs, demo | Seven-record, zero-removal and one-candidate assertions retained. Adds one pair, exact-title, warning and two displayed records. | Identical demo title is an exact suggestion retained pending user action. Updated the zero-removal comment. |

Other exact-manual duplicate fixtures in kappa/ranking tests are unchanged: they represent previous explicit user decisions.

## New tests and validation

- screen/tests/dedup_review.test.cjs: 10 tests with synthetic __control_* records. All five reasons, immutable blocked/brute detection, conflicting DOI exclusion, author/year gates, exact-only bulk confirmation/cancellation, Keep/Remove/Undo, own screening/evidence history, reload, JSON/bundle round trips, CSV/RIS, PRISMA, legacy migration and overlapping-pair/DOI-bridge guards.
- screen/tests/test_dedup_review.py: five static guards for read-only detection, user-only flag writes, warning/accessibility, confirmed exact-only bulk/audit and PRISMA/export separation.
- tests/playwright/screen-dedup-review.spec.mjs: three browser scenarios for actual file import, warning/details/reasons, keyboard Keep, per-pair Remove, bulk cancel/confirm, reload, counts, Swap, history and Undo.

Executed here: **46 Python tests passed** across dedup-review, persona, structure and regression guards. All five new static tests fail against original c71c8dc source copied before editing.

Supplementary V8 execution: **10/10 new behavioral cases and 19/19 existing persona cases passed**, using the same bodies with substitutes for Node modules, Blob and DOM. All ten new cases fail against original source. This is **not a Node or Playwright result**.

Node, npx and PowerShell were not started. Playwright rendering, native focus and screen-reader behavior remain host checks. Existing encodings and line endings were retained; screen/index.html remains UTF-8 CRLF with no bare LF. No dependencies or runner configurations changed.

Host commands from the repository root:

    node --test screen/tests/dedup_review.test.cjs screen/tests/persona_fixes.test.cjs
    python -m pytest -q -p no:cacheprovider screen/tests/test_dedup_review.py screen/tests/test_persona_fixes.py screen/tests/test_structure.py screen/tests/test_regressions.py

From tests/playwright, using installed host browser/dependencies:

    npx playwright test --config playwright.config.ts screen-dedup-review.spec.mjs alm-screen-core.spec.mjs alm-screen-upgrade.spec.mjs screen-workflow.spec.mjs

## Files changed

- screen/index.html
- screen/workflow.js
- screen/PERSONA-FIXES.md
- screen/DEDUP-REVIEW.md
- screen/tests/dedup_review.test.cjs
- screen/tests/test_dedup_review.py
- screen/tests/persona_fixes.test.cjs
- screen/tests/test_persona_fixes.py
- tests/playwright/screen-dedup-review.spec.mjs
- tests/playwright/alm-screen-core.spec.mjs
- tests/playwright/alm-screen-upgrade.spec.mjs
- tests/playwright/screen-workflow.spec.mjs

CODEX_T7_DONE
