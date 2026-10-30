// Lane A6: add-on panels piloted in influence/. Run with addons-a6.playwright.config.mjs (port 8162).
import {test, expect} from '@playwright/test';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const receipt = JSON.parse(readFileSync(new URL('./fixtures/r-export/influence.receipt.json', import.meta.url), 'utf8'));
const ENGINE_PRESENT = existsSync(ROOT + 'shared/sensitivity-v1.js') && existsSync(ROOT + 'shared/sensitivity-v1.manifest.json');
const bodySha = text => { const m = '# ---- end of header ----\n', i = text.indexOf(m); return createHash('sha256').update(text.slice(i + m.length).replace(/\r\n/g, '\n'), 'utf8').digest('hex'); };
const BENIGN = /frame-ancestors|ERR_CONNECTION|favicon/;

async function open(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/influence/index.html');
  await page.waitForFunction(() => !!window.__almInfluenceAddons);
  return errors;
}
async function downloadScript(page) {
  await page.locator('#alm-addon-influence-r-script > summary').click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-addon-influence-r-download').click()]);
  return {name: d.suggestedFilename(), text: readFileSync(await d.path(), 'utf8')};
}

test('panels sit in one aside straight after main, closed, with nothing rendered until opened', async ({page}) => {
  const errors = await open(page);
  await expect(page.locator('body > main + aside#alm-addons[data-alm-addon]')).toHaveCount(1);
  const ids = await page.locator('#alm-addons > details').evaluateAll(d => d.map(x => x.id + ':' + x.open + ':' + x.lastElementChild.childElementCount));
  expect(ids).toEqual(['alm-addon-influence-sensitivity:false:0', 'alm-addon-influence-methods:false:0',
    'alm-addon-influence-interpretation:false:0', 'alm-addon-influence-r-script:false:0']);
  await expect(page.locator('main #alm-addons, main [data-alm-addon]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('R script: downloaded body matches the committed receipt; changed data changes it', async ({page}) => {
  expect(receipt.pass).toBe(true); expect(receipt.negativeControl).toBe('FAIL');
  expect(receipt.passed).toBe(receipt.quantities); expect(receipt.pkgs.metafor).toBe('5.2.1'); expect(receipt.R).toBe('4.6.0');
  await open(page);
  const {name, text} = await downloadScript(page);
  expect(name).toBe('allmeta-influence-reproduce.R');
  expect(bodySha(text)).toBe(receipt.scriptSha256);
  for (const line of ['# App: influence', '# Validated in the paper with: metafor 5.2-1', '# In-browser webR check uses: webR 0.5.5; metafor 4.8-0'])
    expect(text).toContain(line + '\n');
  expect(text).toMatch(/^# Generated \(UTC\): \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/m);
  expect(text).toContain("res <- metafor::rma(yi,vi,method='REML'");
  expect(await page.locator('#alm-addon-influence-r-script [role=status]').textContent()).toBe('R script downloaded.');
  // Negative: different data -> different body.
  await page.locator('#src').fill('0.1, 0.1, A\n0.2, 0.1, B\n0.3, 0.2, C\n0.5, 0.1, D');
  await page.locator('#btn-run').click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#alm-addon-influence-r-download').click()]);
  expect(bodySha(readFileSync(await d.path(), 'utf8'))).not.toBe(receipt.scriptSha256);
});

test('R script refuses when the page has too few studies, and says why', async ({page}) => {
  await open(page);
  await page.locator('#src').fill('0.1, 0.1, A\n0.2, 0.1, B');
  await page.locator('#alm-addon-influence-r-script > summary').click();
  await page.locator('#alm-addon-influence-r-download').click();
  await expect(page.locator('#alm-addon-influence-r-script [role=status]')).toHaveText('R script not created: Need at least three valid effect rows; invalid lines are refused');
});

test('methods and interpretation panels say plainly that their module is absent', async ({page}) => {
  await open(page);
  await page.locator('#alm-addon-influence-methods > summary').click();
  await expect(page.locator('#alm-addon-influence-methods')).toContainText('Methods text is not available on this page yet.');
  await page.locator('#alm-addon-influence-interpretation > summary').click();
  await expect(page.locator('#alm-addon-influence-interpretation')).toContainText('The interpretation draft is not available on this page yet.');
});

test('panels do not open while validation runs', async ({page}) => {
  await open(page);
  const opened = await page.evaluate(() => {
    const original = AlmValidate.isRunning; AlmValidate.isRunning = () => true;
    const d = document.getElementById('alm-addon-influence-r-script'); d.open = true;
    return new Promise(r => setTimeout(() => { const state = d.open + ':' + d.lastElementChild.childElementCount; AlmValidate.isRunning = original; r(state); }, 50));
  });
  expect(opened).toBe('false:0');
});

// Real engine (lane A5) only once shared/sensitivity-v1.js and its manifest are in this tree.
test('sensitivity panel without the A5 module says it is unavailable and shows no numbers', async ({page}) => {
  test.skip(ENGINE_PRESENT, 'sensitivity-v1 module present: covered by the next test');
  await open(page);
  await page.locator('#alm-addon-influence-sensitivity > summary').click();
  await expect(page.locator('#alm-addon-influence-sensitivity [role=status]')).toHaveText('Sensitivity analysis is unavailable: the sensitivity module is not installed.');
  await expect(page.locator('#alm-addon-influence-sensitivity table')).toHaveCount(0);
});

test('sensitivity panel with the A5 module: guard passes, only listed combinations, LOO on demand', async ({page}) => {
  test.skip(!ENGINE_PRESENT, 'shared/sensitivity-v1.js is not in this tree (lane A5 not merged)');
  await open(page);
  await page.locator('#alm-addon-influence-sensitivity > summary').click();
  const status = page.locator('#alm-addon-influence-sensitivity [role=status]');
  await expect(status).toHaveText(/validated combinations shown\.$/);
  const expected = await page.evaluate(async () => {
    const m = await (await fetch('/shared/sensitivity-v1.manifest.json')).json();
    return AlmSensitivity.listed(m, 'GEN').length;
  });
  await expect(page.locator('#alm-addon-influence-sensitivity table >> nth=0 >> tbody tr')).toHaveCount(expected);
  const mine = page.locator('#alm-addon-influence-sensitivity tbody tr', {hasText: 'REML (this page)'}).filter({hasText: 'Wald (z)'});
  await expect(mine).toHaveCount(1);
  const shown = await page.evaluate(() => window._almLastInfluence().mu.toFixed(3));
  await expect(mine.locator('td').nth(4)).toHaveText(shown);
  await page.locator('#alm-addon-influence-sens-loo').click();
  await expect(page.locator('#alm-addon-influence-sensitivity table >> nth=1 >> tbody tr')).toHaveCount(10);
});

test('sensitivity guard refuses when the engine does not reproduce the page (no numbers shown)', async ({page}) => {
  await open(page);
  const text = await page.evaluate(async () => {
    const div = document.createElement('div'); document.body.append(div);
    const engine = {
      fit: () => ({refused: false, mu: 1, se: 1, tau2: 0, k: 10}),
      baseRowGuard: (row, pageVals) => ({pass: Math.abs(row.mu - pageVals.mu) <= 1e-9, diffs: [{key: 'mu', module: row.mu, page: pageVals.mu}]}),
      listed: () => [{method: 'REML', test: 'z'}], leaveOneOut: () => ({refused: true, rows: []})
    };
    const d = window.__almInfluenceAddons.descriptor;
    await alm.sensitivityPanel.render(div, Object.assign({app: 'influence', engine, manifest: {}}, d.sensitivity));
    return {status: div.querySelector('[role=status]').textContent, tables: div.querySelectorAll('table').length};
  });
  expect(text.tables).toBe(0);
  expect(text.status).toMatch(/^Refused: the sensitivity module does not reproduce this page’s own result \(mu: module 1, page 0\.3\d+\)\. No alternative results are shown\.$/);
});
