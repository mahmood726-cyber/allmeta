// r_check_driver.cjs <url> <actions-json-string> <hook-expression>
// Drives the page in headless system Chrome (playwright-core: set ALM_PLAYWRIGHT to its path),
// applies the actions like a user, then prints {script, displayed} as JSON on stdout.
"use strict";
const pw = require(process.env.ALM_PLAYWRIGHT || "playwright-core");
(async () => {
  const [url, actsJson, hook] = process.argv.slice(2);
  const acts = JSON.parse(actsJson || "[]");
  const b = await pw.chromium.launch({ executablePath: process.env.ALM_CHROME || undefined, headless: true, args: ["--headless=new"] });
  try {
    const p = await (await b.newContext()).newPage();
    await p.goto(url, { waitUntil: "load", timeout: 180000 }); await p.waitForTimeout(1000);
    for (const a of acts) {
      if (a.fill) await p.fill(a.fill, a.value);
      if (a.select) await p.selectOption(a.select, a.value);
      if (a.click) await p.click(a.click);
      if (a.wait) await p.waitForTimeout(a.wait);
      if (a.waitFor) { const t0 = Date.now(); while (!(await p.evaluate(a.waitFor))) { if (Date.now() - t0 > 300000) throw new Error("timed out: " + a.waitFor); await p.waitForTimeout(500); } }
    }
    await p.waitForTimeout(300);
    const script = await p.evaluate(hook);
    const displayed = await p.evaluate(() => (document.querySelector("main") || document.body).innerText);
    process.stdout.write(JSON.stringify({ script, displayed }));
  } finally { await b.close(); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
