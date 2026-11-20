// userpath.cjs — drive one allmeta app the way a user does, in system Chrome.
// node userpath.cjs <app> <outdir> [--pasted <file> [--textarea <css>]] [--base <url>] [--steps <json>] [--skip-default 1] [--entry <file>]
// Exit 2 (verdict.json) when any R control fails on the user path: an alert instead
// of a validator tab, a validator without "BROWSER VS R (MATCH)", an in-page panel
// with a failed quantity or refusal, or an error. Exit 4 = no FAIL but an UNKNOWN (inspect it).
// An in-page result counts only if it is new after that control and checks >0 quantities;
// a panel still busy when the wait runs out is a FAIL (blocked). Exit 3 = no R control exercised.
// A "Verify in R" that runs R IN the page (no validator tab) is scored FAIL-CLOSED: PASS only
// when its new output ends with MATCH n/n and every condition in judgeInpageVerdict holds.
// Known onboarding overlays are closed by their own close controls after every page load;
// one that stays up is recorded in verdict.json (overlays.json has the detail).
// Captures: displayed text after default run, every R-related control's result
// (WebR output in page or new tab, downloaded .R scripts), console, failed requests.
"use strict";
const fs = require("fs"), path = require("path");
const app = process.argv[2], out = process.argv[3];
const argv = process.argv.slice(4);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt("base", "https://mahmood726-cyber.github.io/allmeta/");
const ENTRY = opt("entry", null);
// Apps whose folder index is not the app itself. IPD-Meta-Pro/index.html is a landing
// page that only links to ipd-meta-pro.html, so opening the folder found no R control
// and the run ended with exit 3 (2026-11-18).
const ENTRY_MAP = { "IPD-Meta-Pro": "ipd-meta-pro.html" };
function appUrl(base, appName, entry) {
  const e = entry || ENTRY_MAP[appName] || "";
  // The entry is a file inside the app folder, never another folder or site. Checked on the URL
  // as the browser resolves it (so %2e%2e/ and .%2E/ dot segments cannot climb out), plus a
  // refusal of any encoded dot/slash/backslash, schemes, and absolute or UNC-style paths.
  const dir = new URL(appName + "/", base);
  if (!e) return dir.href;
  const bad = () => new Error("--entry must be a file inside the app folder: " + e);
  if (/%(2e|2f|5c)/i.test(e) || /^[a-z][a-z0-9+.-]*:/i.test(e) || /^[\\/]/.test(e) || /(^|[\\/])\.\.?([\\/]|$)/.test(e)) throw bad();
  const u = new URL(e, dir);
  if (u.origin !== dir.origin || !u.pathname.startsWith(dir.pathname) || u.pathname === dir.pathname) throw bad();
  return u.href;
}
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
    // Pages now run this check in the page itself (WebR panel, no validator tab): score it by
    // the result it printed. Before 2026-11-19 every such control was "no validator tab opened"
    // even when the in-page comparison had finished with MATCH (UP-P20/24/26/30).
    if (r.kind === "inpage") return judgeInpageVerdict(r);
    if (r.kind !== "newtab") return { verdict: "FAIL", why: "no validator tab opened and nothing ran in the page" };
    // A validator that opens with someone else's studies still says MATCH: check it holds the page's data.
    if (r.expectRows && r.validatorRows !== r.expectRows) return { verdict: "FAIL", why: `validator opened with ${r.validatorRows} studies, page has ${r.expectRows} (stale bus data)` };
    if (/BROWSER VS R \(MATCH\)/.test(t)) return { verdict: "PASS", why: "validator MATCH" };
    return { verdict: "FAIL", why: "validator did not report MATCH" };
  }
  if (r.kind === "download") return { verdict: "PASS", why: "downloaded " + path.basename(r.download || "") };
  if (r.kind === "inpage") {
    if (/is not a function|Validation refused|live R comparison unavailable/i.test(t)) return { verdict: "FAIL", why: "in-page refusal or error" };
    if (/\tFAIL\b/.test(t)) return { verdict: "FAIL", why: "a quantity FAILed" };
    // a MATCH/MISMATCH line this control newly printed decides it
    if (freshVerdictLines(r.before, t).length) return judgeInpageVerdict(r);
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

// In-page R check results, read LINE BY LINE from the text that is new since the click.
// Wordings seen on the pages:
//   MATCH:      "MATCH 8/8 (2 more NOT CHECKED: see above)", "R (WebR 0.5.5, ...): MATCH 11/11",
//               "... base-R checks: MATCH 10/10."  ("MATCH a/b of N" means a/b of N in all)
//   MISMATCH:   "MISMATCH (7 of 8 quantities agree)", "MISMATCH 9/11 agree", "MISMATCH 3/4",
//               "MISMATCH (nothing could be checked)", benefit-risk "MISMATCH 2 of 5 checks differ",
//               IPD-Meta-Pro "MISMATCH (2 of 10 compared quantities outside the panel tolerance ...)".
//   NOT CHECKED: "NOT CHECKED (no estimate was compared ...)", "NOT CHECKED: no quantity ...".
// Help text ("ends with MATCH n/n or MISMATCH") has no counts and is stripped before any test.
//
// SCORING IS FAIL-CLOSED (PR #637 round 3; rounds 1 and 2 each patched one case and opened
// another false PASS). A "Verify in R" that ran in the page is PASS only if ALL of these hold:
//   1. its NEW output -- lines present after the click that were not there before it (a multiset
//      difference), taken from the control's own output region when it has one, else the whole
//      page -- has MATCH n/n with n > 0 as its LAST verdict line;
//   2. nothing in that new output says MISMATCH(ES), is a NOT CHECKED verdict (or mentions NOT
//      CHECKED when the final MATCH line does not itself declare "k more NOT CHECKED"), or is an
//      error / refusal line (ERROR_CS, ERROR_CI);
//   3. no busy text is NEW or CHANGED since the click ANYWHERE on the page (body lines and the
//      status/live regions). Busy text that was there before the click and is still there,
//      unchanged, is ignored: HTA's static help "Loading Data" / "Loading..." (live 2026-11-20);
//   4. the page was unchanged for STABLE_MS when it was read (settle(); r.stableMs);
//   5. every earlier control was idle before this click: no busy text new since the baseline
//      taken before the first control (r.busyBefore === false). If the harness did not record it,
//      any busy text in the page before the click makes the result unattributable.
// A result that is wrong or did not finish is FAIL; one that cannot be attributed to this control,
// or checked nothing, is UNKNOWN. Nothing else is ever PASS.
const STABLE_MS = 10000;
const HELP_PHRASE = /\b(?:MATCH(?: n\/n)?\s+)?or\s+MISMATCH\b/g;
const MISMATCH_RE = /\bMISMATCH(?:ES)?\b/;
const MATCH_RE = /(?:^|:\s+)MATCH (\d+)\/(\d+)(?:\s+of\s+(\d+))?/;
const NC_VERDICT_RE = /(?:^|:\s+)NOT CHECKED\b/;          // "NOT CHECKED ..." / "x: NOT CHECKED ..." is a verdict
const NC_DECLARED_RE = /\((\d+) more NOT CHECKED\b/;      // "MATCH 8/8 (2 more NOT CHECKED: see above)"
// Error / refusal lines. Case-sensitive part: R's "Error in f(...)", "Error: ...", "ERROR", a FAIL
// cell, German R messages; a lower-case "error" is common prose ("standard error:"), so it is not used.
const ERROR_CS = /^Error\b|\bError:|\bERROR\b|\bFAIL(?:ED|URE|S)?\b|\bFehler\b|is not a function/;
const ERROR_CI = /\bfailed\b|\brefused\b|\bunavailable\b/i;
function classifyLine(line) {
  const s = String(line).trim();
  if (MISMATCH_RE.test(s.replace(HELP_PHRASE, ""))) {
    const v = { line: s, kind: "MISMATCH", match: null, total: null, differ: null };
    const slash = /MISMATCH(?:ES)?\s+\(?(\d+)\/(\d+)/.exec(s);
    const of = /(\d+) of (\d+)/.exec(s);
    if (slash) { v.match = +slash[1]; v.total = +slash[2]; }
    else if (of && /\bagree/.test(s)) { v.match = +of[1]; v.total = +of[2]; }
    else if (of) { v.differ = +of[1]; v.total = +of[2]; }
    return v;
  }
  const m = MATCH_RE.exec(s);
  if (m) {
    const d = NC_DECLARED_RE.exec(s);
    return { line: s, kind: "MATCH", match: +m[1], total: m[3] != null ? +m[3] : +m[2], of: m[3] != null ? +m[2] : null, notChecked: d ? +d[1] : 0 };
  }
  if (NC_VERDICT_RE.test(s)) return { line: s, kind: "NOT CHECKED", match: null, total: null };
  return null;
}
const linesOf = (s) => String(s || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
// status/live region text arrives joined with " | " (statusText); split it into its parts too
const statusLines = (s) => String(s || "").split(/\r?\n|\s\|\s/).map((l) => l.trim()).filter(Boolean);
function verdictLines(s) { return linesOf(s).map(classifyLine).filter(Boolean); }
// Lines of `after` that were not in `before` (multiset: a line printed again counts once per extra copy).
function freshLines(before, after, split) {
  const sp = split || linesOf;
  const old = sp(before);
  return sp(after).filter((l) => { const i = old.indexOf(l); if (i >= 0) { old.splice(i, 1); return false; } return true; });
}
function freshVerdictLines(before, after) { return freshLines(before, after).map(classifyLine).filter(Boolean); }
const isBusy = (l) => BUSY_RE.test(l);
// Busy lines added (new or changed) and gone (changed or removed) between two snapshots.
function busyChange(before, after, split) {
  const sp = split || linesOf;
  return { added: freshLines(before, after, sp).filter(isBusy), gone: freshLines(after, before, sp).filter(isBusy) };
}
// Busy text added in the status/live regions. Without a "before" reading, any busy status counts.
function statusBusyAdded(stBefore, stAfter) {
  if (stAfter == null) return [];
  if (stBefore == null) return statusLines(stAfter).filter(isBusy);
  return busyChange(stBefore, stAfter, statusLines).added;
}
function judgeInpageVerdict(r) {
  const own = r.region && r.region.text != null;
  const outBefore = own ? r.region.before : r.before, outAfter = own ? r.region.text : (r.text || "");
  const where = own ? "" : " (page text; no output region found for this control)";
  const q = (l) => JSON.stringify(String(l).slice(0, 160));
  const counts = (x) => { const o = { match: x.match, total: x.total }; if (x.differ != null) o.differ = x.differ; return o; };
  // 5. every earlier control idle before this click
  if (r.busyBefore === true)
    return { verdict: "UNKNOWN", why: "a run was still in progress before this control was pressed (busy text new since the baseline), so a new result cannot be attributed to it" + where };
  if (r.busyBefore === undefined) {
    const b = linesOf(r.before).filter(isBusy).concat(statusLines(r.statusBefore).filter(isBusy));
    if (b.length) return { verdict: "UNKNOWN", why: "busy text was on the page before the click and the harness did not record that earlier controls were idle: " + q(b[0]) + where };
  }
  // 3a. busy text that was there before the click and changed or went away during this window:
  // something else was running while this control's result was being read.
  const gone = busyChange(r.before, r.text).gone.concat(r.statusAfter != null && r.statusBefore != null ? busyChange(r.statusBefore, r.statusAfter, statusLines).gone : []);
  if (gone.length) return { verdict: "UNKNOWN", why: "busy text already on the page before the click changed during the run (another run may have finished in this window): " + q(gone[0]) + where };
  const fresh = freshLines(outBefore, outAfter);
  const verdicts = fresh.map(classifyLine).filter(Boolean);
  // 2. MISMATCH and errors in the new output fail it, whatever else printed
  const mm = verdicts.find((x) => x.kind === "MISMATCH");
  if (mm) return Object.assign({ verdict: "FAIL", why: "in-page R comparison: " + mm.line + where }, counts(mm));
  const err = fresh.find((l) => ERROR_CS.test(l) || ERROR_CI.test(l));
  if (err) return { verdict: "FAIL", why: "in-page R comparison did not complete: error or refusal in its new output: " + q(err) + where };
  // 3b. busy text new or changed since the click, anywhere on the page: still running
  const added = busyChange(r.before, r.text).added.concat(statusBusyAdded(r.statusBefore, r.statusAfter));
  if (r.stillBusy || added.length)
    return { verdict: "FAIL", why: "in-page R comparison still running when read (blocked)" + (added.length ? ": " + q(added[0]) : "") + where };
  // 4. stable for the window
  if (typeof r.stableMs === "number" && r.stableMs < STABLE_MS)
    return { verdict: "UNKNOWN", why: `page was still changing when read (stable ${r.stableMs} ms < ${STABLE_MS} ms)` + where };
  // 1. the LAST verdict line decides
  const v = verdicts[verdicts.length - 1];
  if (!v) return { verdict: "FAIL", why: "in-page R comparison did not complete (no new MATCH/MISMATCH line)" + where };
  if (v.kind === "NOT CHECKED") return { verdict: "UNKNOWN", why: "in-page R comparison checked nothing: " + v.line + where };
  if (!(v.total > 0)) return Object.assign({ verdict: "UNKNOWN", why: "in-page R comparison: " + v.line + " (0 quantities checked)" + where }, counts(v));
  if (v.match !== v.total || v.of != null) return Object.assign({ verdict: "FAIL", why: "in-page R comparison: " + v.line + where }, counts(v));
  // a NOT CHECKED verdict anywhere, or an undeclared NOT CHECKED mention, is not a full pass
  if (verdicts.some((x) => x.kind === "NOT CHECKED")) return { verdict: "UNKNOWN", why: "a NOT CHECKED verdict in the new output: " + verdicts.find((x) => x.kind === "NOT CHECKED").line + where };
  if (!(v.notChecked > 0) && fresh.some((l) => /\bNOT CHECKED\b/.test(l)))
    return { verdict: "UNKNOWN", why: "NOT CHECKED in the new output, not declared by the final MATCH line: " + q(fresh.find((l) => /\bNOT CHECKED\b/.test(l))) + where };
  const o = Object.assign({ verdict: "PASS", why: "in-page R comparison: " + v.line + where }, counts(v));
  if (v.notChecked > 0) o.notChecked = v.notChecked;
  return o;
}

async function bodyText(p) { try { return await p.evaluate(() => document.body.innerText); } catch (e) { return "(unreadable: " + e.message + ")"; } }

const BUSY_RE = /booting|installing|loading|verifying sha|running|fitting|please wait|starting webr|downloading|initialis|initializ|importing|using webr baseurl|---- running ----/i;
async function statusText(p) {
  try { return await p.evaluate(() => [...document.querySelectorAll("[role=status],[aria-live],[aria-busy=true]")].map((e) => e.innerText || "").join(" | ")); } catch (e) { return ""; }
}
// Busy text on the page now that was not in `baseline` ({body, status}, read before the first
// control was pressed): page lines and status/live-region parts, new or changed. Static busy
// prose that was already there (HTA's "Loading...") is not counted.
async function busyNow(p, baseline) {
  const b = baseline || {};
  return busyChange(b.body, await bodyText(p)).added.concat(statusBusyAdded(b.status == null ? "" : b.status, await statusText(p)));
}
// True once nothing busy is new since `baseline` on two polls in a row (every earlier control
// is idle); false if something still is when maxMs runs out.
async function waitIdle(p, maxMs, baseline) {
  const t0 = Date.now(); let idle = 0;
  while (Date.now() - t0 < maxMs) {
    if ((await busyNow(p, baseline)).length) idle = 0; else if (++idle >= 2) return true;
    await p.waitForTimeout(1000);
  }
  return false;
}
let lastSettleBusy = false; // true when settle() gave up while the page still looked busy
let lastSettleStableMs = null; // how long the page had been unchanged when settle() returned
// Onboarding overlays that cover an app on first visit. Each is closed by the control a user
// would press; the harness never removes DOM itself. HTA (P43) opened with both of these over
// the page, so every later click was intercepted and both R controls were "not visible"
// (UP-P43, 18 Nov 2026).
const KNOWN_OVERLAYS = [
  { name: "HTA quick-start tutorial", root: "#tutorial-modal", close: ["#tutorial-modal .tutorial-close"] },
  { name: "HTA welcome", root: "#welcome-modal.welcome-modal-overlay", close: ["#welcome-skip"] },
];
// Generic close controls tried, in a page-covering element no entry above knows about.
const CLOSE_NAME = /^(skip( tutorial| tour)?|close|dismiss|got it|no,? thanks|maybe later|×|✕|x)$/i;

async function coveringElements(p) {
  // Visible fixed-position elements, stacked above the page, covering >= half the viewport,
  // that are topmost at the viewport centre or at the element's own centre.
  return p.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll("body *")) {
      const s = getComputedStyle(e);
      if (s.position !== "fixed" || s.display === "none" || s.visibility === "hidden" || +s.opacity === 0 || s.pointerEvents === "none") continue;
      const r = e.getBoundingClientRect();
      if (r.width * r.height < 0.5 * innerWidth * innerHeight) continue;
      const pts = [[innerWidth / 2, innerHeight / 2], [r.left + r.width / 2, r.top + r.height / 2]];
      if (!pts.some(([x, y]) => { const t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t)); })) continue;
      if (out.some((o) => o.el.contains(e))) continue;
      out.push({ el: e });
    }
    return out.map((o) => { const e = o.el;
      const role = e.getAttribute("role");
      const dialogish = role === "dialog" || role === "alertdialog" || e.getAttribute("aria-modal") === "true" || e.tagName === "DIALOG" ||
        /modal|overlay|dialog|popup|lightbox|onboard|welcome|tutorial|tour|coachmark/i.test((e.id || "") + " " + String(e.className || ""));
      return { id: e.id || null, dialogish, cls: String(e.className || "").slice(0, 80), name: (e.id ? "#" + e.id : e.tagName.toLowerCase() + (e.className ? "." + String(e.className).split(/\s+/)[0] : "")), text: (e.innerText || "").trim().slice(0, 120) }; });
  }).catch(() => []);
}
async function overlayUp(p, sel) {
  return p.evaluate((s) => {
    const e = document.querySelector(s); if (!e) return false;
    const st = getComputedStyle(e); if (st.display === "none" || st.visibility === "hidden" || +st.opacity === 0) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  }, sel).catch(() => false);
}
async function waitGone(p, test, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (!(await test())) return true; await p.waitForTimeout(250); }
  return !(await test());
}
// Returns { dismissed: [{name, by}], remaining: [{name, known, text}] }.
async function dismissOverlays(p, logf) {
  const say = logf || (() => {});
  const rep = { dismissed: [], remaining: [], tried: [] }; // tried: close attempts that did not work, and why
  // Known overlays may appear after a delay (HTA's welcome opens 500 ms after load).
  for (let round = 0; round < 3; round++) {
    let acted = false;
    for (const k of KNOWN_OVERLAYS) {
      if (!(await overlayUp(p, k.root))) continue;
      let by = null;
      for (const sel of k.close) {
        const h = await p.$(sel);
        if (!h || !(await h.isVisible().catch(() => false))) continue;
        try { await h.click({ timeout: 10000 }); } catch (e) { rep.tried.push({ name: k.name, sel, error: String(e.message || e).split("\n")[0].slice(0, 200) }); continue; }
        if (await waitGone(p, () => overlayUp(p, k.root), 8000)) { by = sel; break; }
        rep.tried.push({ name: k.name, sel, error: "clicked; overlay still up" });
      }
      if (by) { rep.dismissed.push({ name: k.name, by }); say(`overlay dismissed: ${k.name} via ${by}`); acted = true; }
    }
    // Page-covering elements no entry knows: try a close control a user would press.
    for (const c of await coveringElements(p)) {
      if (KNOWN_OVERLAYS.some((k) => c.id && k.root.startsWith("#" + c.id))) continue;
      // Reviewer MINOR 4: press a close control only in something that looks like a dialog,
      // never in a fixed full-screen app shell (its "Close" may close a panel or the app).
      if (!c.dialogish) continue;
      const root = c.id ? p.locator("#" + c.id) : null;
      if (!root) continue;
      const btn = root.getByRole("button", { name: CLOSE_NAME }).first();
      if (!(await btn.count())) continue;
      try { await btn.click({ timeout: 10000 }); } catch (e) { rep.tried.push({ name: c.name, error: String(e.message || e).split("\n")[0].slice(0, 200) }); continue; }
      const gone = await waitGone(p, async () => (await coveringElements(p)).some((x) => x.name === c.name), 8000);
      if (!gone) rep.tried.push({ name: c.name, error: "clicked a close control; element still covers the page" });
      if (gone) { rep.dismissed.push({ name: c.name, by: "button " + CLOSE_NAME.source }); say(`overlay dismissed: ${c.name}`); acted = true; }
    }
    if (!acted) {
      if (round === 0) { await p.waitForTimeout(1000); continue; } // let a delayed overlay open
      break;
    }
  }
  for (const k of KNOWN_OVERLAYS) if (await overlayUp(p, k.root)) rep.remaining.push({ name: k.name, known: true });
  for (const c of await coveringElements(p)) {
    if (KNOWN_OVERLAYS.some((k) => c.id && k.root.startsWith("#" + c.id))) continue;
    if (c.dialogish) rep.remaining.push({ name: c.name, known: false, text: c.text });
    else (rep.coveringNonDialog = rep.coveringNonDialog || []).push({ name: c.name, text: c.text }); // recorded only: never pressed, not a verdict
  }
  for (const x of rep.remaining) say(`overlay NOT dismissed: ${x.name}${x.known ? " (known onboarding overlay)" : " (page-covering element)"}`);
  return rep;
}
// An overlay left up means later clicks may never have reached the page: never a clean run.
function overlayVerdicts(tag, rep) {
  return (rep.remaining || []).map((x) => x.known
    ? { tag, overlay: true, control: "overlay " + x.name, verdict: "FAIL", why: "onboarding overlay could not be dismissed; it covers the page" }
    : { tag, overlay: true, control: "overlay " + x.name, verdict: "UNKNOWN", why: "a page-covering element stayed up after dismissal (inspect overlays.json)" });
}

async function settle(p, maxMs, re, before, statusBefore) {
  lastSettleBusy = false; lastSettleStableMs = null;
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
    // In the page: a MATCH/MISMATCH line that was not there before the click is a finish.
    if (before != null) {
      // In-page run (reviewer MAJOR 1): a new result line is NOT a finish while the page still
      // reads busy -- "Stage 1: MATCH 3/3" can print while stage 2 runs and ends in MISMATCH.
      // Finish only when the page is idle AND stable, so the line judged is the final one.
      // Busy = busy text NEW or CHANGED since the click, in the page lines or the status/live
      // regions (round 3). Busy text already there before the click and unchanged is ignored:
      // HTA ends with static help "Loading Data" / "Loading...", which held a page-tail test busy
      // for 420 s after R had printed MATCH 14/14 (live 2026-11-20); reading only the live
      // regions instead missed "Stage 2: running WebR ..." printed in plain page text (rev637b).
      const busyIn = busyChange(before, t).added.length > 0 || statusBusyAdded(statusBefore, st).length > 0;
      lastBusy = busyIn;
      const fresh = freshVerdictLines(before, t).length > 0;
      const stable = Date.now() - stableSince;
      if (!busyIn && fresh && stable >= STABLE_MS) { lastSettleStableMs = stable; return t; }
      if (!busyIn && stable > 30000) { lastSettleStableMs = stable; return t; } // idle with no result: judged as not completed
      continue;
    }
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
  lastSettleStableMs = Date.now() - stableSince;
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
  const url = appUrl(BASE, app, ENTRY);
  note("open " + url);
  const overlayLog = [];
  // After every page load: close onboarding overlays the way a user would, and record any left up.
  async function clearOverlays(tag) {
    const rep = await dismissOverlays(page, note);
    overlayLog.push(Object.assign({ tag }, rep));
    fs.writeFileSync(path.join(out, "overlays.json"), JSON.stringify(overlayLog, null, 1));
    verdicts.push(...overlayVerdicts(tag, rep));
  }
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(4000);
  await clearOverlays("default");
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
    // Baseline for "every earlier control is idle": the page as it stands before the first
    // control is pressed. Busy text in it (static help prose, HTA's "Loading...") is ignored;
    // busy text that is new since it means something is still running.
    const baseline = { body: await bodyText(page), status: await statusText(page) };
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
        // Never press a control while an earlier one is still running, or that run's late result
        // is read as this control's: wait until no busy text is new since the baseline. If the
        // wait runs out the result is UNKNOWN (not attributable), never PASS.
        r.busyBefore = !(await waitIdle(page, 420000, baseline));
        if (r.busyBefore) note(`${tag}: page still busy before ${c.id || c.text}; its result will not be attributed`);
        // The control's own output region: nearest ancestor (<= 4 levels, not body/main) holding a
        // status / live / output / pre element. Its text is judged instead of the whole page.
        const regionKey = "up" + results.length;
        const hasRegion = await handle.evaluate((el, key) => {
          let a = el.parentElement;
          for (let lvl = 0; a && lvl < 4; lvl++, a = a.parentElement) {
            if (/^(BODY|HTML|MAIN)$/.test(a.tagName)) return false;
            const o = [...a.querySelectorAll("[role=status],[aria-live],output,pre")].filter((x) => !el.contains(x));
            if (o.length) { a.setAttribute("data-up-region", key); return true; }
          }
          return false;
        }, regionKey).catch(() => false);
        const regionText = () => page.evaluate((key) => { const e = document.querySelector(`[data-up-region="${key}"]`); return e ? e.innerText : null; }, regionKey).catch(() => null);
        const regionBefore = hasRegion ? await regionText() : null;
        const popupP = ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null);
        const dlP = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
        const before = await bodyText(page), statusBefore = await statusText(page);
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
          const after = await settle(page, 420000, /(estimate|tau|rma|metafor|error|failed|match|pass|fail)/i, before, statusBefore);
          r.text = after; r.before = before; r.stillBusy = lastSettleBusy; r.stableMs = lastSettleStableMs; // full text kept
          r.statusBefore = statusBefore; r.statusAfter = await statusText(page);
          if (hasRegion) { const rt = await regionText(); if (rt != null) r.region = { key: regionKey, before: regionBefore, text: rt }; }
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
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(3000); await clearOverlays("pasted");
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
      await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(4000); await clearOverlays(run.tag);
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
  const rV = verdicts.filter((v) => !v.overlay); // overlay entries are not R controls
  note(`verdict: ${rV.filter((v) => v.verdict === "PASS").length}/${rV.length} R controls PASS` +
    (failedV.length ? "; FAIL: " + failedV.map((v) => v.tag + "/" + v.control + " (" + v.why + ")").join("; ") : ""));
  // Exit 3: no R control was exercised at all, so nothing was verified. Exit 4 (round 3): no
  // FAIL but at least one UNKNOWN -- an unattributable or empty result is not a clean run.
  const unknownV = verdicts.filter((v) => v.verdict === "UNKNOWN");
  process.exitCode = failedV.length ? 2 : !rV.length ? 3 : unknownV.length ? 4 : 0;
  if (!rV.length) note("no R control exercised: nothing verified (exit 3)");
  fs.writeFileSync(path.join(out, "console.txt"), consoleLog.join("\n"));
  fs.writeFileSync(path.join(out, "failed-requests.txt"), failed.join("\n"));
  await browser.close();
  note("done");
}
module.exports = { judge, appUrl, dismissOverlays, overlayVerdicts, verdictLines, freshVerdictLines, busyChange, STABLE_MS };
if (require.main === module) main().catch((e) => { note("FATAL " + (e.stack || e)); process.exit(1); });
