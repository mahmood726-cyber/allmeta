'use strict';
// Requirement: the Clustered IPD dialog is a keyboard-usable dialog: role="dialog", aria-modal and an
// accessible name; focus moves into it when it opens; Tab and Shift+Tab stay inside it; Escape and a
// NAMED close button close it; focus then returns to the control that opened it.
// Limitation sweep LIM-P60 L32, on main cfce892d: a plain <div class="modal"> with none of these (the
// close button is an unnamed "x", Escape does nothing, focus stays behind the overlay).
// Real keyboard events in headless Chrome; the page is served from its own directory on a port of this test.
//   node dev/tests/clustered_ipd_keyboard_ui.test.cjs [path/to/ipd-meta-pro.html]
// Needs system Chrome + playwright-core (PLAYWRIGHT_CORE=<dir>/playwright-core). Without them it prints SKIPPED and
// exits 2: a check that did not run is not a pass.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const pageFile = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || 'playwright-core').chromium; } catch (e) { /* below */ }
if (!chromium || !fs.existsSync(CHROME)) { console.log('SKIPPED: needs system Chrome and playwright-core'); process.exit(2); }
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + String(detail).slice(0, 300) + ']' : '')); if (!ok) failed++; }
(async () => {
  const dir = path.dirname(pageFile);
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  const PORT = +(process.env.RPATH_PORT || 18652);
  await new Promise((r, j) => { server.once('error', j); server.listen(PORT, '127.0.0.1', r); });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('dialog', (d) => d.dismiss());
    await page.goto('http://127.0.0.1:' + PORT + '/' + path.basename(pageFile), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.loadExampleData === 'function' && typeof window.showClusteredIPDAnalysis === 'function', null, { timeout: 60000 });
    await page.evaluate(() => window.loadExampleData('continuous'));
    await page.waitForTimeout(2000);
    // an opener control with focus, then the dialog opened from it
    await page.evaluate(() => { const b = document.createElement('button'); b.id = '__opener'; b.textContent = 'open'; document.body.appendChild(b); b.focus(); window.showClusteredIPDAnalysis(); });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => { const m = document.getElementById('clusteredIPDModal'); if (!m) return null;
      const lab = m.getAttribute('aria-labelledby'); const named = (lab && document.getElementById(lab)) ? document.getElementById(lab).textContent.trim() : (m.getAttribute('aria-label') || '');
      const close = [...m.querySelectorAll('button')].find(b => /close/i.test(b.getAttribute('aria-label') || b.textContent || ''));
      return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), named, focusInside: m.contains(document.activeElement), closeNamed: !!close }; });
    check('precondition: the dialog opened', !!info);
    check('it has role="dialog", aria-modal="true" and an accessible name', info && info.role === 'dialog' && info.modal === 'true' && /Clustered IPD/.test(info.named), JSON.stringify(info));
    check('focus moves into the dialog when it opens', info && info.focusInside, JSON.stringify(info));
    check('the close button has an accessible name', info && info.closeNamed, JSON.stringify(info));
    let inside = true;
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); inside = inside && await page.evaluate(() => { const m = document.getElementById('clusteredIPDModal'); return !!m && m.contains(document.activeElement); }); }
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Shift+Tab'); inside = inside && await page.evaluate(() => { const m = document.getElementById('clusteredIPDModal'); return !!m && m.contains(document.activeElement); }); }
    check('Tab / Shift+Tab keep focus inside the dialog', inside);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ open: !!document.getElementById('clusteredIPDModal'), focus: document.activeElement && document.activeElement.id }));
    check('Escape closes the dialog and focus returns to the opener', !after.open && after.focus === '__opener', JSON.stringify(after));
    // the named close button closes it too, and Escape after closing does nothing harmful
    await page.evaluate(() => { document.getElementById('__opener').focus(); window.showClusteredIPDAnalysis(); });
    await page.waitForTimeout(300);
    const closed = await page.evaluate(() => { const m = document.getElementById('clusteredIPDModal'); const b = m && [...m.querySelectorAll('button')].find(x => /close/i.test(x.getAttribute('aria-label') || '')); if (!b) return 'no named close button'; b.click(); return { open: !!document.getElementById('clusteredIPDModal'), focus: document.activeElement && document.activeElement.id }; });
    check('the named close button closes it and returns focus', closed && closed.open === false && closed.focus === '__opener', JSON.stringify(closed));
  } catch (e) { check('test ran without error', false, e.stack || e); }
  finally { await browser.close(); server.close(); }
  if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
  console.log('all passed');
})();
