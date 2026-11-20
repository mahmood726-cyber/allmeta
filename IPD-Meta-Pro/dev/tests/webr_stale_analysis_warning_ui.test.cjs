'use strict';
// Requirements, exercised with real clicks / file upload in headless Chrome:
// (1) Uploading an IPD file whose column names name no outcome (patient_id, study_id, treatment, nausea, age, female
//     -- the shape of the Lee 2004 acupoint PONV file a user uploaded) must not auto-run an analysis, and must not
//     map patient_id as the outcome. Before the fix the post-upload booster ran runAnalysis() with patient_id as a
//     continuous outcome and the page showed a pooled mean difference of patient numbers.
// (2) Help > Statistical Validation must warn when the analysis it validates was not produced by the settings now on
//     the form or the last Run was refused. Before the fix: after a successful run, choosing One-Stage and pressing
//     Run Analysis was refused (runAnalysis returns), yet the panel validated the earlier analysis as "All PASS" with
//     no warning; only the downloaded R script's header NOTE disclosed it. The warning changes no number or verdict.
// WebR is stubbed (nothing is fetched); the page is served from its own directory on a port of this test.
//   node dev/tests/webr_stale_analysis_warning_ui.test.cjs [path/to/ipd-meta-pro.html]
// Needs system Chrome + playwright-core (PLAYWRIGHT_CORE=<dir>/playwright-core). Without them it prints SKIPPED and
// exits 2: a check that did not run is not a pass.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const pageFile = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || 'playwright-core').chromium; } catch (e) { /* below */ }
if (!chromium || !fs.existsSync(CHROME)) { console.log('SKIPPED: needs system Chrome and playwright-core'); process.exit(2); }
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + String(detail).slice(0, 400) + ']' : '')); if (!ok) failed++; }
const FAKE_WEBR = 'export class WebR { async init() {} async installPackages() {} async evalR() { return { toJs: async () => ({ names: [], values: [] }), destroy: async () => {} }; } }';

// 16 studies x 24 patients, both arms in every study; deterministic values.
function leeShapedCsv() {
  const rows = ['patient_id,study_id,treatment,nausea,age,female'];
  let id = 0;
  for (let s = 1; s <= 16; s++) for (let j = 0; j < 24; j++) {
    id++;
    const trt = j % 2;
    rows.push([id, 'Lee' + String(s).padStart(2, '0'), trt, ((id * 7 + s) % 5 < (trt ? 1 : 2)) ? 1 : 0, 25 + (id * 13) % 45, (id * 3) % 2].join(','));
  }
  return rows.join('\n') + '\n';
}

(async () => {
  const dir = path.dirname(pageFile);
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  const PORT = +(process.env.RPATH_PORT || 18651);
  await new Promise((r, j) => { server.once('error', j); server.listen(PORT, '127.0.0.1', r); });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('dialog', (d) => d.dismiss());
    await page.route('https://webr.r-wasm.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE_WEBR }));
    await page.goto('http://127.0.0.1:' + PORT + '/' + path.basename(pageFile), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.runWebRValidation === 'function' && typeof window.loadExampleData === 'function', null, { timeout: 60000 });
    const click = async (sel) => { try { await page.click(sel, { timeout: 15000 }); } catch (e) { await page.click(sel, { force: true, noWaitAfter: true, timeout: 30000 }); } };
    const state = () => page.evaluate(() => ({
      pooled: (APP.results && APP.results.pooled) ? APP.results.pooled.effect : null,
      eventVar: document.getElementById('varEvent').value, outcomeType: document.getElementById('outcomeType').value,
      analysedEvent: APP.analysisSettings ? APP.analysisSettings.eventVar : null
    }));

    // ---- (1) upload with no outcome-named column ----
    await page.setInputFiles('#fileInput', { name: 'lee_shaped_ponv_ipd.csv', mimeType: 'text/csv', buffer: Buffer.from(leeShapedCsv()) });
    await page.waitForFunction(() => Array.isArray(APP.data) && APP.data.length === 384, null, { timeout: 30000 });
    await page.waitForTimeout(2500);   // the post-load booster runs ~180 ms after the load
    const up = await state();
    check('upload: no analysis was run by itself (no column is named as the outcome)', up.pooled === null, JSON.stringify(up));
    check('upload: patient_id is not the outcome on the form', up.eventVar !== 'patient_id', JSON.stringify(up));
    check('upload: the suggested outcome is nausea, binary', up.eventVar === 'nausea' && up.outcomeType === 'binary', JSON.stringify(up));
    const notes = await page.evaluate(() => document.body.innerText);
    check('upload: the user is asked to check the outcome column mapping', /no column is named as the outcome/i.test(notes), '');

    // ---- (2) a successful run, then a refused one, then Help > Statistical Validation ----
    await page.evaluate(() => { window.loadExampleData('binary'); });
    await page.waitForFunction(() => APP.results && APP.results.pooled && APP.analysisSettings && APP.analysisSettings.eventVar === 'mace_event', null, { timeout: 60000 });
    await page.waitForTimeout(800);
    const openPanel = async () => {
      await click('#helpDropdown > .dropdown-toggle'); await page.waitForTimeout(300);
      await click('#helpMenuVerifyInR'); await page.waitForTimeout(800);
    };
    const warning = () => page.evaluate(() => { const w = document.getElementById('webrStaleWarning'); if (!w) return { exists: false }; return { exists: true, visible: w.offsetParent !== null && w.getBoundingClientRect().height > 0, text: w.textContent }; });
    const closeTop = async () => { await click('.modal-overlay.active .modal-close'); await page.waitForTimeout(300); };

    await openPanel();
    const w0 = await warning();
    check('after a successful run with the form unchanged: no warning', w0.exists && !w0.visible, JSON.stringify(w0));
    await closeTop();

    const before = await state();
    await page.selectOption('#analysisApproach', 'one-stage');
    await click('button[onclick="runAnalysis()"]');
    await page.waitForTimeout(800);
    const after = await state();
    check('precondition: Run with One-Stage is refused and the earlier results stay', after.pooled === before.pooled && before.pooled !== null, JSON.stringify({ before, after }));
    await openPanel();
    const w1 = await warning();
    check('after the refused Run: the validation panel shows a warning', w1.exists && w1.visible, JSON.stringify(w1));
    check('... saying the analysis validated was not produced by the current form settings', /not produced by the current form settings/i.test(w1.text || ''), w1.text);
    check('... and that the last Run was refused', /refused/i.test(w1.text || ''), w1.text);
    check('... naming the setting that differs (analysisApproach one-stage)', /analysisApproach "one-stage"/.test(w1.text || ''), w1.text);
    await closeTop();

    // back to Two-Stage and Run: the warning goes away
    await page.selectOption('#analysisApproach', 'two-stage');
    await click('button[onclick="runAnalysis()"]');
    await page.waitForTimeout(1200);
    await openPanel();
    const w2 = await warning();
    check('after a successful Run with the form settings: no warning', w2.exists && !w2.visible, JSON.stringify(w2));
    await closeTop();

    // a setting changed on the form without pressing Run: warned too
    const methods = await page.$$eval('#reMethod option', (os) => os.map((o) => o.value));
    const cur = await page.$eval('#reMethod', (e) => e.value);
    const other = methods.find((m) => m && m !== cur);
    // (#reMethod is not actionable for Playwright's selectOption here; set it and fire change as the select does)
    await page.evaluate((v) => { const e = document.getElementById('reMethod'); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, other);
    await openPanel();
    const w3 = await warning();
    check('form changed without Run (reMethod ' + cur + ' -> ' + other + '): warned', w3.exists && w3.visible && /reMethod/.test(w3.text || '') && !/refused/i.test(w3.text || ''), JSON.stringify(w3));
    await closeTop();
  } catch (e) {
    check('test ran to completion', false, e && e.stack);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? 'FAILED ' + failed : 'all passed');
  process.exitCode = failed ? 1 : 0;
})();
