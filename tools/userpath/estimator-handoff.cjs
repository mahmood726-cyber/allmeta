// node tools/userpath/estimator-handoff.cjs [base-url] [app,...]
// Real system Chrome (review of PR #537). For every app whose WebR-validator banner names
// an on-page row R should equal (tsa, pet-peese, copas, bayesian-ma): edit the input after
// the analysis without re-running, press "Verify in R", and require the validator's fit,
// rounded as the page rounds, to be what that row shows; for copas also choose a tau^2
// estimator and press at once (debounced refit) and after the refit. See
// hub/shared/tests/_validator_handoff.mjs (SHOWN, checkEditedInput, checkCopasModelFollowsDisplay).
// Exit 0 = every check passes; 1 = at least one fails; 2 = harness error.
"use strict";
const path = require("path"), { pathToFileURL } = require("url");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const base = pos[0] || "https://mahmood726-cyber.github.io/allmeta/";
(async () => {
  const lib = await import(pathToFileURL(path.join(__dirname, "../../hub/shared/tests/_validator_handoff.mjs")).href);
  const apps = pos[1] ? pos[1].split(",") : Object.keys(lib.SHOWN);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--headless=new"] });
  let bad = 0, n = 0;
  const emit = (r) => { n++; if (!r.ok) bad++; console.log(JSON.stringify(r)); };
  for (const app of apps) {
    const ctx = await browser.newContext();
    try { emit(await lib.checkEditedInput(ctx, base, app)); }
    catch (e) { emit({ app, check: "edited-input", ok: false, error: String(e && e.message || e).slice(0, 300) }); }
    await ctx.close();
  }
  if (apps.includes("copas")) {
    const ctx = await browser.newContext();
    try { for (const r of await lib.checkCopasModelFollowsDisplay(ctx, base)) emit(r); }
    catch (e) { emit({ app: "copas", check: "model-follows-display", ok: false, error: String(e && e.message || e).slice(0, 300) }); }
    await ctx.close();
  }
  await browser.close();
  if (!n) { console.log("FAIL: 0 checks ran"); process.exit(1); }
  console.log(bad ? `FAIL: ${bad} of ${n} checks: the validator would fit something other than the row the page shows` : `PASS: all ${n} checks: the validator fits the row the page shows`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
