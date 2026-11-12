// userpath.cjs — drive one allmeta app the way a user does, in system Chrome.
// node userpath.cjs <app> <outdir> [--pasted <file>] [--base <url>]
// Captures: displayed text after default run, every R-related control's result
// (WebR output in page or new tab, downloaded .R scripts), console, failed requests.
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const app = process.argv[2], out = process.argv[3];
const argv = process.argv.slice(4);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt("base", "https://mahmood726-cyber.github.io/allmeta/");
const PASTED = opt("pasted", null);
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
fs.mkdirSync(out, { recursive: true });
const log = [];
const note = (s) => { log.push(new Date().toISOString() + " " + s); fs.writeFileSync(path.join(out, "log.txt"), log.join("\n") + "\n"); };
const R_RE = /verify in r|validate \(r\)|validate this analysis in r|webr|run in r|\bR code\b|download.*\.r\b|\.R script|copy r|r script|check in r/i;

async function bodyText(p) { try { return await p.evaluate(() => document.body.innerText); } catch (e) { return "(unreadable: " + e.message + ")"; } }

async function settle(p, maxMs, re) {
  // wait until text stops changing for 8 s or matches a terminal pattern
  const t0 = Date.now(); let last = "", stableSince = Date.now();
  while (Date.now() - t0 < maxMs) {
    await p.waitForTimeout(2000);
    const t = await bodyText(p);
    if (t !== last) { last = t; stableSince = Date.now(); }
    const busy = /booting|installing|loading|verifying sha|running|fitting|please wait|starting webr|downloading|initialis|initializ|importing|using webr baseurl|---- running ----/i.test(t.slice(-4000));
    if (re && re.test(t) && Date.now() - stableSince > 8000 && !busy) return t;
    if (!busy && Date.now() - stableSince > 20000) return t;
  }
  return last;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 1000 } });
  const consoleLog = [], failed = [];
  const hook = (p, tag) => {
    p.on("console", (m) => consoleLog.push(`[${tag}] ${m.type()}: ${m.text()}`.slice(0, 2000)));
    p.on("pageerror", (e) => consoleLog.push(`[${tag}] PAGEERROR: ${e.message}`));
    p.on("requestfailed", (r) => failed.push(`[${tag}] FAILED ${r.url()} ${r.failure() && r.failure().errorText}`));
    p.on("response", (r) => { if (r.status() >= 400) failed.push(`[${tag}] HTTP ${r.status()} ${r.url()}`); });
  };
  const page = await ctx.newPage(); hook(page, "app");
  const url = BASE + app + "/";
  note("open " + url);
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(4000);
  const build = await page.evaluate(() => { const b = window.ALM_BUILD || window.AlmBuildInfo || null; return { b: b ? JSON.stringify(b).slice(0, 400) : null, footer: (document.querySelector("footer") || {}).innerText ? document.querySelector("footer").innerText.slice(0, 600) : null }; });
  fs.writeFileSync(path.join(out, "build.json"), JSON.stringify(build, null, 1));

  async function runDefault(p) {
    // click a "load example" then a run button if present
    for (const re of [/load (the )?example/i, /^example$/i]) {
      const b = p.getByRole("button", { name: re }).first();
      if (await b.count()) { try { await b.click({ timeout: 5000 }); note("clicked example"); await p.waitForTimeout(1500); } catch (e) {} break; }
    }
    for (const re of [/^run( analysis)?$/i, /^analy[sz]e$/i, /^fit( model)?$/i, /^run$/i, /^calculate$/i, /^compute$/i]) {
      const b = p.getByRole("button", { name: re }).first();
      if (await b.count()) { try { await b.click({ timeout: 5000 }); note("clicked run " + re); } catch (e) {} break; }
    }
    return settle(p, 90000, null);
  }

  async function exerciseR(tag) {
    const results = [];
    const controls = await page.evaluate((src) => {
      const re = new RegExp(src, "i");
      const els = [...document.querySelectorAll("button, a, [role=button]")];
      return els.map((e, i) => ({ i, text: (e.innerText || e.getAttribute("aria-label") || e.title || "").trim().slice(0, 80), title: (e.title || "").slice(0, 200), href: e.getAttribute("href"), id: e.id }))
        .filter((c) => re.test(c.text + " " + c.title + " " + (c.href || "")));
    }, R_RE.source);
    fs.writeFileSync(path.join(out, tag + "-controls.json"), JSON.stringify(controls, null, 1));
    for (const c of controls) {
      const r = { control: c, kind: null, newTab: null, text: null, download: null, error: null };
      note(`${tag}: control ${c.id || c.text}`);
      try {
        const handle = (await page.$$("button, a, [role=button]"))[c.i];
        if (!handle || !(await handle.isVisible().catch(() => false))) { r.error = "not visible"; results.push(r); continue; }
        const popupP = ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null);
        const dlP = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
        const before = await bodyText(page);
        await handle.click({ timeout: 8000 });
        const [popup, dl] = await Promise.all([popupP, dlP]);
        if (dl) {
          const fn = path.join(out, `${tag}-${(c.id || "dl")}-${dl.suggestedFilename()}`);
          await dl.saveAs(fn); r.kind = "download"; r.download = fn; note("download " + fn);
        }
        if (popup) {
          hook(popup, "tab:" + (c.id || c.text));
          await popup.waitForLoadState("load", { timeout: 120000 }).catch(() => {});
          r.kind = r.kind || "newtab"; r.newTab = popup.url();
          // validator pages: tick the download consent, then press Run in WebR
          await popup.waitForTimeout(2500);
          await popup.evaluate(() => {
            for (const cb of document.querySelectorAll("input[type=checkbox]")) {
              const lab = (cb.closest("label") || {}).innerText || (cb.id && (document.querySelector(`label[for="${cb.id}"]`) || {}).innerText) || "";
              if (/understand|download|consent|agree/i.test(lab) && !cb.checked) { cb.click(); }
            }
          }).catch(() => {});
          for (const re of [/run in webr/i, /^run( in r| validation| webr)?$/i, /^validate$/i, /^run$/i]) {
            const b = popup.getByRole("button", { name: re }).first();
            if (await b.count()) { try { await b.click({ timeout: 5000 }); note("tab: clicked " + re); } catch (e) {} break; }
          }
          r.text = await settle(popup, 420000, /(estimate|tau|rma|metafor|error|failed|mismatch|match|pass|fail)/i);
          await popup.screenshot({ path: path.join(out, `${tag}-${c.id || "tab"}.png`), fullPage: true }).catch(() => {});
          await popup.close().catch(() => {});
        } else if (!dl) {
          r.kind = "inpage";
          const after = await settle(page, 420000, /(estimate|tau|rma|metafor|error|failed|match|pass|fail)/i);
          r.text = after.length > before.length ? after : after; // full text kept
          await page.screenshot({ path: path.join(out, `${tag}-${c.id || "inpage"}.png`), fullPage: true }).catch(() => {});
        }
      } catch (e) { r.error = String(e.message || e).slice(0, 500); }
      results.push(r);
      fs.writeFileSync(path.join(out, tag + "-r-paths.json"), JSON.stringify(results, null, 1));
    }
    return results;
  }

  const t1 = await runDefault(page);
  fs.writeFileSync(path.join(out, "default-displayed.txt"), t1);
  await page.screenshot({ path: path.join(out, "default.png"), fullPage: true }).catch(() => {});
  await exerciseR("default");

  if (PASTED) {
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(3000);
    const data = fs.readFileSync(PASTED, "utf8");
    const ok = await page.evaluate((d) => { const ta = [...document.querySelectorAll("textarea")].sort((a, b) => b.clientHeight - a.clientHeight)[0]; if (!ta) return false; ta.value = d; ta.dispatchEvent(new Event("input", { bubbles: true })); ta.dispatchEvent(new Event("change", { bubbles: true })); return true; }, data);
    note("pasted " + ok);
    for (const re of [/parse/i, /^run( analysis)?$/i, /^analy[sz]e$/i, /^fit/i, /^run$/i]) {
      const b = page.getByRole("button", { name: re }).first();
      if (await b.count()) { try { await b.click({ timeout: 5000 }); } catch (e) {} }
    }
    const t2 = await settle(page, 90000, null);
    fs.writeFileSync(path.join(out, "pasted-displayed.txt"), t2);
    await exerciseR("pasted");
  }
  fs.writeFileSync(path.join(out, "console.txt"), consoleLog.join("\n"));
  fs.writeFileSync(path.join(out, "failed-requests.txt"), failed.join("\n"));
  await browser.close();
  note("done");
})().catch((e) => { note("FATAL " + (e.stack || e)); process.exit(1); });
