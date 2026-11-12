// node tools/userpath/bus-handoff.cjs <app> <base-url> <data-file> <textarea-sel> <n-rows> [select=value ...] [expect-method=M] [expect-test=T]
// expect-method / expect-test (added 2026-11-12, lane integ): also require the
// validator's tau^2 estimator / test selects to read M / T when it opens, so a
// control that hands over the right studies but no estimator (validator falls back
// to PM) is a FAIL. Without them only the studies are checked.
// Real system Chrome. For every control that opens the WebR validator ("Verify in R",
// "Validate (R)", "Continue with -> Verify in R (WebR)"), in its own fresh browser
// context, twice: (1) empty localStorage, (2) the shared bus pre-seeded with 3 stale
// studies. Pastes the data, runs, presses ONLY that control, and checks the validator
// tab opened (no alert) holding exactly the page's <n-rows> studies. It does not run
// WebR (userpath.cjs does); it checks what the validator is handed.
// Exit 0 = every control hands over the page's studies; 1 = at least one does not.
// Added 2026-11-12 (lane up2): a harness that pressed "Validate (R)" first seeded the
// bus and hid the stale-bus path of "Verify in R" and of the Continue-with link.
"use strict";
const fs = require("fs");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const [app, base, dataFile, taSel, nRowsS, ...rest] = process.argv.slice(2);
const nRows = +nRowsS;
const expect = {};
const sels = rest.filter((a) => { const m = /^expect-(method|test)=(.+)$/.exec(a); if (m) expect[m[1]] = m[2]; return !m; });
const STALE = [{ label: "stale A", est: 9.1, se: 0.5 }, { label: "stale B", est: 9.2, se: 0.5 }, { label: "stale C", est: 9.3, se: 0.5 }];
const CONTROLS = [["Verify in R", "#btn-verify-in-r"], ["Validate (R)", "#btn-validate-webr"], ["Continue with -> Verify in R (WebR)", "text=Verify in R (WebR)"]];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--headless=new"] });
  let bad = 0, ran = 0;
  for (const stale of [false, true]) {
    for (const [name, sel] of CONTROLS) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const dialogs = [];
      page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
      await page.goto(base + app + "/", { waitUntil: "load", timeout: 120000 });
      await page.waitForTimeout(2500);
      if (!(await page.$(sel))) { console.log(JSON.stringify({ app, stale, control: name, absent: true })); await ctx.close(); continue; }
      if (stale) await page.evaluate((s) => window.MaStudies.write(s), STALE);
      for (const sv of sels) { const [s, v] = sv.split("="); await page.selectOption(s, v); }
      await page.evaluate(([s, d]) => { const t = document.querySelector(s); t.value = d; t.dispatchEvent(new Event("input", { bubbles: true })); t.dispatchEvent(new Event("change", { bubbles: true })); }, [taSel, fs.readFileSync(dataFile, "utf8")]);
      await page.click("#btn-run"); await page.waitForTimeout(1500);
      const popP = ctx.waitForEvent("page", { timeout: 10000 }).catch(() => null);
      await page.click(sel, { timeout: 10000 });
      const pop = await popP;
      let rows = null, first = null, model = {}, staleRows = null;
      if (pop) {
        await pop.waitForLoadState("load").catch(() => {}); await pop.waitForTimeout(2500);
        const v = await pop.evaluate(() => (document.getElementById("f-data") || {}).value || "");
        const lines = v.split(/\r?\n/).filter((l) => l.trim() && !/^#/.test(l.trim()));
        rows = lines.length; first = lines[0] || null;
        // every row, not just the first: a stale study anywhere in the hand-over is a FAIL
        staleRows = lines.filter((l) => /stale [ABC]/.test(l)).length;
        model = await pop.evaluate(() => ({ method: (document.getElementById("f-method") || {}).value || null,
          test: (document.getElementById("f-test") || {}).value || null, url: location.search })).catch(() => ({}));
      }
      const sameModel = Object.keys(expect).every((k) => model[k] === expect[k]);
      const ok = !!pop && !dialogs.length && rows === nRows && staleRows === 0 && sameModel;
      ran++; if (!ok) bad++;
      console.log(JSON.stringify({ app, stale, control: name, ok, opened: !!pop, dialogs, validatorRows: rows, pageRows: nRows, firstRow: first, staleRows,
        validatorMethod: model.method || null, validatorTest: model.test || null, expect, query: model.url || null }));
      await ctx.close();
    }
  }
  await browser.close();
  if (!ran) { console.log("FAIL: no validator control found on the page (0 runs)"); process.exit(1); }
  console.log(bad ? `FAIL: ${bad}/${ran} control runs hand the validator something other than the page's studies (and, if expected, its estimator/test)` : `PASS: ${ran}/${ran} control runs hand the validator the page's studies${Object.keys(expect).length ? " and " + JSON.stringify(expect) : ""}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
