'use strict';
// Requirement: a user can reach the in-page Verify-in-R panel (Statistical Validation: "Validate Current
// Analysis", "Download R script") through a visible, labelled control, using only clicks -- and it stays
// reachable after the other Help items have been opened.
// Before this fix (reproduced with real mouse clicks in headless Chrome): the panel sits inside #helpModal,
// whose only opener showHelp() is called by no control, and every Help menu item goes through
// HelpSystem.showModal(), which rewrote #helpModal's innerHTML -- after the first Help item the
// validation tab and #webrBtnCurrent no longer existed at all.
// This test never calls showHelp(), switchHelpTab() or runWebRValidation(): it clicks the Help toggle and
// menu items as a user does (Playwright mouse clicks; WebR is stubbed so nothing is fetched).
//   node dev/tests/webr_panel_reachable_ui.test.cjs [path/to/ipd-meta-pro.html]
// Needs system Chrome + playwright-core (PLAYWRIGHT_CORE=<dir>/playwright-core). Without them it prints
// SKIPPED and exits 2: a check that did not run is not a pass.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const pageFile = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let chromium = null;
try { chromium = require(process.env.PLAYWRIGHT_CORE || 'playwright-core').chromium; } catch (e) { /* below */ }
if (!chromium || !fs.existsSync(CHROME)) { console.log('SKIPPED: needs system Chrome and playwright-core'); process.exit(2); }
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); if (!ok) failed++; }
const FAKE_WEBR = 'export class WebR { async init() {} async installPackages() {} async evalR() { return { toJs: async () => ({ names: [], values: [] }), destroy: async () => {} }; } }';

(async () => {
  const dir = path.dirname(pageFile);
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  const PORT = +(process.env.RPATH_PORT || 18438);
  await new Promise((r, j) => { server.once('error', j); server.listen(PORT, '127.0.0.1', r); });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('dialog', (d) => d.dismiss());
    await page.route('https://webr.r-wasm.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE_WEBR }));
    await page.goto('http://127.0.0.1:' + PORT + '/' + path.basename(pageFile), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.runWebRValidation === 'function', null, { timeout: 60000 });
    // a real mouse click; Playwright's actionability wait can time out on a loaded machine, then the same
    // mouse click is sent without it (still a click at the element's position, never a JS call)
    const click = async (sel) => { try { await page.click(sel, { timeout: 10000 }); } catch (e) { await page.click(sel, { force: true, timeout: 10000 }); } };
    const btnVisible = () => page.evaluate(() => { const x = document.getElementById('webrBtnCurrent'); if (!x) return 'absent'; const r = x.getBoundingClientRect(); return x.offsetParent !== null && r.width > 0 && r.height > 0 ? 'visible' : 'hidden'; });
    const menuItems = () => page.$$eval('#helpDropdown .dropdown-item', (els) => els.map((e) => e.textContent.trim()));
    const openFromHelp = async (re) => {
      await click('#helpDropdown > .dropdown-toggle');
      await page.waitForTimeout(300);
      const items = await menuItems();
      const i = items.findIndex((t) => re.test(t));
      if (i < 0) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); return null; }   // close the menu again
      await click('#helpDropdown .dropdown-item >> nth=' + i);
      await page.waitForTimeout(600);
      return items[i];
    };
    const closeTop = async () => { await click('.modal-overlay.active .modal-close'); await page.waitForTimeout(300); };

    check('precondition: the Verify-in-R panel exists on load', (await btnVisible()) !== 'absent');
    check('precondition: it is not visible on load', (await btnVisible()) === 'hidden');

    // 1. the Help menu has a labelled entry for the panel, and clicking it shows "Validate Current Analysis"
    const label = await openFromHelp(/Statistical Validation|Verify in R/i);
    check('the Help menu has a labelled Statistical Validation / Verify in R entry', label !== null, JSON.stringify(await menuItems()));
    check('clicking it shows #webrBtnCurrent ("Validate Current Analysis")', (await btnVisible()) === 'visible', await btnVisible());
    check('... and the Download R script control', await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Download R script/.test(x.textContent)); return !!(b && b.offsetParent !== null); }));
    if (label !== null) await closeTop();

    // 2. every other Help item, opened and closed with clicks, leaves the panel intact and reachable
    for (const item of (await menuItems()).filter((t) => !/Statistical Validation|Verify in R/i.test(t))) {
      const esc = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await openFromHelp(new RegExp('^' + esc + '$'));
      const title = await page.evaluate(() => { const m = document.querySelector('.modal-overlay.active .modal-title'); return m ? m.textContent.trim() : null; });
      check('control: Help > ' + item + ' still opens its own content', !!title && title.replace(/[^\w ]/g, '').trim().length > 0 && item.replace(/[^\w ]/g, '').trim().includes(title.replace(/[^\w ]/g, '').trim()), 'title ' + JSON.stringify(title));
      await closeTop();
      check('after Help > ' + item + ': #webrBtnCurrent still exists', (await btnVisible()) !== 'absent', await btnVisible());
    }
    const again = await openFromHelp(/Statistical Validation|Verify in R/i);
    check('after every other Help item: the entry still reaches a visible #webrBtnCurrent', again !== null && (await btnVisible()) === 'visible', await btnVisible());
  } catch (e) { console.log('FAIL threw: ' + (e.stack || e)); failed++; }
  finally { await browser.close(); server.close(); }
  console.log(failed ? failed + ' FAILED' : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
