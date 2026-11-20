'use strict';
// Requirement: in the Live WebR Validation panel, each scenario's JavaScript values and its R code must come from
// the SAME analysis. The R code was built before R ran (getRCode) but the JavaScript values were read after R
// returned (getJSValues), so a re-run of the analysis while R was busy compared R(analysis A) with JS(analysis B).
// Here R answers exactly A's numbers; the row must therefore show A's JavaScript values and PASS.
// WebR is replaced by a fake module (request interception of the pinned webr.mjs URL) whose evalR answers only
// when the test releases it, so the re-run happens exactly while "R is running".
//   node dev/tests/webr_js_snapshot_same_run.test.cjs [path/to/ipd-meta-pro.html]
// Needs system Chrome and playwright-core (PLAYWRIGHT_CORE=<dir>/playwright-core); prints SKIPPED and exits 2 without.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const pageFile = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || 'playwright-core').chromium; } catch (e) { /* below */ }
if (!chromium || !fs.existsSync(CHROME)) { console.log('SKIPPED: needs system Chrome and playwright-core'); process.exit(2); }
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }

const FAKE_WEBR = `
export class WebR {
  async init() {}
  async installPackages() {}
  evalR(code) {
    return new Promise((res) => (window.__rcalls = window.__rcalls || []).push({ code, res }));
  }
}`;
const A = { studies: [{ effect: 0.30, variance: 0.04 }, { effect: 0.50, variance: 0.05 }, { effect: 0.42, variance: 0.03 }],
  pooled: { effect: 0.4012, se: 0.1061, ci_lower: 0.1933, ci_upper: 0.6091, tau2: 0, I2: 0, Q: 0.62 } };
const B = { studies: [{ effect: 0.90, variance: 0.04 }, { effect: 1.10, variance: 0.05 }, { effect: 1.02, variance: 0.03 }],
  pooled: { effect: 1.0012, se: 0.1061, ci_lower: 0.7933, ci_upper: 1.2091, tau2: 0, I2: 0, Q: 0.62 } };

(async () => {
  const dir = path.dirname(pageFile);
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  const PORT = +(process.env.RPATH_PORT || 18435);
  await new Promise((r, j) => { server.once('error', j); server.listen(PORT, '127.0.0.1', r); });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => d.dismiss());
    await page.route('https://webr.r-wasm.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE_WEBR }));
    await page.goto('http://127.0.0.1:' + PORT + '/' + path.basename(pageFile), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.runWebRValidation === 'function', null, { timeout: 30000 });
    await page.evaluate((a) => { APP.results = JSON.parse(JSON.stringify(a)); APP.config = Object.assign(APP.config || {}, { reMethod: 'REML', useHKSJ: false, confLevel: 0.95 }); }, A);
    const done = page.evaluate(() => window.runWebRValidation('current'));
    await page.waitForFunction(() => (window.__rcalls || []).length > 0, null, { timeout: 30000 });
    // analysis B replaces A while R is still computing the first scenario
    await page.evaluate((b) => { APP.results = JSON.parse(JSON.stringify(b)); }, B);
    // release every R call as it arrives: R answers A's numbers for the code built from A's studies, nothing otherwise
    const releaser = setInterval(() => page.evaluate((a) => {
      const calls = window.__rcalls || [];
      while (calls.length) {
        const c = calls.shift();
        const isA = c.code.includes('yi   <- c(0.3, 0.5, 0.42)') && /rma\(/.test(c.code) && /pooled=/.test(c.code) && /Q=/.test(c.code);
        const vals = isA ? { pooled: a.pooled.effect, se: a.pooled.se, ci_lower: a.pooled.ci_lower, ci_upper: a.pooled.ci_upper, tau2: 0, i2: 0, Q: a.pooled.Q } : {};
        const names = Object.keys(vals);
        c.res({ toJs: async () => ({ names, values: names.map((k) => ({ values: [vals[k]] })) }), destroy: async () => {} });
      }
    }, A).catch(() => {}), 100);
    await done; clearInterval(releaser);
    const sc = await page.evaluate(() => {
      const t = window._webrInternals.getLastResults().tiers;
      for (const k of Object.keys(t)) for (const r of t[k]) if (r.scenario.id === 'cur_primary') return { status: r.status, rows: (r.rows || []).map((x) => ({ label: x.label, js: x.js, r: x.r, pass: x.pass })) };
      return null;
    });
    check('precondition: the primary-MA scenario ran', !!(sc && sc.status === 'ok'), JSON.stringify(sc).slice(0, 200));
    const pooled = sc && sc.rows.find((x) => x.label === 'pooled');
    check('its JavaScript pooled value is the one R was given (analysis A, 0.4012), not the re-run (1.0012)', pooled && pooled.js === A.pooled.effect, pooled && ('js ' + pooled.js + ', R ' + pooled.r));
    check('so the row agrees with R (PASS), instead of a FAIL manufactured by mixing two analyses', pooled && pooled.pass === true, pooled && String(pooled.pass));
  } catch (e) { check('ran', false, e.stack || e); }
  finally { await browser.close(); server.close(); }
  if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
  console.log('all passed');
})();
