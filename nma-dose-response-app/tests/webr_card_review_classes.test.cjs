'use strict';
// The in-page "WebR: Verify with R metafor" card (index.html, runWebRValidation / buildComparisonTable / checkMatch).
// Requirements:
//  (3) A tick / VALIDATED must never sit beside a page value that differs from R's in the digits the card shows:
//      the tolerance is never looser than half a unit of the displayed decimals (6; I2 2; Q 4). It was
//      max(1e-4 |R|, 1e-6), so 0.549600 (R) vs 0.549640 (page) got a tick.
//  (1) A run started on data A that finishes after the page's data changed to B must not show A's verdict:
//      it is discarded and the card says so. Control: unchanged data -> the verdict is shown.
//   node nma-dose-response-app/tests/webr_card_review_classes.test.cjs [path/to/index.html]
// Part (1) needs system Chrome and playwright-core (PLAYWRIGHT_CORE=<dir>/playwright-core); it is skipped, and
// says so, without them. It serves the repository on 127.0.0.1:${RPATH_PORT || 18434}.
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');
const page = process.argv[2] || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(page, 'utf8');
function grab(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('function ' + name + ' not found');
  let depth = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) { if (html[k] === '{') depth++; else if (html[k] === '}') { depth--; if (depth === 0) return html.slice(i, k + 1); } }
  throw new Error('unbalanced ' + name);
}
let failed = 0;
const check = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  [' + d + ']')); if (!ok) failed++; };

// ---- (3) tolerance ----
const ctx = vm.createContext({ Math, isFinite, Number, String });
vm.runInContext(["esc", "fmtNum", "webrTol", "buildComparisonTable", "checkMatch"].map(grab).join('\n'), ctx);
const R = { effect: 0.5496, se: 0.1474, tau2: 0.0437, I2: 67.15, Q: 6.0884, Qp: 0.0476, ci_lb: 0.2608, ci_ub: 0.8384, k: 3 };
const APP = { effect: 0.5496, se: 0.1474, tau2: 0.0437, I2: 67.15, Q: 6.0884, ci: { lower: 0.2608, upper: 0.8384 } };
ctx.R = R; ctx.APP = APP;
check('control: equal values -> checkMatch true', vm.runInContext('checkMatch(R, APP)', ctx) === true, '');
ctx.APP4 = Object.assign({}, APP, { effect: 0.54964 });
const shown = vm.runInContext('[fmtNum(R.effect, 6), fmtNum(APP4.effect, 6)]', ctx);
check('precondition: the planted difference is visible in the 6 decimals shown', shown[0] !== shown[1], shown.join(' vs '));
check('a difference visible in the shown decimals is not VALIDATED', vm.runInContext('checkMatch(R, APP4)', ctx) === false, 'checkMatch true for ' + shown.join(' vs '));
const rows = [...vm.runInContext('buildComparisonTable(R, APP4)', ctx).matchAll(/<tr style="border-bottom[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
const eff = rows.find((r) => /Pooled Effect/.test(r)) || '';
check('... and its row carries a cross, not a tick', /&#x2717;/.test(eff) && !/&#x2713;/.test(eff), eff.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
ctx.APP5 = Object.assign({}, APP, { I2: 67.153 });   // shown 67.15 both: within half a unit of 2 decimals
check('control: a difference below half a shown unit (I2 67.15 vs 67.153) still matches', vm.runInContext('checkMatch(R, APP5)', ctx) === true, '');

// ---- (1) stale verdict (browser) ----
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || 'playwright-core').chromium; } catch (e) { /* skipped */ }
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
(async () => {
  if (!chromium || !fs.existsSync(CHROME)) { console.log('SKIP (1) stale verdict: needs system Chrome and playwright-core'); return; }
  const ROOT = path.resolve(path.dirname(page), '..');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  const PORT = +(process.env.RPATH_PORT || 18434);
  await new Promise((r, j) => { server.once('error', j); server.listen(PORT, '127.0.0.1', r); });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  async function race(changeData) {
    const pg = await browser.newPage();
    await pg.goto('http://127.0.0.1:' + PORT + '/' + path.basename(path.dirname(page)) + '/', { waitUntil: 'load' });
    await pg.waitForFunction(() => !!document.getElementById('webrRunBtn'), null, { timeout: 15000 });
    // a runner whose answer is released by hand; it answers with the page's own DL for each pool (= agreement)
    await pg.evaluate(() => {
      window.__pending = [];
      window.AlmWebR = { runR: (o) => new Promise((res) => window.__pending.push({ o, res })) };
    });
    await pg.evaluate(() => document.getElementById('webrRunBtn').click());
    await pg.waitForFunction(() => window.__pending.length > 0, null, { timeout: 10000 });
    if (changeData) await pg.evaluate(() => { window._nmaState.rawData[0].effect += 0.3; });
    await pg.evaluate(() => {
      const s = window.__pending[0].o.script, out = [];
      for (const m of s.matchAll(/^emit\((\d+), c\(([^)]*)\), c\(([^)]*)\)\)$/gm)) {
        const yi = m[2].split(',').map(Number), se = m[3].split(',').map((v) => Math.sqrt(+v));
        const a = window.DLEstimator.calculate(yi, se);
        out.push('NMAWEBR:' + m[1] + ':' + [a.effect, a.se, a.tau2, a.I2, a.Q, 0.5, a.ci.lower, a.ci.upper, yi.length].join(','));
      }
      window.__pending[0].res({ ok: true, stdout: out.join('\n') + '\n', versions: { R: 'R 4.5.1', webR: '0.5.5', metafor: '4.8-0' } });
    });
    await pg.waitForTimeout(500);
    const t = await pg.evaluate(() => document.getElementById('webrResults').textContent);
    await pg.close();
    return t;
  }
  try {
    const ctl = await race(false);
    check('(1) control: unchanged data -> the verdict is shown', /VALIDATED/.test(ctl), ctl.slice(0, 200));
    const st = await race(true);
    check('(1) data changed while R ran -> no verdict for the old data', !/VALIDATED|Some metrics differ/.test(st), st.slice(0, 200));
    check('(1) ... and the card says the result was discarded', /discarded/i.test(st), st.slice(0, 200));
  } finally { await browser.close(); server.close(); }
})().then(() => { console.log(failed ? failed + ' FAILED' : 'ALL PASS'); process.exitCode = failed ? 1 : 0; },
  (e) => { console.log('ERROR', e && e.stack || e); process.exitCode = 1; });
