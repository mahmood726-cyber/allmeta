// FU3: the feature panel shows all four tabs on a real app page (app 9, proportion-ma):
// Data entry (AlmEntryUI, provenance workflow) · Report text (AlmTextUI) · Verify in R · Share.
//   - tab order + roving tabindex; each tab mounts (Data entry / Report text lazily, on first show);
//   - axe: no serious/critical violations on the Data entry and Report text tabs (animations settled first);
//   - Data entry end to end: paste a tab-separated 3-row table, add each result, choose the arm, fill label /
//     reference / location / outcome / timepoint, confirm each row, Use these rows -> the app's #src is
//     updated, the app re-runs and AlmFeaturesState.provenance holds 3 confirmed records;
//   - PLANTED: with one row unconfirmed, Use these rows stays disabled.
// Run: npx playwright test -c playwright.features.config.mjs features-tabs
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGE = '/proportion-ma/index.html';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const TABS = ['Data entry', 'Report text', 'Verify in R', 'Share'];
const PASTE = 'Alpha 2019\t5/40\nBeta 2021\t9/60\nGamma 2020\t14/75';
const ROWS = [
  { label: 'Alpha 2019', e: 5, n: 40 },
  { label: 'Beta 2021', e: 9, n: 60 },
  { label: 'Gamma 2020', e: 14, n: 75 },
];

async function openPanel(page) {
  const toggle = page.locator('#alm-features .alm-f-toggle');
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}
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

test('app 9: four tabs in order, each mounts (entry/text lazily), keyboard roving, axe on Data entry + Report text', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE);
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  // Lazy: nothing is mounted before the panel is opened.
  expect(await page.locator('#alm-f-panel-entry .alm-entry').count()).toBe(0);
  expect(await page.locator('#alm-f-panel-text .alm-text-audit').count()).toBe(0);
  await openPanel(page);
  const names = await page.getByRole('tab').allTextContents();
  console.log('TABS ' + names.join(' · '));
  expect(names).toEqual(TABS);
  await expect(page.locator('#alm-features .alm-f-title')).toHaveText(TABS.join(' · '));

  // Data entry is first and selected by default; it mounted on first show.
  const entryTab = page.getByRole('tab', { name: 'Data entry', exact: true });
  await expect(entryTab).toHaveAttribute('aria-selected', 'true');
  await expect(entryTab).toHaveAttribute('tabindex', '0');
  const entryPanel = page.locator('#alm-f-panel-entry');
  await expect(entryPanel.locator('section.alm-entry-provenance')).toHaveCount(1);
  await expect(entryPanel.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
  expect(await page.locator('#alm-f-panel-text .alm-text-audit').count()).toBe(0); // text not mounted yet
  await axe(page, 'Data entry tab');

  // Keyboard: ArrowRight -> Report text (mounts on show), End -> Share, Home -> Data entry.
  await entryTab.focus(); await page.keyboard.press('ArrowRight');
  const textTab = page.getByRole('tab', { name: 'Report text', exact: true });
  await expect(textTab).toBeFocused(); await expect(textTab).toHaveAttribute('aria-selected', 'true');
  await expect(entryTab).toHaveAttribute('tabindex', '-1');
  const textPanel = page.locator('#alm-f-panel-text');
  await expect(textPanel.locator('[data-para="results"]')).not.toBeEmpty();
  await expect(textPanel.locator('.alm-text-audit')).toContainText('Number audit:');
  const results = (await textPanel.locator('[data-para="results"]').textContent()).trim();
  console.log('TABS report text results: ' + results.slice(0, 120));
  await axe(page, 'Report text tab');
  await page.keyboard.press('End'); await expect(page.getByRole('tab', { name: 'Share', exact: true })).toBeFocused();
  await expect(page.locator('#alm-f-panel-share').getByRole('button', { name: 'Copy share link', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft'); await expect(page.getByRole('tab', { name: 'Verify in R', exact: true })).toBeFocused();
  await expect(page.locator('#alm-f-panel-verify').getByRole('button', { name: 'Verify this analysis in R', exact: true })).toBeVisible();
  await page.keyboard.press('Home'); await expect(entryTab).toBeFocused();
  // Re-showing does not mount a second copy.
  await expect(entryPanel.locator('section.alm-entry-provenance')).toHaveCount(1);
  await textTab.click();
  await expect(textPanel.locator('.alm-text-audit')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('app 9 Data entry end to end: 3 confirmed rows -> app input + provenance; PLANTED unconfirmed row blocks', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE);
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  await openPanel(page);
  const panel = page.locator('#alm-f-panel-entry');
  await panel.getByLabel('Your initials (recorded with each confirmation)').fill('MA');
  await panel.getByLabel('Paste the exact paper text or table', { exact: true }).fill(PASTE);
  await panel.getByRole('button', { name: 'Extract candidates', exact: true }).click();
  const use = panel.getByRole('button', { name: 'Use these rows', exact: true });

  // Which extracted candidate (index, as listed in the chooser) carries each study's events/total.
  const cands = await page.evaluate(t => AlmEntry.extract(t, 'proportion', { decimal: 'point', outcome: '' }).candidates
    .map(c => c.kind === 'counts' ? c.values.arms.map(a => [a.events, a.n]) : []), PASTE);
  console.log('ENTRY candidates ' + JSON.stringify(cands));
  for (const [k, row] of ROWS.entries()) {
    const idx = cands.findIndex(arms => arms.some(([e, n]) => e === row.e && n === row.n));
    expect(idx, row.label).toBeGreaterThanOrEqual(0);
    await panel.getByLabel('Choose the source result to add').selectOption(String(idx));
    await panel.getByRole('button', { name: 'Add chosen result', exact: true }).click();
    const card = panel.locator('fieldset').filter({ has: page.locator('legend', { hasText: new RegExp(`^Study source ${k + 1}$`) }) });
    await expect(card).toHaveCount(1);
    const arm = card.getByLabel('Arm to use');
    const opts = await arm.locator('option').evaluateAll(os => os.map(o => ({ value: o.value, text: o.textContent })));
    const pick = opts.find(o => (o.text.endsWith(`: ${row.e} of ${row.n}`) || o.text.includes(`: ${row.e} of ${row.n} (`)));
    expect(pick, JSON.stringify(opts)).toBeDefined();
    await arm.selectOption(pick.value);
    // Current entry UI (entry5/entry6): role, denominator, timepoint, unit of randomisation, structured source.
    await card.getByLabel('This arm is').selectOption('intervention');
    await card.getByLabel(`Who is counted in ${row.n}?`).selectOption('ITT');
    await card.getByLabel('Study label (author and year, e.g. Smith 2019)').fill(row.label);
    await card.getByLabel('Full reference', { exact: true }).fill(`${row.label.split(' ')[0]} A et al. Trials ${row.label.split(' ')[1]};1:${k + 1}`);
    await card.getByLabel('Source type', { exact: true }).selectOption('Table');
    await card.getByLabel('Location: number or page (e.g. 2, p. 5 or Results paragraph)').fill('2');
    await card.getByLabel('Outcome measured').fill('response');
    await card.getByLabel('Timepoint', { exact: true }).selectOption('__other__');
    await card.getByLabel('Other timepoint (as written in the paper)').fill('12 weeks');
    await card.getByLabel('What was randomised?').selectOption('individuals');
    await expect(card.getByLabel('I confirm this row')).toBeEnabled();
  }
  // Confirm rows 1 and 2 only.
  for (const k of [1, 2]) {
    const card = panel.locator('fieldset').filter({ has: page.locator('legend', { hasText: new RegExp(`^Study source ${k}$`) }) });
    await card.getByLabel('I confirm this row').check();
  }
  // PLANTED: one row unconfirmed -> Use these rows stays disabled.
  await expect(use).toBeDisabled();
  console.log('ENTRY planted: 2 of 3 rows confirmed -> Use these rows disabled');
  const third = panel.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^Study source 3$/ }) });
  await third.getByLabel('I confirm this row').check();
  // One pasted table -> the single-group same-source guard asks for an explicit opt-in before use.
  await expect(use).toBeDisabled();
  await panel.getByLabel('I understand these rows are arms of one trial and want them pooled as separate single groups').check();
  await expect(use).toBeEnabled();
  await use.click();
  await expect(panel.getByRole('status').first()).toContainText('Applied 3 confirmed rows.');
  await expect(page.locator('#src')).toHaveValue(ROWS.map(r => `${r.e}, ${r.n}, ${r.label}`).join('\n'));
  await expect(page.locator('#res-body .pooled-row')).toHaveCount(1);
  const prov = await page.evaluate(() => AlmFeaturesState.provenance.map(p => ({ label: p.label, confirmed: p.confirmed, location: p.location,
    values: p.values.map(v => [v.field, v.value, v.text]) })));
  console.log('ENTRY provenance ' + JSON.stringify(prov));
  expect(prov).toHaveLength(3);
  expect(prov.map(p => p.label)).toEqual(ROWS.map(r => r.label));
  expect(prov.every(p => p.confirmed && p.location === 'Table 2')).toBe(true);
  expect(prov.map(p => p.values)).toEqual(ROWS.map(r => [['xi', r.e, String(r.e)], ['ni', r.n, String(r.n)]]));
  // The app's own studies are the three confirmed rows.
  const studies = await page.evaluate(() => window.__almPropValidation && __almPropValidation.snapshot ? __almPropValidation.snapshot().studies.map(s => [s.x, s.n]) : null);
  if (studies) expect(studies).toEqual(ROWS.map(r => [r.e, r.n]));
  console.log('ENTRY E2E 3/3 rows applied');
  expect(errors).toEqual([]);
});
