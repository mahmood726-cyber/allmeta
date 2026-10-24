import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const apps = 'proportion-ma dta-sroc nma heterogeneity pubbias-tests multilevel-ma meta-regression mh-peto influence limit-ma gosh cumulative-subgroup rve-meta nma-inconsistency correlation-ma multivariate-ma component-nma dose-response-ma'.split(' ');
const glossary = JSON.parse(readFileSync(new URL('../glossary.json', import.meta.url), 'utf8'));

async function violations(page) {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.filter(v => ['serious', 'critical'].includes(v.impact));
}
async function ready(page, app) {
  await page.goto(`/${app}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-alm-glossary-ready]')).toHaveCount(1);
}
async function assertMarked(page) {
  const errors = await page.locator('[data-gloss]').evaluateAll(els => els.flatMap(el => {
    if (!el.getClientRects().length || el.closest('[hidden]')) return [];
    const tip = document.getElementById(el.dataset.almTip);
    return el.tabIndex < 0 || !tip || !el.getAttribute('aria-describedby')?.split(/\s+/).includes(tip.id)
      ? [el.outerHTML] : [];
  }));
  expect(errors).toEqual([]);
}
for (const app of apps) test(`${app}: marked terms, keyboard tooltips, light/dark axe`, async ({ page }) => {
  await ready(page, app);
  const marked = page.locator('[data-gloss]:visible');
  expect(await marked.count()).toBeGreaterThan(9);
  const keys = await page.locator('[data-gloss]').evaluateAll(els => els.map(el => el.dataset.gloss));
  expect(keys.filter(key => !Object.hasOwn(glossary, key))).toEqual([]);
  await assertMarked(page);
  if (app === 'multilevel-ma') {
    await expect(page.locator('[data-gloss="WithinVariance"]').first()).toContainText('within');
  }
  // Each visible mark must be reachable by a real Tab, not only element.focus().
  for (let i = 0; i < await marked.count(); i++) {
    const mark = marked.nth(i);
    await mark.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(mark).toBeFocused();
    const tip = page.locator('#' + await mark.getAttribute('data-alm-tip'));
    await expect(tip).toHaveClass(/is-visible/);
    await expect(tip).not.toHaveText('');
    await page.keyboard.press('Escape');
    await expect(tip).not.toHaveClass(/is-visible/);
  }
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await marked.first().focus();
    expect(await violations(page)).toEqual([]);
  }
});

test('dynamic results, boundaries, existing descriptions, cleanup, select choices and keyboard defect controls', async ({ page }) => {
  await ready(page, 'heterogeneity');
  await page.evaluate(() => {
    const fixture = document.createElement('section'); fixture.id = 'glossary-fixture';
    fixture.innerHTML = '<h2>REML Qtest I²</h2><p id="old-help">Existing help</p><span data-gloss="CI" aria-describedby="old-help">CI</span><pre>REML</pre><label>Estimator <select id="glossary-choice"><option>REML</option><option>Maximum likelihood (ML)</option></select></label><span data-gloss="tau2">τ²_within</span>';
    document.querySelector('main').append(fixture);
  });
  const fixture = page.locator('#glossary-fixture');
  await expect(fixture.locator('h2 [data-gloss]')).toHaveCount(2);
  await expect(fixture.locator('pre [data-gloss]')).toHaveCount(0);
  const ci = fixture.locator('[data-gloss="CI"]');
  await expect(ci).toHaveAttribute('aria-describedby', /old-help alm-tip-/);
  await page.evaluate(() => { window.alm.tooltips.rescan(); window.alm.tooltips.rescan(); });
  await expect(fixture.locator('h2 [data-gloss]')).toHaveCount(2);
  await page.locator('#glossary-choice').selectOption({ label: 'Maximum likelihood (ML)' });
  await expect(fixture.locator('[data-alm-choice] [data-gloss="ML"]')).toHaveCount(1);
  await assertMarked(page);
  await ci.evaluate(el => el.tabIndex = -1);
  await expect(assertMarked(page)).rejects.toThrow();
  await ci.evaluate(el => el.tabIndex = 0);
  await assertMarked(page);
  const tipId = await ci.getAttribute('data-alm-tip');
  await fixture.evaluate(el => el.remove());
  await expect(page.locator('#' + tipId)).toHaveCount(0);
});

test('translation fallback, literal text, touch toggle, outside dismissal and viewport placement', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await ready(page, 'rve-meta');
  const cr2 = page.locator('[data-gloss="CR2"]:visible').first();
  for (const lang of ['ar', 'es', 'zh']) {
    await page.evaluate(lang => window.alm.tooltips.setLang(lang), lang);
    const tip = page.locator('#' + await cr2.getAttribute('data-alm-tip'));
    await expect(tip).toContainText(glossary.CR2.long);
    await expect(tip).toHaveAttribute('lang', 'en');
  }
  await cr2.tap();
  const tip = page.locator('#' + await cr2.getAttribute('data-alm-tip'));
  await expect(tip).toHaveClass(/is-visible/);
  const box = await tip.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
  await cr2.tap(); await expect(tip).not.toHaveClass(/is-visible/);
  await cr2.tap(); await page.locator('h1').tap(); await expect(tip).not.toHaveClass(/is-visible/);
  await context.close();
});

// Controlled mutations of the shipped implementation: each detector must pass
// on the control and fail on its corresponding planted defect.
const tooltipSource = readFileSync(new URL('../tooltips.js', import.meta.url), 'utf8');

test('selected-option aliases share one tooltip per concept without losing text or other concepts', async ({ page }) => {
  await ready(page, 'heterogeneity');
  await page.locator('main').evaluate(el => el.insertAdjacentHTML('beforeend',
    '<label id="alias-fixture">Method<select><option>Maximum likelihood (ML); REML</option><option>ML (maximum likelihood)</option><option>No method</option></select></label>' +
    '<p id="alias-prose">Maximum likelihood (ML)</p>'));
  const help = page.locator('#alias-fixture [data-alm-choice]');
  await expect(help).toHaveText('Method help: Maximum likelihood (ML); REML');
  await expect(help.locator('[data-gloss="ML"]')).toHaveCount(1);
  await expect(help.locator('[data-gloss="REML"]')).toHaveCount(1);
  await expect(page.locator('#alias-prose [data-gloss="ML"]')).toHaveCount(2);
  await page.evaluate(() => { window.alm.tooltips.rescan(); window.alm.tooltips.rescan(); });
  await expect(help.locator('[data-gloss="ML"]')).toHaveCount(1);
  await page.locator('#alias-fixture select').selectOption({ label: 'ML (maximum likelihood)' });
  await expect(help).toHaveText('Method help: ML (maximum likelihood)');
  await expect(help.locator('[data-gloss]')).toHaveCount(1);
  await assertMarked(page);
  await page.locator('#alias-fixture select').selectOption({ label: 'No method' });
  await expect(help).toHaveCount(0);
});

// Exercise each color pair from the saved axe failures against the real page.
// Restoring the original foreground must produce a serious contrast violation.
const contrastRegressions = [
  ...['nma', 'meta-regression', 'limit-ma', 'rve-meta'].map(app =>
    [app, 'header code', 'header code { color: #31514b !important; }']),
  ['nma', 'table.league th', 'table.league th { color: #2f6b60 !important; }'],
  ['nma', 'table.league td.pos', 'table.league td.pos { color: #0d7a27 !important; }'],
  ['nma', 'table.league td.neg', 'table.league td.neg { color: #912121 !important; }'],
  ['nma-inconsistency', '.chip.cons', '.chip.cons { color: white !important; }'],
  ['dose-response-ma', 'button.primary', 'button.primary { color: white !important; }'],
];
for (const [app, selector, defect] of contrastRegressions) test(`${app}: dark contrast control and planted defect for ${selector}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await ready(page, app);
  await expect(page.locator(selector).first()).toBeVisible();
  const contrastFailures = async () => (await new AxeBuilder({ page }).include(selector).analyze()).violations
    .filter(v => v.id === 'color-contrast' && ['serious', 'critical'].includes(v.impact));
  expect(await contrastFailures()).toEqual([]);
  const planted = await page.addStyleTag({ content: defect });
  expect((await contrastFailures()).length).toBeGreaterThan(0);
  await planted.evaluate(el => el.remove());
  expect(await contrastFailures()).toEqual([]);
});

const defects = [
  ['selected option concept deduplication', 'if (choice && seen.has(key)) return false;', '', async page => {
    await page.locator('select').first().evaluate(el => {
      el.options[0].textContent = 'REML (Restricted maximum likelihood)';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.evaluate(() => window.alm.tooltips({ terms: { 'Restricted maximum likelihood': 'REML' } }));
    return await page.locator('[data-alm-choice] [data-gloss="REML"]').count() === 1;
  }],
  ['keyboard', 'el.tabIndex = 0;', 'el.tabIndex = -1;', async page => page.locator('#term').evaluate(el => el.tabIndex === 0)],
  ['description preservation', 'descriptions.add(tip.id);', 'descriptions.clear(); descriptions.add(tip.id);', async page => page.locator('#term').evaluate(el => el.getAttribute('aria-describedby').split(/\s+/).includes('existing'))],
  ['dynamic scan', 'new MutationObserver(schedule)', 'new MutationObserver(() => {})', async page => {
    await page.locator('main').evaluate(el => el.insertAdjacentHTML('beforeend', '<h2 id="dynamic">REML</h2>'));
    await page.waitForTimeout(100);
    return await page.locator('#dynamic [data-gloss]').count() === 1;
  }],
  ['idempotency', 'if (attached.has(el)) return;', 'if (false) return;', async page => {
    await page.evaluate(() => { window.alm.tooltips.rescan(); window.alm.tooltips.rescan(); });
    return await page.locator('[role="tooltip"]').count() === await page.locator('[data-gloss]').count();
  }],
  ['Escape dismissal', "if (e.key === 'Escape') hide();", "if (e.key === 'Never') hide();", async page => {
    await page.locator('#term').focus(); await page.keyboard.press('Escape');
    return await page.locator('.alm-tooltip.is-visible').count() === 0;
  }],
  ['selected option help', 'updateChoices(); mark(document.body);', 'mark(document.body);', async page => await page.locator('[data-alm-choice] [data-gloss]').count() === 1],
  ['orphan cleanup', 'tip.remove(); attached.delete(el);', 'attached.delete(el);', async page => {
    const id = await page.locator('#term').getAttribute('data-alm-tip');
    await page.locator('#term').evaluate(el => el.remove()); await page.waitForTimeout(100);
    return await page.locator('#' + id).count() === 0;
  }],
  ['literal text', "tip.textContent = entry ?", "tip.innerHTML = entry ?", async page => await page.locator('.alm-tooltip img').count() === 0],
  ['technical text exclusion', 'select,pre,kbd,samp,', 'select,kbd,samp,', async page => await page.locator('pre [data-gloss]').count() === 0],
  ['hidden accessibility content', '[aria-hidden="true"],', '', async page => await page.locator('[aria-hidden="true"] [data-gloss]').count() === 0],
];
for (const [name, from, to, check] of defects) test(`control and planted defect: ${name}`, async ({ page }) => {
  expect(tooltipSource.split(from)).toHaveLength(2);
  for (const broken of [false, true]) {
    await page.goto('/');
    await page.setContent('<html lang="en"><head><title>Glossary fixture</title></head><body><main><h1>Method help</h1><p id="existing">Existing description</p><span id="term" data-gloss="CI" aria-describedby="existing">CI</span><pre>REML</pre><span aria-hidden="true">REML</span><label>Method<select><option>REML</option></select></label></main></body></html>');
    await page.addScriptTag({ content: broken ? tooltipSource.replace(from, to) : tooltipSource });
    await page.evaluate(() => window.alm.tooltips({ glossary: { CI: { short: '<img src=x> literal definition' }, REML: { short: 'Restricted maximum likelihood' } }, terms: { REML: 'REML' } }));
    expect(await check(page), name).toBe(!broken);
  }
});
