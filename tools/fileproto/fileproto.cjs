// fileproto.cjs [app ...] -- open apps from a local copy (file://) in system Chrome and
// check that what a user does there either works or says plainly why it cannot.
// Pages are advertised as running offline from a local copy; file:// blocks ES modules,
// fetch() of local files, Workers and reading rules of linked stylesheets.
//   npm install playwright-core   (drives the system Chrome; no browser download)
//   node tools/fileproto/fileproto.cjs            # every app with a check below
//   node tools/fileproto/fileproto.cjs gosh       # one app
// Exit 1 if any check fails, 3 if a page could not be driven at all.
// Added 2026-11-12 (lane fileproto): gosh's extras Validate panel vanished on file://
// because validate/adapter-plus.js threw reading cssRules at load.
"use strict";
const path = require("path"), url = require("url");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ROOT = path.resolve(__dirname, "..", "..");

// Each check gets (page, errors) after the page has loaded; returns a list of failures.
// Method-help tips must carry the glossary definition, not just repeat the abbreviation.
async function glossaryTips(p) {
  const fails = [];
  await p.waitForTimeout(1500);
  const tips = await p.evaluate(() => [...document.querySelectorAll("abbr[data-gloss]")].map((a) => {
    const t = document.getElementById(a.getAttribute("aria-describedby") || "");
    return { term: a.textContent.trim(), tip: t ? t.textContent : null };
  }));
  if (!tips.length) fails.push("page has no method-help terms to check");
  const bare = tips.filter((t) => !t.tip || t.tip.trim() === t.term);
  if (bare.length) fails.push(bare.length + "/" + tips.length + " method-help tips show only the abbreviation, e.g. " + JSON.stringify(bare.slice(0, 3)));
  return { fails, tips };
}

// Vendored libraries carry integrity= (SRI). Chrome cannot check SRI on file://, so it
// refused them and the library was missing; every vendored global must exist.
const VENDOR_GLOBAL = { jszip: "JSZip", chart: "Chart", d3: "d3", plotly: "Plotly", jspdf: "jspdf", html2canvas: "html2canvas", xlsx: "XLSX", docx: "docx" };
async function vendorLibraries(p) {
  const want = await p.evaluate(() => [...document.querySelectorAll("script[integrity][src*='vendor/']")].map((s) => s.getAttribute("src")));
  if (!want.length) return ["page has no vendored integrity scripts to check"];
  const fails = [];
  for (const src of want) {
    const key = src.split("/").pop().split(/[-.]/)[0];
    const g = VENDOR_GLOBAL[key];
    if (!g) { fails.push("no global known for " + src); continue; }
    if (!(await p.evaluate((g) => typeof window[g] !== "undefined", g))) fails.push(src + " did not load (window." + g + " undefined)");
  }
  return fails;
}
const SRI_PAGES = ["HTA/index.html", "nma-dose-response-app/index.html", "nma-pro-v2/nma-pro-v8.0.html", "revman-importer/index.html", "Truthcert1/TruthCert-PairwisePro-v1.0-production.html", "Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html"];

const CHECKS = {
  ...Object.fromEntries(SRI_PAGES.map((page) => [page, vendorLibraries])),
  async influence(p) {
    const en = await glossaryTips(p);
    const fails = en.fails.slice();
    // The language switch must load the translated glossary from file:// too.
    const sel = p.locator(".alm-lang-switch select");
    if (!(await sel.count())) fails.push("no method-help language switch");
    else {
      await sel.selectOption("es");
      const es = await glossaryTips(p);
      fails.push(...es.fails.map((f) => "es: " + f));
      if (!es.fails.length && es.tips.every((t, i) => t.tip === en.tips[i].tip)) fails.push("es: tips did not change after switching to Spanish");
    }
    return fails;
  },
  async gosh(p, errors) {
    const fails = [];
    await p.getByRole("button", { name: /^Run analysis$/ }).first().click();
    await p.waitForTimeout(2000);
    await p.click("#plus-refresh");
    await p.waitForTimeout(2000);
    const panel = p.locator("#alm-plus-validate");
    const buttons = await panel.locator("button").allTextContents();
    if (!buttons.includes("Re-run extras validation")) fails.push("extras Validate panel did not mount (buttons: " + JSON.stringify(buttons) + ")");
    const text = await panel.innerText();
    if (!/opened from a local file \(file:\/\/\)/.test(text)) fails.push("extras panel does not say the extras check cannot run from file://");
    if (buttons.includes("Re-run extras validation")) {
      // Do what the panel asks a file:// user to do: select the corpus files, then replay.
      const input = panel.locator("input[type=file]");
      if (await input.count()) await input.setInputFiles(["corpus.json", "reference.json"].map((f) => path.join(ROOT, "gosh", "validate", "plus", f)));
      else fails.push("extras panel offers no corpus file input on file://");
      await panel.locator("button", { hasText: "Re-run extras validation" }).click();
      let after = "";
      for (let i = 0; i < 30 && !/Validation refused|passed|failed/i.test(after); i++) { await p.waitForTimeout(1000); after = await panel.innerText(); }
      if (!/Validation refused: .*file:\/\//.test(after)) fails.push("pressing Re-run extras validation did not show a visible file:// refusal; panel reads: " + after.slice(0, 300));
    }
    return fails;
  }
};

(async () => {
  const apps = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHECKS);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
  let failed = 0, blocked = 0;
  for (const app of apps) {
    if (!CHECKS[app]) { console.log("BLOCKED " + app + ": no check defined"); blocked++; continue; }
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    let fails;
    try {
      await p.goto(url.pathToFileURL(path.join(ROOT, /\.html$/.test(app) ? app : path.join(app, "index.html"))).href, { waitUntil: "load", timeout: 60000 });
      await p.waitForTimeout(2000);
      fails = await CHECKS[app](p, errors);
      for (const e of errors) fails.push("uncaught page error: " + e);
    } catch (e) { console.log("BLOCKED " + app + ": " + e.message); blocked++; await ctx.close(); continue; }
    await ctx.close();
    if (fails.length) { failed++; console.log("FAIL " + app); for (const f of fails) console.log("  - " + f); }
    else console.log("PASS " + app);
  }
  await browser.close();
  process.exit(blocked ? 3 : failed ? 1 : 0);
})();
