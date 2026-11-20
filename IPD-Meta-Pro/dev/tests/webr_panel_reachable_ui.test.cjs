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
    // (noWaitAfter: a heavy handler such as loading an example can block the page past Playwright's post-click wait)
    const click = async (sel) => { try { await page.click(sel, { timeout: 15000 }); } catch (e) { await page.click(sel, { force: true, noWaitAfter: true, timeout: 30000 }); } };
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
    if (again !== null) await closeTop();

    // 3. dialogs from ModalManager (review of PR #639): its closeAll() removed EVERY .modal-overlay, the static
    //    #helpModal included, so after the main-page "Method Guide" button or a results dialog (TruthCert, via
    //    showResultsModal) Help > Statistical Validation threw "Cannot read properties of null (reading
    //    'classList')" and the panel was gone until reload. Open both with clicks, then reach the panel and
    //    CLICK "Validate Current Analysis" and see a current-analysis run finish (WebR stubbed).
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    const visibleSel = (sel) => page.evaluate((s) => { const x = document.querySelector(s); return !!(x && x.offsetParent !== null && x.getBoundingClientRect().width > 0); }, sel);
    // as a user: load the SGLT2 example (this shows the analysis card with the Method Guide button)
    await click('button[onclick="loadExampleData(\'binary\')"]');
    await page.waitForFunction(() => { const c = document.getElementById('analysisSettingsCard'); return c && c.style.display !== 'none'; }, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    for (const [name, sel] of [['Method Guide (main page)', 'button[onclick="showMethodGuide()"]'], ['TruthCert (results dialog)', '#truthCertBtn']]) {
      check('precondition: the ' + name + ' button is visible', await visibleSel(sel));
      await click(sel);
      await page.waitForTimeout(600);
      // ModalManager dialogs carry their title in an <h2>, HelpSystem ones in .modal-title
      const title = await page.evaluate(() => { const m = document.querySelector('.modal-overlay.active .modal-title, .modal-overlay.active h2'); return m ? m.textContent.trim() : null; });
      check('control: ' + name + ' opens its dialog', !!title, 'title ' + JSON.stringify(title));
      // closed with the Escape key (ModalManager's own close handler): its x can sit outside the viewport
      if (title) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
      check('control: ' + name + ' dialog closed', await page.evaluate(() => !document.querySelector('.modal-overlay.active')));
      check('after ' + name + ': #webrBtnCurrent still exists', (await btnVisible()) !== 'absent', await btnVisible());
    }
    // then run the analysis (the results tab replaces the data tab, so Method Guide was clicked first)
    await click('button[onclick="runAnalysis()"]');
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.results && APP.results.pooled && APP.lastResults === APP.results, null, { timeout: 120000 });
    await page.waitForTimeout(1000);
    const nErr = errors.length;
    const third = await openFromHelp(/Statistical Validation|Verify in R/i);
    check('after Method Guide and TruthCert: Help > Statistical Validation shows #webrBtnCurrent', third !== null && (await btnVisible()) === 'visible', await btnVisible());
    check('... without a page error', errors.length === nErr, errors.slice(nErr).join(' | '));
    if ((await btnVisible()) === 'visible') {
      // the analysis run above is the current analysis; the auto-started reference run on first tab visit must finish before the button is enabled
      await page.waitForFunction(() => { const x = document.getElementById('webrBtnCurrent'); return x && !x.disabled; }, null, { timeout: 120000 });
      await click('#webrBtnCurrent');
      await page.waitForFunction(() => { const r = window._webrInternals.getLastResults(); const x = document.getElementById('webrBtnCurrent'); return r && r.mode === 'current' && x && !x.disabled; }, null, { timeout: 120000 }).catch(() => {});
      const run = await page.evaluate(() => { const r = window._webrInternals.getLastResults(); return r ? { mode: r.mode, overall: r.overall } : null; });
      check('clicking #webrBtnCurrent runs the current-analysis validation', !!run && run.mode === 'current', JSON.stringify(run));
    }
  } catch (e) { console.log('FAIL threw: ' + (e.stack || e)); failed++; }
  finally { await browser.close(); server.close(); }
  console.log(failed ? failed + ' FAILED' : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
