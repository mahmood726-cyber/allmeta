// userpath.cjs — drive one allmeta app the way a user does, in system Chrome.
// node userpath.cjs <app> <outdir> [--pasted <file> [--textarea <css>]] [--base <url>] [--steps <json>] [--skip-default 1]
// Exit 2 (verdict.json) when any R control fails on the user path: an alert instead
// of a validator tab, a validator without "BROWSER VS R (MATCH)", an in-page panel
// with a failed quantity or refusal, or an error. UNKNOWN verdicts need inspection.
// An in-page result counts only if it is new after that control and checks >0 quantities;
// a panel still busy when the wait runs out is a FAIL (blocked). Exit 3 = no R control exercised.
// Captures: displayed text after default run, every R-related control's result
// (WebR output in page or new tab, downloaded .R scripts), console, failed requests.
"use strict";
const fs = require("fs"), path = require("path");
const app = process.argv[2], out = process.argv[3];
const argv = process.argv.slice(4);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt("base", "https://mahmood726-cyber.github.io/allmeta/");
const PASTED = opt("pasted", null);
// The data box: an explicit --textarea selector, else the usual ids, else the tallest
// textarea. (2026-11-12: "tallest" picked a secondary box on mh-peto, so the pasted
// data never reached the analysis and every later control ran on an empty page.)
const TEXTAREA = opt("textarea", null);
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const log = [];
const verdicts = [];
const dialogs = [];
let expectRows = null; // studies the page holds in this run (from --steps "expectRows")
const note = (s) => { if (!out) return; log.push(new Date().toISOString() + " " + s); fs.writeFileSync(path.join(out, "log.txt"), log.join("\n") + "\n"); };
const R_RE = /verify in r|validate \(r\)|validate this analysis in r|webr|run in r|\bR code\b|download.*\.r\b|\.R script|copy r|r script|check in r| in r(?![a-z0-9])|validate the extras/i;

// What counts as a user-path failure for one R control (see header).
function judge(c, r) {
  const label = (c.id || "") + " " + c.text;
  const t = r.text || "";
  if (r.error) return { verdict: "FAIL", why: "error: " + r.error };
  if (r.dialogs && r.dialogs.length) return { verdict: "FAIL", why: "alert: " + r.dialogs.join(" | ") };
  if (/verify in r|validate \(r\)|btn-validate-webr|btn-verify-in-r/i.test(label)) {
    if (r.kind !== "newtab") return { verdict: "FAIL", why: "no validator tab opened" };
    // A validator that opens with someone else's studies still says MATCH: check it holds the page's data.
    if (r.expectRows && r.validatorRows !== r.expectRows) return { verdict: "FAIL", why: `validator opened with ${r.validatorRows} studies, page has ${r.expectRows} (stale bus data)` };
    if (/BROWSER VS R \(MATCH\)/.test(t)) return { verdict: "PASS", why: "validator MATCH" };
    return { verdict: "FAIL", why: "validator did not report MATCH" };
  }
  if (r.kind === "download") return { verdict: "PASS", why: "downloaded " + path.basename(r.download || "") };
  if (r.kind === "inpage") {
    if (/is not a function|Validation refused|live R comparison unavailable/i.test(t)) return { verdict: "FAIL", why: "in-page refusal or error" };
    if (/\tFAIL\b/.test(t)) return { verdict: "FAIL", why: "a quantity FAILed" };
    // A run still busy when the wait ran out is BLOCKED, never a pass -- even if an
    // earlier panel on the same page already shows a pass count.
    if (r.stillBusy) return { verdict: "FAIL", why: "still running when the wait ran out (blocked)" };
    // Only a pass count that this control produced counts: one already on the page
    // before the click belongs to another panel.
    const counts = (s) => [...String(s || "").matchAll(/(\d+)\/(\d+) live R quantities passed/g)].map((x) => x[0]);
    const old = counts(r.before);
    const fresh = counts(t).filter((x) => { const i = old.indexOf(x); if (i >= 0) { old.splice(i, 1); return false; } return true; });
    const m = fresh.length ? /(\d+)\/(\d+)/.exec(fresh[fresh.length - 1]) : null;
    if (m && m[1] === m[2] && +m[2] > 0) return { verdict: "PASS", why: fresh[fresh.length - 1] };
    if (m && +m[2] === 0) return { verdict: "UNKNOWN", why: "0 quantities checked" };
    return { verdict: "UNKNOWN", why: "no new pass count from this control (inspect text)" };
  }
  return { verdict: "UNKNOWN", why: "kind " + r.kind };
}

async function bodyText(p) { try { return await p.evaluate(() => document.body.innerText); } catch (e) { return "(unreadable: " + e.message + ")"; } }

const BUSY_RE = /booting|installing|loading|verifying sha|running|fitting|please wait|starting webr|downloading|initialis|initializ|importing|using webr baseurl|---- running ----/i;
async function statusText(p) {
  try { return await p.evaluate(() => [...document.querySelectorAll("[role=status],[aria-live],[aria-busy=true]")].map((e) => e.innerText || "").join(" | ")); } catch (e) { return ""; }
}
let lastSettleBusy = false; // true when settle() gave up while the page still looked busy
async function settle(p, maxMs, re) {
  lastSettleBusy = false;
  // wait until text stops changing for 8 s or matches a terminal pattern
  const t0 = Date.now(); let last = "", stableSince = Date.now(), lastBusy = false;
  while (Date.now() - t0 < maxMs) {
    await p.waitForTimeout(2000);
    const t = await bodyText(p);
    if (t !== last) { last = t; stableSince = Date.now(); }
    // Busy text can sit anywhere on the page (an in-page validation widget is
    // often above long result tables), so read live-region/status nodes too,
    // not only the tail of the page (2026-11-12: correlation-ma's panel was
    // abandoned at "Verifying SHA-256: Matrix_1.7-5.tgz").
    const st = await statusText(p);
    // The validator keeps "---- running ----" in its log after R finishes, so a
    // completion marker ends the wait instead of riding out maxMs.
    // Terminal states only: the validator status pill reads "Running R in WebR..."
    // while busy and Match / Mismatch / WebR failed when done.
    const done = /Browser vs R \((Match|Mismatch|WebR failed)\)|live R quantities (passed|failed)|Validation refused/i.test(t);
    const busy = !done && (BUSY_RE.test(t.slice(-4000)) || BUSY_RE.test(st));
    lastBusy = busy || BUSY_RE.test(st);
    // With a target pattern, any finished marker (validator or in-page panel) ends the wait.
    const terminal = done || /R finished\.|\d+\/\d+ live R|FAIL:/i.test(t);
    if (re && terminal && Date.now() - stableSince > 8000) return t;
    if (re && re.test(t) && Date.now() - stableSince > 8000 && !busy) return t;
    if (!busy && Date.now() - stableSince > 20000) return t;
  }
  lastSettleBusy = lastBusy;
  return last;
}

async function main() {
  // loaded here so judge() can be required by tests without playwright installed
  const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--headless=new"] });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 1000 } });
  const consoleLog = [], failed = [];
  const hook = (p, tag) => {
    p.on("console", (m) => consoleLog.push(`[${tag}] ${m.type()}: ${m.text()}`.slice(0, 2000)));
    p.on("dialog", (d) => { consoleLog.push(`[${tag}] DIALOG ${d.type()}: ${d.message()}`); note(`[${tag}] DIALOG ${d.type()}: ${d.message()}`); dialogs.push(d.message()); d.dismiss().catch(() => {}); });
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
    for (const re of [/^run( analysis)?$/i, /^analy[sz]e$/i, /^fit( model)?$/i, /^fit\b/i, /^run$/i, /^calculate$/i, /^compute$/i]) {
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
        // Prefer the id: the page re-renders between enumeration and click, so a
        // positional index can land on a different control.
        const handle = (c.id && await page.$("#" + c.id)) || (await page.$$("button, a, [role=button]"))[c.i];
        if (!handle || !(await handle.isVisible().catch(() => false))) {
          // Recorded as a verdict: a control the run could not press was not checked.
          r.error = "not visible"; results.push(r);
          verdicts.push(Object.assign({ tag, control: c.id || c.text }, judge(c, r))); continue;
        }
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
          r.validatorRows = await popup.evaluate(() => { const t = document.getElementById("f-data"); return t ? t.value.split(/\r?\n/).filter((l) => l.trim() && !/^#/.test(l.trim())).length : null; }).catch(() => null);
          r.expectRows = expectRows;
          r.text = await settle(popup, 420000, /(estimate|tau|rma|metafor|error|failed|mismatch|match|pass|fail)/i);
          await popup.screenshot({ path: path.join(out, `${tag}-${c.id || "tab"}.png`), fullPage: true }).catch(() => {});
          // also take the validator's own "export R script" (what a user runs in desktop R)
          try {
            if (await popup.$("#btn-export-r")) {
              const dl2P = popup.waitForEvent("download", { timeout: 8000 }).catch(() => null);
              await popup.click("#btn-export-r", { timeout: 5000 });
              const dl2 = await dl2P;
              if (dl2) { const fn2 = path.join(out, `${tag}-${(c.id || "tab").replace(/[^A-Za-z0-9_-]/g, "_")}-validator-${dl2.suggestedFilename()}`); await dl2.saveAs(fn2); r.validatorScript = fn2; note("validator script " + fn2); }
            }
          } catch (e) { note("validator export failed " + e.message); }
          await popup.close().catch(() => {});
        } else if (!dl) {
          r.kind = "inpage";
          const after = await settle(page, 420000, /(estimate|tau|rma|metafor|error|failed|match|pass|fail)/i);
          r.text = after; r.before = before; r.stillBusy = lastSettleBusy; // full text kept
          await page.screenshot({ path: path.join(out, `${tag}-${c.id || "inpage"}.png`), fullPage: true }).catch(() => {});
        }
      } catch (e) { r.error = String(e.message || e).slice(0, 500); }
      r.dialogs = dialogs.splice(0);
      verdicts.push(Object.assign({ tag, control: c.id || c.text }, judge(c, r)));
      results.push(r);
      fs.writeFileSync(path.join(out, tag + "-r-paths.json"), JSON.stringify(results, null, 1));
    }
    return results;
  }

  const t1 = await runDefault(page);
  fs.writeFileSync(path.join(out, "default-displayed.txt"), t1);
  await page.screenshot({ path: path.join(out, "default.png"), fullPage: true }).catch(() => {});
  if (!opt("skip-default", null)) await exerciseR("default");

  if (PASTED) {
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(3000);
    const data = fs.readFileSync(PASTED, "utf8");
    const ok = await page.evaluate(([d, sel]) => { const ta = (sel && document.querySelector(sel)) || document.querySelector("textarea#src, textarea#f-data, textarea#data, textarea#f-input") || [...document.querySelectorAll("textarea")].sort((a, b) => b.clientHeight - a.clientHeight)[0]; if (!ta) return false; ta.value = d; ta.dispatchEvent(new Event("input", { bubbles: true })); ta.dispatchEvent(new Event("change", { bubbles: true })); return ta.id || true; }, [data, TEXTAREA]);
    note("pasted " + ok);
    // Press the page's run control once. "Parse" is a last resort: on mh-peto a
    // "Parse pasted text" helper reads a different box and emptied the data
    // (2026-11-12), so every later control ran on "Enter at least two valid studies".
    for (const re of [/^run( analysis)?$/i, /^analy[sz]e$/i, /^fit/i, /^run$/i, /^parse$/i]) {
      const b = page.getByRole("button", { name: re }).first();
      if (await b.count()) { try { await b.click({ timeout: 5000 }); note("pasted: clicked " + re); } catch (e) {} break; }
    }
    const t2 = await settle(page, 90000, null);
    fs.writeFileSync(path.join(out, "pasted-displayed.txt"), t2);
    await exerciseR("pasted");
  }

  const STEPS = opt("steps", null);
  if (STEPS) {
    const cfg = JSON.parse(fs.readFileSync(STEPS, "utf8"));
    for (const [ri, run] of cfg.entries()) {
      expectRows = run.expectRows || null;
      await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(4000);
      for (const st of run.steps) {
        if (st.fill) {
          const data = st.file ? fs.readFileSync(st.file, "utf8") : st.value;
          const ok = await page.evaluate(([sel, d]) => { const ta = document.querySelector(sel); if (!ta) return false; ta.value = d; ta.dispatchEvent(new Event("input", { bubbles: true })); ta.dispatchEvent(new Event("change", { bubbles: true })); return true; }, [st.fill, data]);
          note(`[${run.tag}] fill ${st.fill} ${ok}`); if (!ok) throw new Error("fill target missing " + st.fill);
        } else if (st.select) {
          await page.selectOption(st.select, st.value); note(`[${run.tag}] select ${st.select}=${st.value}`);
        } else if (st.click) {
          await page.click(st.click, { timeout: 10000 }); note(`[${run.tag}] click ${st.click}`);
        } else if (st.wait) { await page.waitForTimeout(st.wait); }
      }
      const t2 = await settle(page, 90000, null);
      fs.writeFileSync(path.join(out, run.tag + "-displayed.txt"), t2);
      await page.screenshot({ path: path.join(out, run.tag + ".png"), fullPage: true }).catch(() => {});
      await exerciseR(run.tag);
    }
  }
  fs.writeFileSync(path.join(out, "verdict.json"), JSON.stringify(verdicts, null, 1));
  const failedV = verdicts.filter((v) => v.verdict === "FAIL");
  note(`verdict: ${verdicts.filter((v) => v.verdict === "PASS").length}/${verdicts.length} R controls PASS` +
    (failedV.length ? "; FAIL: " + failedV.map((v) => v.tag + "/" + v.control + " (" + v.why + ")").join("; ") : ""));
  // Exit 3: no R control was exercised at all, so nothing was verified.
  process.exitCode = failedV.length ? 2 : verdicts.length ? 0 : 3;
  if (!verdicts.length) note("no R control exercised: nothing verified (exit 3)");
  fs.writeFileSync(path.join(out, "console.txt"), consoleLog.join("\n"));
  fs.writeFileSync(path.join(out, "failed-requests.txt"), failed.join("\n"));
  await browser.close();
  note("done");
}
module.exports = { judge };
if (require.main === module) main().catch((e) => { note("FATAL " + (e.stack || e)); process.exit(1); });
