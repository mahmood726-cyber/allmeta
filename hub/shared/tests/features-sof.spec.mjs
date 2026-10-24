import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readZip } from './zip-reader.mjs';

for (const app of ['heterogeneity', 'mh-peto', 'proportion-ma']) {
  test(`${app}: displayed effect, manual certainty persistence and complete downloads`, async ({ page }) => {
    await page.goto(`/${app}/index.html`);
    const panel = page.locator('#alm-sof');
    await expect(panel.getByRole('heading', { name: 'Summary of findings' })).toBeVisible();
    await expect(panel.locator('[data-sof="effect"]')).not.toHaveText('Unavailable');
    const expected = await page.evaluate(app => {
      if (app === 'heterogeneity') return [...document.querySelectorAll('.stat')].find(e => e.querySelector('.k')?.textContent.includes('modified HK')).querySelector('.v').textContent;
      if (app === 'mh-peto') { const c = document.querySelector('#pooled-body tr').cells; return c[1].textContent + ' ' + c[2].textContent; }
      const c = document.querySelector('#res-body tr.pooled-row').cells; return c[2].textContent + ' [' + c[3].textContent + ']';
    }, app);
    await expect(panel.locator('[data-sof="effect"]')).toHaveText(expected);
    // Run the same equality gate against a deliberately corrupted SoF value.
    const gate = actual => expect(actual).toBe(expected);
    gate(await panel.locator('[data-sof="effect"]').textContent());
    expect(() => gate('planted wrong effect: ' + expected)).toThrow();
    await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('');
    await panel.getByLabel('Outcome', { exact: true }).fill('Mortality at 12 months');
    await panel.getByLabel('Certainty of evidence').selectOption('Low');
    await panel.getByLabel('Imprecision downgrade reason').fill('Wide interval');
    await page.reload();
    await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('Low');
    await expect(panel.getByLabel('Imprecision downgrade reason')).toHaveValue('Wide interval');
    for (const kind of ['CSV', 'DOCX']) {
      const pending = page.waitForEvent('download');
      await panel.getByRole('button', { name: `Export ${kind}`, exact: true }).click();
      const download = await pending;
      const bytes = readFileSync(await download.path());
      const content = kind === 'CSV' ? bytes.toString('utf8') : new TextDecoder().decode(readZip(bytes).find(e => e.name === 'word/document.xml').bytes);
      expect(content).toContain('Mortality at 12 months'); expect(content).toContain('Low'); expect(content).toContain('Wide interval'); expect(content).toContain('Guyatt');
      expect(content).toContain(expected);
      if (kind === 'DOCX') expect(content).toContain('<w:tbl>');
    }
    await page.evaluate(() => { window.__sofCopied = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async s => { window.__sofCopied = s; } } }); });
    await panel.getByRole('button', { name: 'Copy table', exact: true }).click();
    expect(await page.evaluate(() => window.__sofCopied)).toContain('Wide interval');
    if (app === 'mh-peto') {
      await expect(panel.locator('[data-sof="risk-source"]')).toContainText('median control-arm risk');
      await panel.getByLabel('Assumed comparator risk (proportion)').fill('0');
      await expect(panel.locator('[data-sof="absolute-note"]')).toContainText('strictly between 0 and 1');
      await panel.getByLabel('Assumed comparator risk (proportion)').fill('0.2');
      await expect(panel.locator('[data-sof="comparator"]')).toContainText('200');
      await page.locator('#measure').selectOption('RR');
      await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('Low');
      const effect = await page.locator('#pooled-body tr').first().locator('td').nth(1).textContent();
      await expect(panel.locator('[data-sof="effect"]')).toContainText(effect);
    } else {
      await expect(panel.getByLabel('Assumed comparator risk (proportion)')).toBeHidden();
      await expect(panel.getByRole('columnheader', { name: 'Risk with comparator', exact: true })).toHaveCount(0);
      if (app === 'proportion-ma') await expect(panel.locator('[data-sof="single-group"]')).toContainText('per 1,000');
    }
  });
}
test('changed or invalid input cannot export stale findings', async ({ page }) => {
  await page.goto('/mh-peto/index.html');
  await expect(page.locator('#alm-sof [data-sof="effect"]')).not.toHaveText('Unavailable');
  await page.locator('#src').fill('bad data');
  await expect(page.locator('#alm-sof').getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  await page.locator('#btn-run').click();
  await expect(page.locator('#alm-sof [data-sof="effect"]')).toHaveText('Unavailable');
  await page.locator('#btn-example').click();
  await expect(page.locator('#alm-sof').getByRole('button', { name: 'Export CSV' })).toBeEnabled();
});

test('meta-regression uses the main app result at full precision and retains its display', async ({ page }) => {
  await page.goto('/meta-regression/index.html');
  const panel = page.locator('#alm-sof');
  await expect(panel.locator('[data-sof="effect"]')).not.toHaveText('Unavailable');
  const values = await page.evaluate(() => {
    const own = window.__almResults();
    const sof = window.AlmSoF.readResult('meta-regression');
    const display = [...document.querySelectorAll('.stat')].find(e => e.querySelector('.k')?.textContent.includes('intercept')).querySelector('.v').textContent;
    return { own: [own.intercept, own.intercept_ci_lb, own.intercept_ci_ub], sof: [sof.estimate, sof.lower, sof.upper], display };
  });
  expect(values.sof).toEqual(values.own);
  await expect(panel.locator('[data-sof="effect"]')).toHaveText(values.display);
  await panel.getByLabel('Certainty of evidence').selectOption('Moderate');
  // Isolate the near-zero boundary through the host's result accessor. The
  // table continues to use the host's displayed string; the hint needs precision.
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.stat')].find(e => e.querySelector('.k')?.textContent.includes('intercept'));
    card.querySelector('.v').textContent = '0.100 [0.000, 0.200]';
    const own = window.__almResults();
    window.__almResults = () => ({ ...own, intercept: .1001, intercept_ci_lb: .0004, intercept_ci_ub: .1998 });
  });
  await expect(panel.locator('[data-sof="effect"]')).toHaveText('0.100 [0.000, 0.200]');
  await expect(panel.locator('[data-sof="hint"]')).toHaveText('');
  // Planted loss of precision must change the hint; certainty stays user-owned.
  await page.evaluate(() => {
    const own = window.__almResults();
    window.__almResults = () => ({ ...own, intercept_ci_lb: 0 });
    document.querySelector('#sof-outcome').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(panel.locator('[data-sof="hint"]')).toContainText('CI includes no effect');
  await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('Moderate');
});

test('influence preserves full-model displayed precision when exclusions are selected', async ({ page }) => {
  await page.goto('/influence/index.html');
  const panel = page.locator('#alm-sof');
  await expect(panel.locator('[data-sof="effect"]')).not.toHaveText('Unavailable');
  const expected = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#model-body tr')];
    const cell = label => rows.find(r => r.cells[0].textContent === label).cells[1].textContent;
    return cell('Pooled estimate') + ' [' + cell('95% CI lower') + ', ' + cell('95% CI upper') + ']';
  });
  await expect(panel.locator('[data-sof="effect"]')).toHaveText(expected);
  await panel.getByLabel('Certainty of evidence').selectOption('Low');
  // Both the excluded-model and change columns use excl-col. Check the full
  // set and each header explicitly; visibility assertions require one element.
  const exclusionHeaders = page.locator('#model-summary thead th.excl-col');
  await expect(exclusionHeaders).toHaveCount(2);
  await expect(exclusionHeaders).toHaveText(['After exclusion', 'Change']);
  await expect(exclusionHeaders.nth(0)).toBeHidden();
  await expect(exclusionHeaders.nth(1)).toBeHidden();
  await page.locator('#body input[type="checkbox"]').first().check();
  await expect(exclusionHeaders).toHaveText(['Excluding 1 study', 'Change']);
  await expect(exclusionHeaders.nth(0)).toBeVisible();
  await expect(exclusionHeaders.nth(1)).toBeVisible();
  await expect(panel.locator('[data-sof="effect"]')).toHaveText(expected);
  await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('Low');
  const values = await page.evaluate(() => {
    const full = window._almLastInfluence(), sof = window.AlmSoF.readResult('influence');
    return { full: [full.mu, full.ciLo, full.ciHi], sof: [sof.estimate, sof.lower, sof.upper] };
  });
  expect(values.sof).toEqual(values.full);
  const gate = actual => expect(actual).toBe(expected);
  expect(() => gate('planted exclusion result')).toThrow();
  await page.locator('#body input[type="checkbox"]').first().uncheck();
  await expect(exclusionHeaders).toHaveText(['After exclusion', 'Change']);
  await expect(exclusionHeaders.nth(0)).toBeHidden();
  await expect(exclusionHeaders.nth(1)).toBeHidden();
  await expect(panel.locator('[data-sof="effect"]')).toHaveText(expected);
  await expect(panel.getByLabel('Certainty of evidence')).toHaveValue('Low');
});
