# Smart data entry

[Back to the guides](README.md)

In [proportion meta-analysis](../../proportion-ma/index.html), **Data entry** offers possible results from pasted paper text or a table. It uses local extraction rules; you choose which result and study arm to use. It does not turn a candidate into an accepted study row without your confirmation. Sources: `shared/alm-entry.js`, `shared/alm-entry-ui.js` and `proportion-ma/alm-features.js`; browser contracts: `hub/shared/tests/features-tabs.spec.mjs` and `hub/shared/tests/features-entry-ux.spec.mjs`.

## Use it

- Expand the analysis features panel and choose **Data entry**. Enter your initials and paste the exact source text into **Paste the exact paper text or table**.
- Choose **Extract candidates**, select the result you need, then **Add chosen result**. Check the highlighted source numbers and choose **Arm to use**.
- Record the study label, reference, source type and location, outcome, timepoint, arm role and who is counted in the denominator. Answer **What was randomised?** and resolve the prompts shown for that row.
- Check **I confirm this row** only after checking its source and meaning. Confirm each row, then choose **Use these rows**. In this app, that writes events, totals and labels into the analysis input and runs the analysis.

These controls and the confirmation gate are in `shared/alm-entry-ui.js`; applying rows is in `proportion-ma/alm-features.js`. `hub/shared/tests/features-tabs.spec.mjs` tests the workflow and checks that an unconfirmed row blocks application. `hub/shared/tests/features-entry-ux.spec.mjs` checks arm assignment, source details and confirmation initials.

## Understand warnings and keep the source record

Rows from the same report or pasted text can be related. For single-group pooling, the panel asks for an explicit acknowledgement before pooling them separately. That acknowledgement records your decision; it does not establish independence. The source record, called provenance, retains the pasted evidence, selected values, choices, conversions and flags. **Export provenance CSV** and **Export provenance DOCX** save that record. **Compare with another extraction (CSV)** reports disagreements for review. Sources: `shared/alm-entry-ui.js` and the provenance helpers in `shared/alm-entry.js`; browser contract: `hub/shared/tests/features-entry-ux.spec.mjs`; unit contract: `hub/shared/tests/unit/alm-entry-provenance.test.mjs`.

For cluster-randomised studies, review the design-effect questions and whether the reported analysis already accounts for clustering. A supported conversion records its inputs and formula; unresolved or altered evidence can block confirmation or application. A change to a row's stored source text requires review and re-confirmation. Sources: `shared/alm-entry.js` and `shared/alm-entry-ui.js`; browser contract: `hub/shared/tests/features-entry-ux.spec.mjs`, including the check that refuses an altered design-effect formula.

## Limits

This workflow reads pasted text; it is not a PDF reader or a guarantee of correct extraction. If no supported result is found, the panel asks for more explicit source text. Candidate order does not decide the outcome, arm or timepoint for you. Check the paper and the resulting analysis input. Sources: `shared/alm-entry-ui.js` and `proportion-ma/alm-features.js`; contracts: `hub/shared/tests/features-entry-ux.spec.mjs` and `hub/shared/tests/features-tabs.spec.mjs`.
