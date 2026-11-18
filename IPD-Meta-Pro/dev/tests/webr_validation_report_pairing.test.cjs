'use strict';
// Requirement: the downloaded validation report (Download Report) must print the validation run's JS/R table
// next to an R script that describes the SAME analysis. It used to print the last run's table next to a script
// generated at download time, so after re-running the analysis on the page the report's table said one analysis
// (pooled 0.4012) and its script embedded another (pooled 1.0012). Reproduced by execution before the fix.
// The report is an exported file; what the page displays is not changed. If the run's script is not available,
// the report's script is generated at download time, as before. No text is added to the report.
// WebR is replaced by a fake module (request interception of the pinned webr.mjs URL) that answers A's numbers.
//   node dev/tests/webr_validation_report_pairing.test.cjs [path/to/ipd-meta-pro.html]
// Needs system Chrome and playwright-core (PLAYWRIGHT_CORE=<dir>/playwright-core); prints SKIPPED and exits 2 without.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const pageFile = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || 'playwright-core').chromium; } catch (e) { /* below */ }
if (!chromium || !fs.existsSync(CHROME)) { console.log('SKIPPED: needs system Chrome and playwright-core'); process.exit(2); }
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }

const A = { studies: [{ effect: 0.30, variance: 0.04 }, { effect: 0.50, variance: 0.05 }, { effect: 0.42, variance: 0.03 }],
  pooled: { effect: 0.4012, se: 0.1061, ci_lower: 0.1933, ci_upper: 0.6091, tau2: 0, I2: 0, Q: 0.62 } };
const B = { studies: [{ effect: 0.90, variance: 0.04 }, { effect: 1.10, variance: 0.05 }, { effect: 1.02, variance: 0.03 }],
  pooled: { effect: 1.0012, se: 0.1061, ci_lower: 0.7933, ci_upper: 1.2091, tau2: 0, I2: 0, Q: 0.62 } };
const FAKE_WEBR = `
const A = ${JSON.stringify(A.pooled)};
export class WebR {
  async init() {}
  async installPackages() {}
  async evalR(code) {
    const isA = code.includes('yi   <- c(0.3, 0.5, 0.42)') && /pooled=/.test(code) && /Q=/.test(code);
    const vals = isA ? { pooled: A.effect, se: A.se, ci_lower: A.ci_lower, ci_upper: A.ci_upper, tau2: 0, i2: 0, Q: A.Q } : {};
    const names = Object.keys(vals);
    return { toJs: async () => ({ names, values: names.map((k) => ({ values: [vals[k]] })) }), destroy: async () => {} };
  }
}`;
// the table's JS pooled value and the script's embedded page pooled value, read from the report HTML
function pair(rep) {
  const unesc = (t) => t.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#96;|&#x60;/g, '`').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const head = rep.split('Reproducible R Script')[0];
  const table = (/<h3>Current Analysis [^<]{1,8} Primary MA<\/h3>[\s\S]*?<td>pooled<\/td>\s*<td>([^<]*)<\/td>/.exec(head) || [])[1];
  const pre = unesc((rep.split('<pre>')[1] || '').split('</pre>')[0]);
  const script = (/\.ipd_scenario\("Current Analysis - Primary MA"[\s\S]*?`pooled` = ([0-9.eE+-]+)/.exec(pre) || [])[1];
  return { table: table == null ? null : parseFloat(table), script: script == null ? null : parseFloat(script) };
}

(async () => {
  const dir = path.dirname(pageFile);
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  const PORT = +(process.env.RPATH_PORT || 18437);
  await new Promise((r, j) => { server.once('error', j); server.listen(PORT, '127.0.0.1', r); });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    page.on('dialog', (d) => d.dismiss());
    await page.route('https://webr.r-wasm.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE_WEBR }));
    await page.goto('http://127.0.0.1:' + PORT + '/' + path.basename(pageFile), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.runWebRValidation === 'function' && typeof window.downloadValidationReport === 'function', null, { timeout: 30000 });
    // capture the report instead of downloading it
    await page.evaluate(() => {
      const B0 = window.Blob; window.__reports = [];
      window.Blob = function (parts, opts) { const b = new B0(parts, opts); if (opts && opts.type === 'text/html') window.__reports.push(parts.join('')); return b; };
    });
    // a successful analysis as runAnalysis() leaves it: results, lastResults and analysisSettings together
    const analyse = (x) => page.evaluate((r) => {
      APP.results = JSON.parse(JSON.stringify(r)); APP.config = Object.assign(APP.config || {}, { reMethod: 'REML', useHKSJ: false, confLevel: 0.95 });
      APP.lastResults = APP.results; APP.analysisSettings = Object.assign({}, APP.config);
    }, x);
    await analyse(A);
    await page.evaluate(() => window.runWebRValidation('current'));
    // the user re-runs the analysis on the page (analysis B); no new validation run
    await analyse(B);
    const rep = await page.evaluate(() => { window.downloadValidationReport(); return window.__reports[window.__reports.length - 1] || ''; });
    const p = pair(rep);
    check('precondition: the report has the run\'s table (JS pooled = analysis A, 0.4012)', p.table != null && Math.abs(p.table - A.pooled.effect) < 1e-4, JSON.stringify(p));
    check('the report\'s R script embeds the SAME analysis as its table (A), not the page\'s later one (B, 1.0012)',
      p.script != null && Math.abs(p.script - p.table) < 1e-4, JSON.stringify(p));
    // no text is added to the report: the R-script heading is followed directly by the <pre>, as before
    check('the report adds no text around its R script', /<h2>Reproducible R Script<\/h2>\s*<pre>/.test(rep), (rep.split('Reproducible R Script</h2>')[1] || '').slice(0, 40));
    // the run's script is not available (results set without a run) -> generated at download time, as before
    await page.evaluate(() => window._webrInternals.setLastResults({ mode: 'current', timestamp: 'T0', overall: '-', tiers: {}, passCount: 0, totalCount: 0 }));
    const rep2 = await page.evaluate(() => { window.downloadValidationReport(); return window.__reports[window.__reports.length - 1] || ''; });
    const p2 = pair(rep2);
    check('no script from the run -> the report falls back to a script generated at download time (analysis B, as before the fix)',
      p2.script != null && Math.abs(p2.script - B.pooled.effect) < 1e-4, JSON.stringify(p2));
  } catch (e) { check('ran', false, e.stack || e); }
  finally { await browser.close(); server.close(); }
  if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
  console.log('all passed');
})();
