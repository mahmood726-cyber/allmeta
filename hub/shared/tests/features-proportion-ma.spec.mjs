// Feature panel on app 9 (proportion-ma): Verify in R (webR, same-origin bundle) incl. planted defect and
// downloads, Share link round-trip incl. F1 provenance, refusal of corrupted/foreign links, keyboard tablist,
// and axe (serious/critical) on the panel. Run: npx playwright test -c playwright.features.config.mjs
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readZip, readTiff, decodePng } from './zip-reader.mjs';

const PAGE = '/proportion-ma/index.html';
// The Verify in R test hook (window.__almVerifyPerturb) is inert unless the URL has ?almtest=1.
const PAGE_TEST = PAGE + '?almtest=1';
const PASS_RE = /^(\d+) of (\d+) computed quantities match R; 0 not computed — PASS$/;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const PROVENANCE = [
  { id: 'p1', label: 'Alpha 2019', reference: 'Alpha A et al. Trials 2019;20:1', location: 'Table 2', pastedText: '5/40 (12.5%)',
    choice: { 'arm(s)': 'single arm', outcome: 'response', timepoint: '12 weeks' },
    values: [{ field: 'xi', value: 5, span: [0, 1], text: '5' }, { field: 'ni', value: 40, span: [2, 4], text: '40' }],
    conversions: [], flags: [], usedAs: 'proportion', confirmed: true, confirmedAt: '2026-10-20T10:00:00Z' },
  { id: 'p2', label: 'Beta 2021', reference: 'Beta B. BMJ 2021;372:n1', location: 'p. 5', pastedText: '9 of 60 patients',
    choice: { 'arm(s)': 'single arm', outcome: 'response', timepoint: '12 weeks' },
    values: [{ field: 'xi', value: 9, span: [0, 1], text: '9' }, { field: 'ni', value: 60, span: [5, 7], text: '60' }],
    conversions: [], flags: [{ code: 'TIMEPOINT_CHOSEN', text: '12 weeks chosen of 12/24' }], usedAs: 'proportion', confirmed: true, confirmedAt: '2026-10-20T10:05:00Z' },
];

async function openPanel(page) {
  const toggle = page.locator('#alm-features .alm-f-toggle');
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}
// AXE note: the app fades panels in; wait for every finite animation before scanning (contrast race).
async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => !a.effect || a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))));
}
async function axe(page, label) {
  await settle(page);
  const r = await new AxeBuilder({ page }).include('#alm-features').withTags(AXE_TAGS).analyze();
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  console.log(`AXE ${label}: ${r.violations.length} violations (${bad.length} serious/critical); ${r.passes.length} rules passed`);
  expect(bad.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target.join(' ')) }))).toEqual([]);
}
const sha = b => createHash('sha256').update(b).digest('hex');

test('Verify in R: every row passes on the built-in example; planted defect fails; downloads', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE_TEST);
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  await expect(page.locator('#alm-features')).toBeVisible();
  await openPanel(page);

  // Accessible tablist: roving tabindex + arrow/Home/End keys.
  const verifyTab = page.getByRole('tab', { name: 'Verify in R', exact: true });
  const shareTab = page.getByRole('tab', { name: 'Share', exact: true });
  await verifyTab.click();
  await expect(verifyTab).toHaveAttribute('aria-selected', 'true');
  await expect(verifyTab).toHaveAttribute('tabindex', '0');
  await expect(shareTab).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('#alm-f-panel-share')).toBeHidden();
  await verifyTab.focus(); await page.keyboard.press('ArrowRight');
  await expect(shareTab).toHaveAttribute('aria-selected', 'true'); await expect(shareTab).toBeFocused();
  await expect(page.locator('#alm-f-panel-verify')).toBeHidden();
  await page.keyboard.press('Home'); await expect(page.getByRole('tab').first()).toBeFocused();
  await page.keyboard.press('End'); await expect(shareTab).toBeFocused();
  await verifyTab.click();
  await axe(page, 'verify tab (before run)');

  const panel = page.locator('#alm-f-panel-verify');
  const summary = panel.locator('[data-testid=verify-summary]');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).not.toBeEmpty({ timeout: 600_000 });
  const text = (await summary.textContent()).trim();
  console.log('FEATURES VERIFY ' + text);
  const m = PASS_RE.exec(text);
  expect(m, text).not.toBeNull();
  const N = +m[2];
  expect(N).toBeGreaterThanOrEqual(10); expect(+m[1]).toBe(N);
  const results = await panel.locator('tbody td[data-result]').allTextContents();
  expect(results).toHaveLength(N); expect(results.filter(r => r !== 'PASS')).toEqual([]);
  const st = await page.evaluate(() => ({ verify: AlmFeaturesState.verify, revision: AlmFeatures.revision('proportion-ma') }));
  console.log('FEATURES VERSIONS ' + JSON.stringify(st.verify.versions));
  console.log('FEATURES GRAPHICS ' + JSON.stringify(st.verify.graphics));
  expect(st.verify.passed).toBe(true); expect(st.verify.nPassed).toBe(N);
  expect(st.verify.nNotComputed).toBe(0); expect(st.verify.testHook).toBe(false);
  expect(st.verify.revision).toBe(st.revision);
  expect(st.verify.versions.webR).toBe('0.5.5');
  // R plot beside the app's plot; the app SVG clone carries no duplicate ids.
  await expect(panel.locator('figure img')).toHaveCount(1);
  expect(await panel.locator('figure img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(panel.locator('figure svg')).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelectorAll('#forest').length)).toBe(1);
  await expect(panel.getByRole('region', { name: 'R script' })).toContainText('metafor::forest(f');
  await axe(page, 'verify tab (after run)');

  // Downloads: everything as one ZIP, parsed with an independent reader.
  const [zipDl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  expect(zipDl.suggestedFilename()).toBe('proportion-ma-verify-in-r.zip');
  const entries = readZip(readFileSync(await zipDl.path()));
  const byName = Object.fromEntries(entries.map(e => [e.name, e.bytes]));
  console.log('FEATURES ZIP ' + entries.map(e => e.name + ':' + e.bytes.length).join(' '));
  for (const name of ['proportion-ma-verify.R', 'proportion-ma-verify-comparison.csv', 'sessionInfo.txt', 'console.txt',
    'proportion-ma-forest-R-300dpi.png', 'proportion-ma-forest-R.pdf', 'proportion-ma-forest-R-300dpi.tiff', 'truthcert.json']) expect(byName[name], name).toBeDefined();
  expect(Object.keys(byName).filter(n => /^proportion-ma-forest-(R|app)\.svg$/.test(n))).toHaveLength(1);
  expect(byName['provenance.csv'], 'no provenance recorded -> no provenance.csv').toBeUndefined();
  const dec = b => new TextDecoder().decode(b);
  const csv = dec(byName['proportion-ma-verify-comparison.csv']).trim().split('\n');
  expect(csv[0]).toBe('quantity,key,app,R,diff,abs_diff,tolerance,kind,result'); expect(csv).toHaveLength(N + 1);
  expect(csv.slice(1).every(l => l.endsWith(',PASS'))).toBe(true);
  const script = dec(byName['proportion-ma-verify.R']);
  expect(script).toContain('metafor::escalc'); expect(script).toContain('metafor::forest('); expect(script).toContain('print(sessionInfo())');
  expect(dec(byName['sessionInfo.txt'])).toMatch(/R version 4\.\d/); expect(dec(byName['sessionInfo.txt'])).toContain('metafor');
  expect(dec(byName['console.txt'])).toContain('ALMJSON:');
  expect(dec(byName['proportion-ma-forest-R.pdf'].subarray(0, 5))).toBe('%PDF-');
  const png = decodePng(byName['proportion-ma-forest-R-300dpi.png']);
  expect([png.width, png.height]).toEqual([2400, 1800]);
  expect(png.phys).toEqual({ x: 11811, y: 11811, unit: 1 });
  const tif = readTiff(byName['proportion-ma-forest-R-300dpi.tiff']);
  expect([tif.tags[256].value, tif.tags[257].value]).toEqual([2400, 1800]);
  expect(tif.tags[282].value).toEqual([300, 1]); expect(tif.tags[283].value).toEqual([300, 1]); expect(tif.tags[296].value).toBe(2);
  expect(tif.tags[279].value).toBe(2400 * 1800 * 3); expect(tif.tags[273].value + tif.tags[279].value).toBe(tif.length);
  const receipt = JSON.parse(dec(byName['truthcert.json']));
  const results9 = receipt.extra.results;
  expect(results9.app).toBe('proportion-ma'); expect(results9.passed).toBe(true); expect(results9.n).toBe(N);
  expect(results9.stateRevision).toBe(st.verify.revision); expect(results9.webR).toBe('0.5.5');
  expect(results9.files.map(f => f.name).sort()).toEqual(Object.keys(byName).filter(n => n !== 'truthcert.json').sort());
  for (const f of results9.files) { expect(f.sha256, f.name).toBe(sha(byName[f.name])); expect(f.bytes).toBe(byName[f.name].length); }
  expect(results9.testHook).toBe(false); expect(results9.nNotComputed).toBe(0);
  expect(receipt.studies).toHaveLength((await page.locator('#src').inputValue()).trim().split('\n').length);
  expect(receipt.signed).toBe(false);
  expect(receipt.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(await page.evaluate(r => AlmTruthCertExport.verifyContentHash(r), receipt)).toBe(true);
  const [csvDl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Comparison (.csv)', exact: true }).click()]);
  expect(csvDl.suggestedFilename()).toBe('proportion-ma-verify-comparison.csv');

  // Provenance travels into the ZIP when present.
  await page.evaluate(p => { AlmFeaturesState.provenance = p; }, PROVENANCE);
  const [zip2] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const prov = readZip(readFileSync(await zip2.path())).find(e => e.name === 'provenance.csv');
  expect(prov).toBeDefined();
  const provLines = dec(prov.bytes).trim().split('\n');
  expect(provLines[0]).toBe(await page.evaluate(() => AlmVerifyR.PROVENANCE_COLUMNS.join(',')));
  expect(provLines[0]).toContain(',pasted_text,quote_exact,quote_prefix,quote_suffix,conversions,flags,');
  expect(provLines[1]).toContain(',5/40 (12.5%),');
  expect(provLines).toHaveLength(5);

  // PLANTED DEFECT: perturb one app value via the documented test hook -> exactly that row FAILS.
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'tau2', delta: 1e-3 }; });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toContainText('FAIL', { timeout: 300_000 });
  const planted = (await summary.textContent()).trim();
  console.log('FEATURES PLANTED ' + planted);
  const TEST_PLANTED = `TEST MODE (test hook active; not a verification) — ${N - 1} of ${N} computed quantities match R; 0 not computed — FAIL: 1 not matching R; test hook active`;
  expect(planted).toBe(TEST_PLANTED);
  const failingKeys = () => panel.locator('tbody tr').evaluateAll(trs => trs.filter(tr => tr.querySelector('td[data-result]').textContent !== 'PASS').map(tr => tr.dataset.key));
  expect(await failingKeys()).toEqual(['tau2']);
  expect(await page.evaluate(() => ({ passed: AlmFeaturesState.verify.passed, testHook: AlmFeaturesState.verify.testHook, perturbed: AlmFeaturesState.verify.perturbed })))
    .toEqual({ passed: false, testHook: true, perturbed: { key: 'tau2', delta: 1e-3 } });
  const [zip3] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download everything (ZIP)', exact: true }).click()]);
  const r3 = JSON.parse(dec(readZip(readFileSync(await zip3.path())).find(e => e.name === 'truthcert.json').bytes)).extra.results;
  expect([r3.testHook, r3.passed, r3.perturbed]).toEqual([true, false, { key: 'tau2', delta: 1e-3 }]);
  expect(r3.summary).toBe(TEST_PLANTED);
  // The hook can never make a row pass: a zero perturbation (value equal to the app's own) still FAILS that row.
  await page.evaluate(() => { window.__almVerifyPerturb = { key: 'tau2', delta: 0 }; });
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(summary).toHaveText(TEST_PLANTED, { timeout: 300_000 });
  expect(await failingKeys()).toEqual(['tau2']);
  expect(await page.evaluate(() => AlmFeaturesState.verify.passed)).toBe(false);
  await page.evaluate(() => { delete window.__almVerifyPerturb; });
  // Standalone app SVG: no page-dependent paint, intrinsic size from the viewBox.
  const svgText = await page.evaluate(() => AlmVerifyR.serializeSvg(document.getElementById('forest')));
  expect(svgText).not.toMatch(/var\(|currentcolor/i);
  const svgAttr = await page.evaluate(t => { const s = new DOMParser().parseFromString(t, 'image/svg+xml').documentElement;
    return { vb: s.getAttribute('viewBox').trim().split(/[\s,]+/).slice(2).join(' '), wh: s.getAttribute('width') + ' ' + s.getAttribute('height') }; }, svgText);
  expect(svgAttr.wh).toBe(svgAttr.vb);
  expect(svgText).toMatch(/fill="rgb\(/);
  expect(errors).toEqual([]);
});

test('Share link restores data, options, provenance and the pooled estimate; bad links change nothing', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const errors = [];
  const fresh = async () => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };
  const page = await fresh();
  await page.goto(new URL(PAGE, baseURL).href);
  const defaultSrc = await page.locator('#src').inputValue();
  await page.locator('#src').fill('5, 40, Alpha 2019\n9, 60, Beta 2021\n14, 75, Gamma\n2, 30, Delta');
  await page.locator('#trans').selectOption('ft');
  await page.locator('#tau-est').selectOption('DL');
  await page.locator('#btn-run').click();
  const pooled = await page.locator('#res-body .pooled-row').innerText();
  const het = await page.locator('#het').innerText();
  await page.evaluate(p => { AlmFeaturesState.provenance = p; }, PROVENANCE);
  await openPanel(page);
  await page.getByRole('tab', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toContainText('Share link');
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  console.log('FEATURES SHARE link length ' + link.length);
  expect(link).toMatch(/\/proportion-ma\/index\.html#s=[A-Za-z0-9_-]+$/);
  await axe(page, 'share tab');

  const p2 = await fresh();
  await p2.goto(link);
  await expect(p2.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the share link.');
  expect(await p2.locator('#src').inputValue()).toBe('5, 40, Alpha 2019\n9, 60, Beta 2021\n14, 75, Gamma\n2, 30, Delta');
  expect(await p2.locator('#trans').inputValue()).toBe('ft');
  expect(await p2.locator('#tau-est').inputValue()).toBe('DL');
  expect(await p2.locator('#res-body .pooled-row').innerText()).toBe(pooled);
  expect(await p2.locator('#het').innerText()).toBe(het);
  expect(await p2.evaluate(() => AlmFeaturesState.provenance)).toEqual(PROVENANCE);
  expect(await p2.evaluate(() => location.hash)).toBe('#s=' + link.split('#s=')[1]);
  await expect(p2.getByRole('tab', { name: 'Share', exact: true })).toHaveAttribute('aria-selected', 'true');

  // PLANTED DEFECTS: truncated link and a link for another app -> message, nothing changed.
  const packed = link.split('#s=')[1];
  const p3 = await fresh();
  await p3.goto(link.split('#')[0] + '#s=' + packed.slice(0, -10));
  await expect(p3.locator('[data-testid=share-status]')).toContainText('could not be opened');
  await expect(p3.locator('[data-testid=share-status]')).toContainText('Nothing was changed.');
  expect(await p3.locator('#src').inputValue()).toBe(defaultSrc);
  expect(await p3.evaluate(() => AlmFeaturesState.provenance)).toEqual([]);
  const foreign = await page.evaluate(async () => AlmShare.encode('dta-sroc', { src: 'x' }, []));
  const p4 = await fresh();
  await p4.goto(link.split('#')[0] + '#s=' + foreign);
  await expect(p4.locator('[data-testid=share-status]')).toContainText('for app "dta-sroc", not "proportion-ma"');
  expect(await p4.locator('#src').inputValue()).toBe(defaultSrc);
  // Existing url-state hashes are not touched by the share module.
  const p5 = await fresh();
  await p5.goto(new URL(PAGE, baseURL).href);
  expect(await p5.locator('[data-testid=share-status]').textContent()).toBe('');
  // Without ?almtest=1 the Verify in R test hook is inert.
  expect(await p5.evaluate(() => { window.__almVerifyPerturb = { key: 'tau2', delta: 1 }; return AlmVerifyR.testHookActive(); })).toBe(false);
  expect(errors).toEqual([]);
});

// ---- FU1: results go STALE when the analysis changes after a run --------------------------------------
const STALE_TEXT = 'These results are for an earlier version of the analysis. Run Verify in R again.';
async function verifyOnce(page) {
  await page.goto(PAGE_TEST);
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  await openPanel(page);
  await page.getByRole('tab', { name: 'Verify in R', exact: true }).click();
  const panel = page.locator('#alm-f-panel-verify');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  await expect(panel.locator('[data-testid=verify-summary]')).toHaveText(PASS_RE, { timeout: 600_000 });
  return panel;
}
// The three stale signals the gate checks after one data value is changed.
async function staleSignals(page, panel) {
  await page.waitForTimeout(800); // > the 250 ms debounce
  const banner = await panel.locator('[data-testid=verify-stale]').isVisible();
  const verifiedCurrent = await page.evaluate(() => AlmFeatures.verifiedCurrent('proportion-ma'));
  const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: /^Download everything \(ZIP\)/ }).click()]);
  const receipt = JSON.parse(new TextDecoder().decode(readZip(readFileSync(await dl.path())).find(e => e.name === 'truthcert.json').bytes));
  return { banner, verifiedCurrent, receiptStale: receipt.extra.results.stale, results: receipt.extra.results };
}
const changeOneValue = page => page.locator('#src').fill(DEFAULT_FIRST_LINE_CHANGED);
const DEFAULT_FIRST_LINE_CHANGED = '13, 150, Study A\n8, 90, Study B\n20, 220, Study C\n5, 60, Study D\n15, 180, Study E\n3, 40, Study F\n25, 300, Study G';

test('STALE: changing the analysis after Verify in R marks results stale (banner, labels, receipt, verifiedCurrent)', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const panel = await verifyOnce(page);
  const original = await page.locator('#src').inputValue();
  expect(original.split('\n')[0]).toBe('12, 150, Study A');
  const verified = await page.evaluate(() => AlmFeaturesState.verify);
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('proportion-ma'))).toBe(true);
  await expect(panel.locator('[data-testid=verify-stale]')).toBeHidden();

  await changeOneValue(page);                                   // one data value: 12 -> 13 events
  const s = await staleSignals(page, panel);
  console.log('FEATURES STALE ' + JSON.stringify({ banner: s.banner, verifiedCurrent: s.verifiedCurrent, receiptStale: s.receiptStale }));
  expect(s).toMatchObject({ banner: true, verifiedCurrent: false, receiptStale: true });
  await expect(panel.locator('[data-testid=verify-stale]')).toHaveText(STALE_TEXT);
  await expect(panel.locator('[data-testid=verify-summary]')).toHaveText(/^STALE \(earlier version of the analysis\): \d+ of \d+ computed quantities match R; 0 not computed/);
  await expect(panel.locator('table caption')).toContainText('STALE');
  await expect(panel.getByRole('button', { name: 'Comparison (.csv) (stale)', exact: true })).toBeVisible();
  expect(await page.evaluate(() => AlmFeaturesState.verify.stale)).toBe(true);
  expect(s.results.verifiedRevision).toBe(verified.revision);
  expect(s.results.currentRevision).toBeNull();                 // inputs edited: never re-run the app to hash them
  expect(s.results.currentInputsHash).not.toBe(s.results.verifiedInputsHash);
  expect(s.results.verifiedInputsHash).toBe(verified.inputsHash);

  // Revert the value -> current again (banner gone, verifiedCurrent true, receipt not stale).
  await page.locator('#src').fill(original);
  const back = await staleSignals(page, panel);
  expect(back).toMatchObject({ banner: false, verifiedCurrent: true, receiptStale: false });
  expect(back.results.currentRevision).toBe(verified.revision);

  // A programmatic change (no input event) is caught when the tab is shown again.
  await page.evaluate(() => { document.getElementById('trans').value = 'ft'; });
  await page.getByRole('tab', { name: 'Share', exact: true }).click();
  await page.getByRole('tab', { name: 'Verify in R', exact: true }).click();
  await expect(panel.locator('[data-testid=verify-stale]')).toBeVisible();
  expect(await page.evaluate(() => AlmFeatures.verifiedCurrent('proportion-ma'))).toBe(false);
  expect(errors).toEqual([]);
});

test('STALE PLANTED DEFECT: with the stale check disabled the stale gate fails', async ({ page }) => {
  test.setTimeout(900_000);
  // Serve alm-verify-r.js with markStale() forced to "not stale" -- the defect the gate must catch.
  await page.route('**/shared/alm-verify-r.js', async route => {
    const body = await (await route.fetch()).text();
    const marker = '    function markStale(stale) {';
    expect(body.includes(marker), 'planting marker present').toBe(true);
    await route.fulfill({ contentType: 'application/javascript', body: body.replace(marker, marker + ' stale = false;') });
  });
  const panel = await verifyOnce(page);
  await changeOneValue(page);
  const s = await staleSignals(page, panel);
  console.log('FEATURES STALE PLANTED ' + JSON.stringify({ banner: s.banner, verifiedCurrent: s.verifiedCurrent, receiptStale: s.receiptStale }));
  const gatePasses = s.banner === true && s.verifiedCurrent === false && s.receiptStale === true;
  expect(gatePasses, 'the stale gate must FAIL when the stale check is disabled').toBe(false);
  expect(s.banner).toBe(false); expect(s.receiptStale).toBe(false);
});

// ---- FU10: quantities not applicable for the data (prediction interval at k = 2) ----------------------
test('k = 2: prediction-interval keys are "not applicable" (verify.optional), the run still PASSES', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(PAGE_TEST);
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  await page.locator('#src').fill('86, 125, Arm A 2016\n78, 133, Arm B 2016');
  await page.locator('#btn-run').click();
  await expect(page.locator('#res-body')).toContainText('Arm B 2016');
  await openPanel(page);
  await page.getByRole('tab', { name: 'Verify in R', exact: true }).click();
  const panel = page.locator('#alm-f-panel-verify');
  await panel.getByRole('button', { name: 'Verify this analysis in R', exact: true }).click();
  const summary = panel.locator('[data-testid=verify-summary]');
  await expect(summary).toHaveText(/ — (PASS|FAIL)/, { timeout: 600_000 });
  console.log('FEATURES K2 ' + await summary.textContent());
  await expect(summary).toHaveText(/^(\d+) of \1 computed quantities match R; 0 not computed; 4 not applicable — PASS$/);
  const na = await panel.locator('td[data-result=notapplicable]').evaluateAll(tds => tds.map(td => td.closest('tr').dataset.key).sort());
  expect(na).toEqual(['piHi', 'piLo', 'poolPiHi', 'poolPiLo']);
  await expect(panel.locator('td[data-result=notapplicable]').first()).toHaveText('NOT APPLICABLE for this analysis');
  const v = await page.evaluate(() => AlmFeaturesState.verify);
  expect([v.passed, v.nNotComputed, v.nNotApplicable, v.testHook]).toEqual([true, 0, 4, false]);
  expect(v.n).toBe(v.nPassed);
  expect(v.rows.filter(r => r.status === 'pass').map(r => r.key)).not.toContain('piLo');
  expect(errors).toEqual([]);
});

test('EXPORT: after a refused run every results export downloads an empty result without a page error', async ({ page }) => {
  // Data the app refuses (one malformed row, below the minimum study count) leaves it holding no result. Every export
  // button must still answer (empty result / "No results yet"), never throw an uncaught TypeError on the null result,
  // never export a stale one.
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.stack || e)));
  await page.goto('/proportion-ma/index.html');
  await page.waitForFunction(() => typeof window._almLastPropMA === 'function' && window._almLastPropMA() !== null);
  await page.locator('#src').fill('abc, xyz');
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window._almLastPropMA())).toBeNull();
  const expected = {
    json: t => expect(JSON.parse(t)).toEqual({}),
    csv: t => expect(t).toBe('key,value'),
    md: t => expect(t.split('\n').length).toBe(2),
    'report-md': t => expect(t).toContain('No results yet'),
    'report-txt': t => expect(t).toContain('No results yet')
  };
  for (const [action, check] of Object.entries(expected)) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.locator('#alm-export-mount [data-action="' + action + '"]').click()
    ]);
    check(readFileSync(await download.path(), 'utf8'));
  }
  expect(errors).toEqual([]);
});
