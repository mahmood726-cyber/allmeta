'use strict';
// Real-Chrome end-to-end check of the in-page "WebR: Verify with R metafor" card.
//
//   node nma-dose-response-app/tests/webr_card_realchrome.cjs <pageUrl> <sample|path/to.csv> [outJson] [maxSeconds]
//
// env: PLAYWRIGHT_CORE (module path; default 'playwright-core'), CHROME (executable; default system Chrome).
//
// PASS (exit 0) only when ALL of these hold:
//   1. the card FINISHED: button re-enabled and #webrResults non-empty, within maxSeconds;
//   2. the R engine was metafor (not the base-R fallback, not an error box);
//   3. no uncaught page error and no CSP violation during the run;
//   4. no request left the page's origin (the runner is same-origin and SHA-256 pinned);
//   5. every R number (effect, se, tau2, I2, Q) for the overall pool and every treatment with k >= 2 equals
//      the page's own DLEstimator on the same inputs, |diff| <= 1e-9 * max(1,|x|); CI bounds: see Z_R / Z_APP below;
//   6. the card's own verdict line reads "VALIDATED".
// Anything else -> exit 1 (fail) or 2 (harness could not run). A timeout is a FAIL, never a pass.
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const [pageUrl, dataArg, outJson, maxSArg] = process.argv.slice(2);
if (!pageUrl || !dataArg) { console.error('usage: <pageUrl> <sample|csv> [outJson] [maxSeconds]'); process.exit(2); }
const maxS = +(maxSArg || 600);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--headless=new'] });
  const out = { pageUrl, data: dataArg, events: [], verdict: null, reasons: [] };
  const ev = (s) => { out.events.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + s); };
  const t0 = Date.now();
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
    const p = await ctx.newPage();
    const origin = new URL(pageUrl).origin;
    const offOrigin = [], pageErrors = [], csp = [];
    p.on('pageerror', e => { pageErrors.push(e.message || String(e)); ev('PAGEERROR ' + (e.message || e)); });
    p.on('request', r => { const u = r.url(); if (/^https?:/.test(u) && new URL(u).origin !== origin) offOrigin.push(u); });
    p.on('console', m => { const t = m.text(); if (/Content Security Policy|CSPVIOLATION/.test(t) && !/frame-ancestors/.test(t)) { csp.push(t.slice(0, 300)); ev('CSP ' + t.slice(0, 300)); } });
    await p.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error('CSPVIOLATION ' + e.violatedDirective + ' ' + e.blockedURI)));
    await p.goto(pageUrl, { waitUntil: 'load' });
    // The engine's init() loads the sample itself when it finishes (~5 s); data injected earlier is overwritten.
    await p.waitForFunction(() => window._nmaState && window._nmaState.rawData && window._nmaState.rawData.length > 0, null, { timeout: 120000 });
    await p.waitForTimeout(1000);
    const q = await p.$('#quickstart-close'); if (q && await q.isVisible()) await q.click();
    await p.keyboard.press('Escape');
    let expectRows;
    if (dataArg === 'sample') {
      await p.evaluate(() => document.getElementById('loadSample').click());
    } else {
      const csv = fs.readFileSync(dataArg, 'utf8');
      expectRows = csv.split(/\r?\n/).filter(l => l.trim()).length - 1;
      await p.evaluate((c) => { document.getElementById('csvInput').value = c; document.getElementById('parseCsv').click(); }, csv);
    }
    await p.waitForTimeout(3000);
    out.rows = await p.evaluate(() => window._nmaState.rawData.length);
    out.treatmentsLoaded = await p.evaluate(() => [...new Set(window._nmaState.rawData.map(r => r.treatment))]);
    if (expectRows !== undefined && out.rows !== expectRows) throw new Error('page holds ' + out.rows + ' rows, CSV has ' + expectRows);
    await p.waitForSelector('#webrRunBtn', { state: 'attached', timeout: 30000 });
    // The inputs the card will send to R, recomputed by the PAGE's own DL engine (the comparison target).
    const appNums = await p.evaluate(() => {
      const st = window._nmaState; const g = {};
      st.rawData.forEach(r => { if (!r.treatment || !isFinite(r.effect)) return; let se = r.se; if (!isFinite(se) || se <= 0) se = 0.1;
        (g[r.treatment] = g[r.treatment] || { yi: [], se: [] }); g[r.treatment].yi.push(r.effect); g[r.treatment].se.push(se); });
      const pick = (d) => d && { effect: d.effect, se: d.se, tau2: d.tau2, I2: d.I2, Q: d.Q, ci_lb: d.ci && d.ci.lower, ci_ub: d.ci && d.ci.upper };
      const res = { treatments: {} }; const ay = [], as = [];
      for (const [t, v] of Object.entries(g)) { ay.push(...v.yi); as.push(...v.se); res.treatments[t] = { k: v.yi.length, dl: v.yi.length >= 2 ? pick(window.DLEstimator.calculate(v.yi, v.se)) : null }; }
      res.overall = { k: ay.length, dl: pick(window.DLEstimator.calculate(ay, as)) };
      return res;
    });
    out.app = appNums;
    await p.evaluate(() => document.getElementById('webrRunBtn').click());
    ev('clicked webrRunBtn');
    let st = null;
    for (let i = 0; i < maxS; i += 2) {
      await p.waitForTimeout(2000);
      st = await p.evaluate(() => ({ prog: (document.getElementById('webrProgressText') || {}).innerText, res: (document.getElementById('webrResults') || {}).innerText || '', busy: document.getElementById('webrRunBtn').disabled, r: window.__nmaWebrLast || null }));
      if (!st.busy && st.res) break;
    }
    out.finalState = { prog: st.prog, busy: st.busy, resultsText: st.res.slice(0, 6000) };
    out.r = st.r;
    out.offOrigin = offOrigin; out.pageErrors = pageErrors; out.csp = csp;
    out.seconds = (Date.now() - t0) / 1000;
    const R = out.reasons;
    if (st.busy || !st.res) R.push('did not finish within ' + maxS + ' s (last progress: ' + st.prog + ')');
    if (!/R Engine: metafor/.test(st.res)) R.push('R engine was not metafor: ' + st.res.slice(0, 200).replace(/\s+/g, ' '));
    if (!/VALIDATED/.test(st.res)) R.push('card verdict is not VALIDATED');
    if (pageErrors.length) R.push('uncaught page errors: ' + pageErrors.join(' | '));
    if (csp.length) R.push('CSP violations: ' + csp.length);
    if (offOrigin.length) R.push('off-origin requests: ' + [...new Set(offOrigin)].slice(0, 5).join(', '));
    if (!st.r) R.push('no R result record exposed by the card');
    else {
      const keys = ['effect', 'se', 'tau2', 'I2', 'Q', 'ci_lb', 'ci_ub'];
      // CI bounds: the app builds them with getCriticalZ(0.95) = 1.959964 (6 dp, app.js), R with
      // qnorm(0.975) = 1.959963984540054. That constant is the ONLY permitted difference, so each CI bound is
      // checked twice: R's bound must be R's effect -/+ qnorm(0.975)*se, and the app's bound must be the app's
      // effect -/+ 1.959964*se, both to 1e-12; effect and se themselves must agree to 1e-9 relative.
      const Z_R = 1.959963984540054, Z_APP = 1.959964;
      const cmp = (label, r, a) => { if (!r || !a) { R.push(label + ': missing R or app numbers'); return; }
        for (const k of keys) {
          if (k === 'ci_lb' || k === 'ci_ub') {
            const sg = k === 'ci_lb' ? -1 : 1;
            const dr = Math.abs(r[k] - (r.effect + sg * Z_R * r.se)), da = Math.abs(a[k] - (a.effect + sg * Z_APP * a.se));
            if (!(dr <= 1e-12 * Math.max(1, Math.abs(r[k])))) R.push(label + ' ' + k + ': R bound is not effect -/+ qnorm(.975)*se (' + dr + ')');
            if (!(da <= 1e-12 * Math.max(1, Math.abs(a[k])))) R.push(label + ' ' + k + ': app bound is not effect -/+ 1.959964*se (' + da + ')');
            continue;
          }
          const d = Math.abs(r[k] - a[k]); if (!(d <= 1e-9 * Math.max(1, Math.abs(a[k])))) R.push(label + ' ' + k + ': R ' + r[k] + ' vs app ' + a[k]); } };
      out.compared = 0;
      cmp('overall', st.r.overall, appNums.overall.dl); out.compared++;
      for (const [t, v] of Object.entries(appNums.treatments)) {
        if (v.k < 2) continue;
        const rr = (st.r.perTreatment || []).find(x => x.treatment === t);
        cmp(t, rr && rr.rData, v.dl); out.compared++;
      }
      out.maxAbsDiff = 0;
      const all = [[st.r.overall, appNums.overall.dl]].concat((st.r.perTreatment || []).filter(x => !x.skip).map(x => [x.rData, appNums.treatments[x.treatment].dl]));
      out.maxAbsDiffByKey = {};
      for (const [r, a] of all) for (const k of keys) if (r && a) { const d = Math.abs(r[k] - a[k]); out.maxAbsDiff = Math.max(out.maxAbsDiff, d); out.maxAbsDiffByKey[k] = Math.max(out.maxAbsDiffByKey[k] || 0, d); }
    }
    out.verdict = R.length ? 'FAIL' : 'PASS';
  } catch (e) {
    out.verdict = 'ERROR'; out.reasons.push('harness error: ' + (e.stack || e));
  } finally {
    await b.close();
    if (outJson) fs.writeFileSync(outJson, JSON.stringify(out, null, 2));
    console.log(out.verdict + ' (' + (out.seconds || 0).toFixed(0) + ' s) ' + out.reasons.join('; '));
    process.exit(out.verdict === 'PASS' ? 0 : out.verdict === 'FAIL' ? 1 : 2);
  }
})();
