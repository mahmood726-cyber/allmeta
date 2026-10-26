import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('../tooltips.js', import.meta.url), 'utf8');
const glossary = JSON.parse(readFileSync(new URL('../glossary.json', import.meta.url), 'utf8'));
const apps = 'proportion-ma dta-sroc nma heterogeneity pubbias-tests multilevel-ma meta-regression mh-peto influence limit-ma gosh cumulative-subgroup rve-meta nma-inconsistency correlation-ma multivariate-ma component-nma dose-response-ma'.split(' ');

async function fixture(page, code = source) {
  await page.goto('/');
  await page.setContent(`<html lang="en"><head><title>Scope contract</title></head><body>
    <main id="contract"><h1>Analysis</h1><label>REML<select><option>REML</option></select></label>
      <div id="stats-wrap">Moses SROC unavailable</div><table><tbody><tr><td>REML</td></tr></tbody></table>
      <code>REML</code><svg width="400" height="200"><text>Moses SROC unavailable</text></svg>
    </main>
    <p id="description">Existing explanation</p><abbr id="legacy" data-gloss="tau2" aria-describedby="description">τ²_within</abbr>
    <section id="help" data-gloss-scope aria-label="Method help"><h2>REML SROC</h2>
      <label>Estimator<select><option>REML</option><option>Maximum likelihood (ML)</option></select></label>
      <pre>REML</pre><code>REML</code><span aria-hidden="true">REML</span>
    </section></body></html>`);
  const before = await page.locator('#contract').evaluate(el => el.outerHTML);
  const plot = await page.locator('svg').boundingBox();
  await page.addScriptTag({ content: code });
  await page.evaluate(glossary => window.alm.tooltips({ glossary, terms: {
    REML: 'REML', SROC: 'SROC', ML: 'ML', 'Maximum likelihood': 'ML', 'τ²_within': 'WithinVariance'
  } }), glossary);
  return { before, plot };
}

test('scope boundary: results, SVG export text, controls and plot geometry stay intact; help still works', async ({ page }) => {
  const { before, plot } = await fixture(page);
  expect(await page.locator('#contract').evaluate(el => el.outerHTML)).toBe(before);
  expect(await page.locator('svg').boundingBox()).toEqual(plot);
  await expect(page.locator('#help h2 [data-gloss]')).toHaveCount(2);
  await expect(page.locator('#help code')).toHaveAttribute('data-gloss', 'REML');
  await expect(page.locator('#help pre [data-gloss], #help [aria-hidden] [data-gloss]')).toHaveCount(0);
  await expect(page.locator('#help [data-alm-choice] [data-gloss="REML"]')).toHaveCount(1);
  await page.locator('#help select').selectOption({ label: 'Maximum likelihood (ML)' });
  await expect(page.locator('#help [data-alm-choice]')).toHaveText('Method help: Maximum likelihood (ML)');
  await expect(page.locator('#help [data-alm-choice] [data-gloss]')).toHaveCount(1);
  await page.locator('#help h2 [data-gloss]').first().focus();
  await expect(page.locator('.alm-tooltip.is-visible')).toContainText(glossary.REML.short);
  await page.keyboard.press('Escape');
  await expect(page.locator('.alm-tooltip.is-visible')).toHaveCount(0);
});

test('authored keys and descriptions remain authoritative outside opt-in help', async ({ page }) => {
  await fixture(page);
  const legacy = page.locator('#legacy');
  await expect(legacy).toHaveAttribute('data-gloss', 'tau2');
  await expect(legacy).toHaveAttribute('aria-describedby', /description alm-tip-/);
  await legacy.focus();
  await expect(page.locator('.alm-tooltip.is-visible')).toContainText(glossary.tau2.short);
});

test('dynamic opted-in help scans once, while later results and controls remain unchanged', async ({ page }) => {
  await fixture(page);
  const before = await page.locator('#contract').evaluate(el => {
    el.insertAdjacentHTML('beforeend', '<p>REML SROC</p><select><option>REML</option></select>');
    return el.outerHTML;
  });
  await page.locator('#help').evaluate(el => el.insertAdjacentHTML('beforeend', '<p id="dynamic-help">REML</p>'));
  await expect(page.locator('#dynamic-help [data-gloss]')).toHaveCount(1);
  await page.evaluate(() => { window.alm.tooltips.rescan(); window.alm.tooltips.rescan(); });
  expect(await page.locator('#contract').evaluate(el => el.outerHTML)).toBe(before);
  await expect(page.locator('#dynamic-help [data-gloss]')).toHaveCount(1);
  const id = await page.locator('#dynamic-help [data-gloss]').getAttribute('data-alm-tip');
  await page.locator('#dynamic-help').evaluate(el => el.remove());
  await expect(page.locator('#' + id)).toHaveCount(0);
});

// Mutate the actual implementation in memory, never a reference or app file.
for (const [name, from, to] of [
  ['text scope', "root.querySelectorAll('[data-gloss-scope]').forEach(markScope);", 'markScope(root);'],
  ['select scope', "[data-gloss-scope] select:not(.alm-lang-switch select)", 'select:not(.alm-lang-switch select)'],
  ['authored key', "key && el.closest('[data-gloss-scope]') && glossary[key]", 'key && glossary[key]'],
]) test(`scope guard control and planted defect: ${name}`, async ({ page }) => {
  expect(source.split(from)).toHaveLength(2);
  for (const planted of [false, true]) {
    const { before } = await fixture(page, planted ? source.replace(from, to) : source);
    const intact = name === 'authored key'
      ? await page.locator('#legacy').getAttribute('data-gloss') === 'tau2'
      : await page.locator('#contract').evaluate(el => el.outerHTML) === before;
    expect(intact).toBe(!planted);
  }
});

for (const app of apps) test(`${app}: glossary help beside features is keyboard accessible and isolated from results`, async ({ page }) => {
  await page.goto(`/${app}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-alm-glossary-ready]')).toHaveCount(1);
  const help = page.locator('#alm-glossary-help');
  await expect(help).toHaveCount(1);
  expect(await help.evaluate(el => el.previousElementSibling.id)).toBe('alm-features');
  expect(await help.evaluate(el => el.closest('main'))).toBeNull();
  await expect(page.locator('svg [data-gloss], main [data-alm-choice]')).toHaveCount(0);
  await help.locator('summary').click();
  const marks = help.locator('[data-gloss]');
  expect(await marks.count()).toBeGreaterThan(9);
  const missing = await marks.evaluateAll(els => els.filter(el => {
    const tip = document.getElementById(el.dataset.almTip);
    return el.tabIndex !== 0 || !tip || !el.getAttribute('aria-describedby').split(/\s+/).includes(tip.id);
  }).map(el => el.dataset.gloss));
  expect(missing).toEqual([]);
  await marks.first().focus();
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  await expect(marks.first()).toBeFocused();
  await expect(page.locator('.alm-tooltip.is-visible')).not.toHaveText('');
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const audit = await new AxeBuilder({ page }).include('#alm-glossary-help').analyze();
    expect(audit.violations.filter(v => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  }
});

test('scoped page glossary exports authoritative definitions and R expressions', async ({ page }, testInfo) => {
  await page.goto('/heterogeneity/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-alm-glossary-ready]')).toHaveCount(1);
  const rows = await page.evaluate(async keys => {
    await window.alm.tooltips.setLang('en');
    const scope = document.createElement('section'); scope.setAttribute('data-gloss-scope', '');
    for (const key of keys) {
      const mark = document.createElement('span'); mark.dataset.gloss = key; mark.textContent = key + ' definition';
      scope.append(mark);
    }
    document.getElementById('alm-glossary-help').after(scope); window.alm.tooltips.rescan();
    return Array.from(scope.children, el => {
      const tip = document.getElementById(el.dataset.almTip);
      return [el.dataset.gloss, tip.textContent, tip.dataset.rCheckExpression || '', tip.dataset.rCheckReference || ''];
    });
  }, Object.keys(glossary));
  expect(rows).toEqual(Object.entries(glossary).map(([key, entry]) => [key,
    entry.short + (entry.long ? ' — ' + entry.long : ''), entry.r_check?.expression || '', entry.r_check?.reference || '']));
  const csv = value => '"' + value.replaceAll('"', '""') + '"';
  writeFileSync(testInfo.outputPath('entries.csv'), 'key,text,expression,reference\n' + rows.map(row => row.map(csv).join(',')).join('\n') + '\n');
});
