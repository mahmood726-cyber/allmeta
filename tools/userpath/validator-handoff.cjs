// node tools/userpath/validator-handoff.cjs [base-url] [app,...] [--webr] [--fresh-only|--stale-only]
// Real system Chrome. For each app: a FRESH profile (empty shared bus) and a returning
// user (stale studies pre-seeded on the bus); BCG pasted in the app's format; every
// control that opens the WebR validator is pressed and what the validator received is
// compared with the page (see hub/shared/tests/_validator_handoff.mjs).
// --webr also runs real WebR in the validator once per app and mode (first passing control).
// A third pass pastes input the page refuses; no control may then open the validator
// (--no-refuse skips it).
"use strict";
const path = require("path"), { pathToFileURL } = require("url");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const pos = args.filter((a) => !a.startsWith("--"));
const base = pos[0] || "https://mahmood726-cyber.github.io/allmeta/";
(async () => {
  const lib = await import(pathToFileURL(path.join(__dirname, "../../hub/shared/tests/_validator_handoff.mjs")).href);
  const apps = pos[1] ? pos[1].split(",") : Object.keys(lib.APPS);
  const modes = flags.has("--fresh-only") ? [false] : flags.has("--stale-only") ? [true] : [false, true];
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--headless=new"] });
  let bad = 0, n = 0;
  for (const app of apps) {
    for (const stale of modes) {
      const ctx = await browser.newContext();
      let rows;
      try { rows = await lib.checkAppHandoff(ctx, base, app, { stale, webr: flags.has("--webr") }); }
      catch (e) { rows = [{ app, stale, control: "(page)", ok: false, error: String(e && e.message || e).slice(0, 300) }]; }
      for (const r of rows) { n++; if (!r.ok) bad++; console.log(JSON.stringify(r)); }
      await ctx.close();
    }
    if (!flags.has("--no-refuse")) {
      // Input the page refuses: no control may open the validator (stale bus pre-seeded).
      const ctx = await browser.newContext();
      let rows;
      try { rows = await lib.checkAppHandoff(ctx, base, app, { stale: true, refuse: true }); }
      catch (e) { rows = [{ app, refuse: true, control: "(page)", ok: false, error: String(e && e.message || e).slice(0, 300) }]; }
      for (const r of rows) { n++; if (!r.ok) bad++; console.log(JSON.stringify(r)); }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(bad ? `FAIL: ${bad} of ${n} control checks hand the validator something other than the page's analysis`
    : `PASS: all ${n} control checks hand the validator the page's analysis`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
