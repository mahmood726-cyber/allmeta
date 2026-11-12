// node tools/userpath/het-handoff.cjs [base-url] [tau2,...]  -- real system Chrome
// Runs the same check as hub/shared/tests/heterogeneity-validator-handoff.spec.mjs
// against any base (live site or a local serve.cjs) without @playwright/test.
"use strict";
const path = require("path"), { pathToFileURL } = require("url");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const base = process.argv[2] || "https://mahmood726-cyber.github.io/allmeta/";
const ests = (process.argv[3] || "reml,pm,sj").split(",");
(async () => {
  const { checkHandoff } = await import(pathToFileURL(path.join(__dirname, "../../hub/shared/tests/_het_validator_handoff.mjs")).href);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--headless=new"] });
  let bad = 0;
  for (const tau2 of ests) {
    const ctx = await browser.newContext();
    const rows = await checkHandoff(ctx, base, { tau2, stale: true });
    for (const r of rows) {
      const ok = r.opened && !r.dialogs.length && r.sameStudies && r.sameModel && r.sameTau2;
      if (!ok) bad++;
      console.log(JSON.stringify({ tau2, control: r.control, ok, opened: r.opened, dialogs: r.dialogs, method: r.method, test: r.test, appEstimator: r.appEstimator,
        validatorTau2: r.tau2, appTau2: r.appTau2, sameStudies: r.sameStudies, nRows: r.rows && r.rows.length, url: r.url }));
    }
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? `FAIL: ${bad} control(s) hand the validator something other than the page's analysis` : "PASS: every control hands the validator the page's analysis");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
