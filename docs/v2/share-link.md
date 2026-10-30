# Share link v2

[Back to the guides](README.md)

The **Share** tab in [proportion meta-analysis](../../proportion-ma/index.html) can preserve the input text, analysis options, forest-axis settings and recorded source information. Opening the link restores those settings and re-runs the analysis. Sources: `shared/alm-share.js` and `proportion-ma/alm-features.js`; browser contract: `hub/shared/tests/features-share2.spec.mjs`, which compares restored results and plot SVG.

## Create and open a link

Open **Share** and choose **Share this analysis** to generate the v2 link. Then choose **Copy share link**, or copy the displayed link manually if clipboard access fails. **Copy reproduction text** copies the accompanying wording. Creation is explicit: the link field starts empty. Source: `shared/alm-share.js`; creation, clipboard fallback and reproduction-text contracts: `hub/shared/tests/features-share2.spec.mjs`.

Use **Share this analysis** before **Copy share link** for the v2 workflow. The standalone copy action retains support for the older link format until v2 generation has run. Source: `shared/alm-share.js`; legacy contract: `hub/shared/tests/features-proportion-ma.spec.mjs`; v2 contract: `hub/shared/tests/features-share2.spec.mjs`.

If the compressed fragment exceeds **8,000 characters**, the panel offers **Download analysis file (.json)** instead. The recipient opens the app's **Share** tab and chooses **Open analysis file**. This threshold is `MAX_FRAGMENT` in `shared/alm-share.js`; the file fallback and restored results are tested by `hub/shared/tests/features-share2.spec.mjs`.

## Version differences and damaged links

The link records the app build. When it differs from the receiving build, restore pauses and warns that results may differ. **Open the archived version** links to the recorded release or source snapshot; **Restore anyway** explicitly allows restoration in the current build. Corrupt links and invalid analysis files are refused without applying them. Source: `shared/alm-share.js`; version, corruption and invalid-file contracts: `hub/shared/tests/features-share2.spec.mjs`.

## Limits and privacy

The data is inside the link or file; creating it does not upload the analysis to a storage service. Anyone who receives it can read the included data and provenance, which can contain pasted paper text. The link is not encrypted, and its checksum detects corruption rather than authenticating its sender. Review what you are sharing. Encoding and the privacy notice are in `shared/alm-share.js`; codec and corruption checks are in `hub/shared/tests/unit/alm-share2.test.mjs` and `hub/shared/tests/features-share2.spec.mjs`.

Sharing does not certify the analysis. Its payload contains the analysis state, provenance and build identity, not an R-verification receipt. Use [Verify in R](verify-in-r.md) in the receiving session. Source: `shared/alm-share.js`; payload and restore contracts: `hub/shared/tests/unit/alm-share2.test.mjs` and `hub/shared/tests/features-share2.spec.mjs`. A different build may produce different results even when the data and settings restore successfully.
