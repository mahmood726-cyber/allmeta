import { test, expect } from '@playwright/test';

const CI = 'study\tes_id\tlower\tupper\nA\ta\t0.10\t0.50\nA\tb\t0.05\t0.45\nB\ta\t0.20\t0.60';
const SE = 'Study ID;Outcome;Effect size;Standard error\nA;a;0.3;0.1\nA;b;0.2;0.1\nB;a;0.4;0.2';
const VI = 'study\tes_id\tyi\tvi\nA\ta\t0.3\t0.01\nA\tb\t0.2\t0.01\nB\ta\t0.4\t0.04';
async function open(page) {
  await page.goto('/multilevel-ma/index.html');
  await page.waitForFunction(() => window.AlmMultilevelFeatures && window.__almReml());
  await page.evaluate(() => AlmFeatures.open('multilevel-ma', 'entry'));
}
async function preview(page, text = CI) {
  await page.locator('#ml-entry-paste').fill(text);
  await page.getByRole('button', { name: 'Preview and convert', exact: true }).click();
}
async function confirm(page) {
  const cards = page.locator('#alm-f-panel-entry fieldset');
  for (let i = 0; i < await cards.count(); i++) {
    const card = cards.nth(i);
    await card.getByLabel('Source author and year', { exact: false }).fill('Smith 2020');
    await card.getByLabel('Full reference').fill('Smith study report');
    await card.getByLabel('Source location').fill('Table 2');
    await card.getByLabel('Timepoint', { exact: false }).fill('Six months');
    await card.getByRole('checkbox').check();
  }
}

test('REVIEW P1 conversion provenance retains each field, output and replay arguments', async ({ page }) => {
  await open(page);
  const out = await page.evaluate(text => {
    const e = AlmMultilevelFeatures.entry, converted = e.convert(text);
    const sources = e.sourceRecords(text, converted);
    return { sources, replay: sources.map(s => AlmEntry.replay(s.conversions)) };
  }, CI);
  for (const [i, source] of out.sources.entries()) {
    expect(source.conversions.map(c => c.field)).toEqual(['yi', 'sei']);
    expect(source.conversions[0].output).toBe([.3, .25, .4][i]);
    expect(source.conversions[1].output).toBeCloseTo(.10204269138493081, 14);
    expect(out.replay[i].ok).toBe(true);
  }
});

for (const [kind, text] of [['CI', CI], ['variance', VI]]) {
  test(`REVIEW P1 PLANTED ${kind} output corruption blocks confirmation and exports`, async ({ page }) => {
    await open(page);
    await preview(page, text);
    await confirm(page);
    await expect(page.getByRole('button', { name: 'Use these rows', exact: true })).toBeEnabled();
    await page.evaluate(() => {
      const original = AlmEntry.provenance.create;
      AlmEntry.provenance.create = function (...args) {
        const source = original(...args);
        Object.defineProperty(source, 'conversions', {
          configurable: true, enumerable: true,
          get() { return this._conversions || []; },
          set(value) { this._conversions = value; if (value.length) value[0].output += .1; }
        });
        return source;
      };
    });
    await preview(page, text);
    await confirm(page);
    await expect(page.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Export source records CSV', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Export source records DOCX', exact: true })).toBeDisabled();
  });
}

for (const path of ['upload', 'reset', 'undo', 'share']) {
  test(`REVIEW P1 provenance stays attached after ${path}`, async ({ page }) => {
    await open(page);
    if (path === 'undo') await page.evaluate(() => alm.resetUndo.snapshot());
    await preview(page, SE); await confirm(page);
    await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
    expect(await page.evaluate(() => AlmMultilevelFeatures.text.results().entryRows)).toBe(3);
    await page.evaluate(path => {
      if (path === 'upload') __almLoad([{ study: 'C', effect: .6, SE: .2 }, { study: 'C', effect: .7, SE: .3 }, { study: 'D', effect: .8, SE: .2 }]);
      if (path === 'share') {
        const s = AlmMultilevelFeatures.share.get();
        AlmMultilevelFeatures.share.set({ ...s, src: s.src.replace('0.3', '0.8') });
      }
      if (path === 'reset' || path === 'undo') {
        // Clear passes {} to restore(), which currently leaves src unchanged.
        // Undo twice skips the Fit-button snapshot and restores the original input.
        if (path === 'reset') alm.resetUndo.clear();
        else { alm.resetUndo.undo(); alm.resetUndo.undo(); }
      }
    }, path);
    const result = await page.evaluate(() => {
      const r = AlmMultilevelFeatures.text.results();
      return { rows: r.entryRows, sources: AlmFeaturesState.provenance, log: AlmFeaturesState.entryLog,
        src: document.getElementById('src').value };
    });
    if (path === 'reset') {
      expect(result.rows).toBe(3);
      expect(result.sources.every(s => s.appliedInput === result.src)).toBe(true);
    }
    else { expect(result.rows).toBe(0); expect(result.sources).toEqual([]); expect(result.log).toEqual([]); }
  });
}

test('REVIEW P2 PLANTED missing displayed number fails the text audit', async ({ page }) => {
  await open(page);
  const audit = await page.evaluate(() => {
    const spec = AlmMultilevelFeatures.text, r = spec.results();
    document.querySelectorAll('#summary table')[1].rows[0].cells[1].textContent = '—';
    const ctx = { app: 'multilevel-ma', build: AlmBuildInfo, entryLog: [], verify: null };
    return AlmText.audit(AlmText.render(spec.templates, r, ctx), r, { ctx, dom: spec.dom() });
  });
  expect(audit.ok).toBe(false);
  expect(audit.failures.map(f => f.check)).toContain('dom:remlMu');
});

test('REVIEW P2 single-study degrees of freedom match the engine floor', async ({ page }) => {
  await open(page);
  const df = await page.evaluate(() => {
    AlmMultilevelFeatures.entry.apply([
      { study: 'A', es_id: 'a', yi: .3, vi: .01 },
      { study: 'A', es_id: 'b', yi: .2, vi: .01 },
      { study: 'A', es_id: 'c', yi: .4, vi: .04 }
    ]);
    return { J: _almLastMlma().J, df: AlmMultilevelFeatures.text.results().df };
  });
  expect(df).toEqual({ J: 1, df: 1 });
});

test('REVIEW P2 per-paste decimal comma setting preserves anchors and invalidates preview', async ({ page }) => {
  await open(page);
  await page.getByLabel('Decimal mark for this paste', { exact: true }).selectOption('comma');
  await preview(page, SE.replaceAll('0.', '0,'));
  await confirm(page);
  await expect(page.getByRole('button', { name: 'Use these rows', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Use these rows', exact: true }).click();
  expect(await page.evaluate(() => AlmFeaturesState.provenance.every(s => s.decimal === 'comma' && AlmEntry.provenance.validate(s).length === 0))).toBe(true);
  await page.getByLabel('Decimal mark for this paste', { exact: true }).selectOption('point');
  await expect(page.getByRole('button', { name: 'Use these rows', exact: true })).toBeDisabled();
});

test('REVIEW P2 row cards show and update the source sentence and format the preview', async ({ page }) => {
  await open(page); await preview(page);
  const card = page.locator('#alm-f-panel-entry fieldset').first();
  await expect(card).toContainText('We read:');
  await expect(card).toContainText('We converted:');
  await expect(card).toContainText('Effect = 0.300; variance = 0.0104; page SE = 0.102');
  await confirm(page);
  await expect(card).toContainText('From Smith 2020 (Table 2)');
});

test('REVIEW P2 usedAs describes supplied SE and provenance uses canonical fields', async ({ page }) => {
  await open(page);
  const source = await page.evaluate(text => {
    const e = AlmMultilevelFeatures.entry; return e.sourceRecords(text, e.convert(text))[0];
  }, SE);
  expect(source.usedAs).not.toContain('sqrt');
  expect(source.usedAs).toContain('supplied SE');
  expect(source.values.map(v => v.field)).toEqual(['yi', 'sei']);
});

test('REVIEW P2 disabled apply explains remaining confirmation requirements', async ({ page }) => {
  await open(page); await preview(page);
  const use = page.getByRole('button', { name: 'Use these rows', exact: true });
  await expect(use).toHaveAttribute('aria-describedby', 'ml-entry-status');
  await expect(page.locator('#ml-entry-status')).toContainText('0 of 3 rows confirmed');
  for (const field of ['label', 'reference', 'location', 'timepoint']) await expect(page.locator('#ml-entry-status')).toContainText(field);
  await confirm(page);
  await expect(page.locator('#ml-entry-status')).toContainText('3 of 3 rows confirmed');
  await expect(use).toBeEnabled();
});

test('REVIEW P2 extracted values expose their field names to keyboard users', async ({ page }) => {
  await open(page); await preview(page, SE);
  const mark = page.locator('#alm-f-panel-entry fieldset').first().locator('mark').first();
  await expect(mark).toHaveAttribute('tabindex', '0');
  await expect(mark).toHaveAttribute('aria-label', 'yi: 0.3');
  await expect(mark).toHaveAttribute('role', 'note');
});

test('REVIEW P2 duplicate effect-ID message names the actual field', async ({ page }) => {
  await open(page);
  const flags = await page.evaluate(() => AlmMultilevelFeatures.entry.convert('study\tes_id\toutcome\tyi\tvi\nA\ta\tx\t.3\t.01\nA\tb\ty\t.2\t.01\nB\ta\tz\t.4\t.04').flags);
  expect(flags.some(f => f.blocking && /one effect ID/.test(f.text))).toBe(true);
  expect(flags.some(f => /uncertainty column/.test(f.text))).toBe(false);
});

test('REVIEW P2 declared entry schema uses the supported generic contract', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => AlmMultilevelFeatures.entry.schema)).toBe('generic');
});
