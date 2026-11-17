// r_check_driver.cjs <url> <actions-json> <dom-expression> [options-json]
// Drives the page in headless Chrome like a user (playwright-core: ALM_PLAYWRIGHT; browser: ALM_CHROME):
// applies the actions, reads the DISPLAYED result from the DOM (dom-expression), then clicks the real
// "Download R script" button and returns the downloaded file; with {"webr": true} it also clicks
// "Verify this analysis in R (WebR)" and waits for R. Prints one JSON object on stdout:
// { dom, downloaded, script, status, webr }.
"use strict";
const fs = require("fs");
const pw = require(process.env.ALM_PLAYWRIGHT || "playwright-core");
async function until(p, expr, ms) {   // poll with page.evaluate: the page CSP forbids eval-based waitForFunction
  const t0 = Date.now();
  while (!(await p.evaluate(expr))) { if (Date.now() - t0 > ms) throw new Error("timed out: " + expr); await p.waitForTimeout(500); }
}
(async () => {
  const [url, actsJson, domExpr, optJson] = process.argv.slice(2);
  const acts = JSON.parse(actsJson || "[]"), opt = JSON.parse(optJson || "{}");
  const b = await pw.chromium.launch({ executablePath: process.env.ALM_CHROME || undefined, headless: true, args: ["--headless=new"] });
  const res = { dom: null, downloaded: false, script: null, status: null, webr: null };
  try {
    const p = await (await b.newContext({ acceptDownloads: true })).newPage();
    await p.goto(url, { waitUntil: "load", timeout: 180000 }); await p.waitForTimeout(1000);
    for (const a of acts) {
      if (a.fill !== undefined) await p.fill(a.fill, a.value);
      if (a.select) await p.selectOption(a.select, a.value);
      if (a.click) await p.click(a.click);
      if (a.wait) await p.waitForTimeout(a.wait);
      if (a.waitFor) await until(p, a.waitFor, 300000);
    }
    await p.waitForTimeout(300);
    res.dom = await p.evaluate(domExpr);
    const dlP = p.waitForEvent("download", { timeout: opt.refuse ? 4000 : 60000 }).catch(() => null);
    await p.click("#btn-r-script");
    const dl = await dlP;
    if (dl) { res.downloaded = true; res.script = fs.readFileSync(await dl.path(), "utf8"); }
    res.status = await p.evaluate(() => document.getElementById("r-check-status").textContent);
    if (opt.webr) {
      await p.click("#btn-r-webr");
      await until(p, '/R says|did not run|printed no MATCH|did not load|Nothing to check/.test(document.getElementById("r-check-status").textContent)', 1200000);
      res.status = await p.evaluate(() => document.getElementById("r-check-status").textContent);
      res.webr = await p.evaluate(() => document.getElementById("r-check-out").textContent);
    }
  } finally { await b.close(); }
  process.stdout.write(JSON.stringify(res));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
