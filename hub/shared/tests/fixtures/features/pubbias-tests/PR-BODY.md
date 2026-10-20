Adds the pubbias-tests adapter for shared data entry, report text, Verify in R and share links.

This PR depends on the shared features integration stack at a2389ad (feat/alm-features-integ). Against main, its ancestry includes shared feature modules, live adapters, other apps, validation assets and workflows. App 6 review covers only the pubbias-tests wiring; it does not approve that integration stack.

Merge dependency: do not merge this PR into main until the integration stack has been independently reviewed and merged through its own PR. Then rebase this branch onto main and confirm that the remaining diff contains only the app 6 adapter, additive index mount/scripts, feature tests and snapshot. No integration PR was found by the current repository search; that dependency remains unresolved.

Historical validation at 24d467015a05bdc3463bc903d6c59bcd6d56f4d0 (Windows, Edge, R 4.6.0):
- Unit: 533 passed; scope and additive-index gates passed.
- Browser: 7 passed; entry round trips 3/3.
- Text audit: 61/61; planted mismatch 60/61 FAIL; binary 81/81.
- Verify in R: 11/11; planted perturbation 10/11 FAIL.
- ZIP: 9/9 entries, including validated PNG/PDF/TIFF and content hash.

Independent review follow-up fixes and regression tests are implemented locally and are not yet on this PR head. External round 3 validation of that working tree passed 533 unit tests and all 11 browser tests, including generic VERIFY 11/11 (planted 10/11 FAIL), binary VERIFY 15/15 (planted 14/15 FAIL), stale-result receipt binding, package-unavailable cases, exports and accessibility. The run printed SOME_TESTS_FAILED solely because its scope allowlist rejects the root REPORT.md requested by the task. The report has now been relocated into the allowed app fixture directory; the next external run must confirm the full gate. These working-tree results do not certify the published PR head.

Keep this PR draft until the integration dependency is resolved, the fixes are pushed, all required CI passes on the final head, and independent review passes. Audited reporting of both R package versions still needs a shared formatter change; the adapter names meta and directs readers to its recorded version in Verify in R.
