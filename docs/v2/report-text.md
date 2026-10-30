# Plain-language summary, Methods and Results

[Back to the guides](README.md)

After running [proportion meta-analysis](../../proportion-ma/index.html), open **Report text**. It drafts a plain-language summary, Methods and Results using fixed templates and the app's last results. It does not use an AI writing service or calculate a new statistical model. Sources: `shared/alm-text.js` and `proportion-ma/alm-features-text.js`; browser contract: `hub/shared/tests/features-text-proportion-ma.spec.mjs`.

## Use it

Run the analysis with the data and options you intend to report. Open **Report text**, read the paragraphs, the **Number audit** line and any flags. Use **Copy** beside a paragraph, **Download .md** for Markdown or **Download .docx** for Word. **Regenerate** refreshes the text; returning to the tab also refreshes it. Word export needs the document helper loaded by this app. Sources: `shared/alm-text.js`, `shared/alm-features.js`, `shared/alm-zip.js` and `proportion-ma/index.html`; contracts: `hub/shared/tests/features-text-proportion-ma.spec.mjs` and `hub/shared/tests/features-tabs.spec.mjs`.

## What the audit means

The audit traces numbers to the app's result values or explicitly recorded context, checks their formatting and cross-checks the display values declared by the app's text adapter. If the audit fails, the text is withheld. Without results, the panel asks you to run the analysis first. It checks consistency between text and results; it does not validate the paper's original data. Sources: `shared/alm-text.js` and `proportion-ma/alm-features-text.js`; `hub/shared/tests/features-text-proportion-ma.spec.mjs` tests the normal display, missing results and an intentionally altered result that must be refused.

If inputs change without a new analysis run, copying and downloading are refused. Run the analysis again. If the results have changed since text generation, copying or downloading regenerates and audits the text first. Source: `shared/alm-text.js`; stale-result contracts: `hub/shared/tests/features-text-proportion-ma.spec.mjs`.

The generated text may describe recorded data-entry conversions and design flags. It only states that R verification succeeded when the verification record is valid for the current analysis. Sources: `shared/alm-text.js` and `shared/alm-features.js`; unit contract: `hub/shared/tests/unit/alm-text.test.mjs`; browser stale-verification contract: `hub/shared/tests/features-proportion-ma.spec.mjs`.

## Limits

Treat the paragraphs as a draft to review alongside the analysis. They describe the implemented model and available results; they do not assess study eligibility, risk of bias or clinical importance. A passing number audit is not an independent statistical verification. The fixed templates and audit boundaries are in `proportion-ma/alm-features-text.js` and `shared/alm-text.js`, tested by `hub/shared/tests/features-text-proportion-ma.spec.mjs` and `hub/shared/tests/unit/alm-text-lint.test.mjs`. Use [Verify in R](verify-in-r.md) for the separate calculation comparison.
