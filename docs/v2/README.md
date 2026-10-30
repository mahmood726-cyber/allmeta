# Using the v2 features

These guides describe the features wired into this checkout. Start in the [proportion meta-analysis app](../../proportion-ma/index.html), expand the analysis features panel, and choose **Data entry**, **Report text**, **Straight path**, **Verify in R**, or **Share**. The panel supports arrow keys and Home/End for moving between tabs. Source: `shared/alm-features.js`; browser contract: `hub/shared/tests/features-tabs.spec.mjs`.

| Guide | What it helps you do | Current availability and evidence |
| --- | --- | --- |
| [Smart data entry](smart-data-entry.md) | Review candidate numbers from pasted paper text and confirm their source before using them. | Proportion meta-analysis: `proportion-ma/alm-features.js`; `hub/shared/tests/features-entry-ux.spec.mjs`. |
| [Report text](report-text.md) | Draft a plain-language summary, Methods and Results from the app's results. | Proportion meta-analysis: `proportion-ma/alm-features-text.js`; `hub/shared/tests/features-text-proportion-ma.spec.mjs`. |
| [Verify in R, plots and downloads](verify-in-r.md) | Compare the current analysis with R and save the comparison and plots. | Proportion meta-analysis: `proportion-ma/alm-features.js`; `hub/shared/tests/features-proportion-ma.spec.mjs`. |
| [Share link v2](share-link.md) | Send analysis data, options and recorded source information in a link or analysis file. | Proportion meta-analysis: `proportion-ma/alm-features.js`; `hub/shared/tests/features-share2.spec.mjs`. |
| [Straight Path advice](straight-path.md) | Read prompts about methods, interpretation and uncertainty. | Diagnostic accuracy, proportion, network inconsistency, correlation and multivariate apps: placements in `shared/alm-straight.js`; `hub/shared/tests/features-straight.spec.mjs`. |
| [Yun benchmark harness](yun-benchmark.md) | Understand how extraction is scored against annotated paper results. | A command-line evaluation, not an app tab: `validation/yun/run.mjs`; scorer tests in `validation/yun/metrics.test.mjs`. |

The shared modules do not make every tab available in every app: a tab needs both a loaded module and an app registration. The combined workflow above is wired in `proportion-ma/index.html`; `hub/shared/tests/features-tabs.spec.mjs` exercises it. Straight Path's separate app coverage is listed in its guide.

Use the guides in the order your review needs: check and confirm source rows, run the analysis, review the report text and advice, then verify and save or share it. These are different checks: confirmation records your extraction decision; the text audit checks generated wording against results; R verification compares calculated quantities. None establishes that the chosen studies or analysis answer your clinical question. Their boundaries are implemented in `shared/alm-entry-ui.js`, `shared/alm-text.js` and `shared/alm-verify-r.js`, with contracts in `hub/shared/tests/features-tabs.spec.mjs`, `hub/shared/tests/features-text-proportion-ma.spec.mjs` and `hub/shared/tests/features-proportion-ma.spec.mjs`.

Each feature page names its implementation and test contracts. A named test describes what is checked; it is not a claim that the test has just been run on your device.
