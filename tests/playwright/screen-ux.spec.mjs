// First-run and switching quick wins for Screen. Synthetic records only; not research evidence.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const APP = '/screen/index.html';
const ready = async page => { await page.goto(APP); await page.waitForFunction(() => !!window.__almScreenpro && !!window.ScreenUX); };
const decisions = page => page.evaluate(() => __almScreenpro.state().records.map(r => [r.title, r.r1.d]));

test('empty project shows a single first-run path with drop, choose-file and demo options', async ({ page }) => {
  await ready(page);
  const card = page.locator('#first-run');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Drop a RIS, PubMed (.nbib), CSV or JSON export');
  await expect(page.locator('#ux-strip')).toBeHidden();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#fr-choose').click();
  await chooser;
  await page.locator('#fr-demo').click();
  await expect(page.locator('#first-run')).toHaveCount(0);
  await expect(page.locator('#ux-strip')).toBeVisible();
  await expect(page.locator('#ux-gate')).toHaveText('Label 2 relevant and 2 irrelevant to start AI ranking: 0/2, 0/2.');
  await expect(page.locator('#ux-start-ai')).toBeDisabled();
});

test('gate hint counts up, one button starts the existing hybrid ranker, cadence setting untouched', async ({ page }) => {
  await ready(page);
  await page.locator('#fr-demo').click();
  await page.keyboard.press('i');
  await expect(page.locator('#ux-gate')).toContainText('1/2, 0/2');
  await page.keyboard.press('e');
  await expect(page.locator('#ux-progress')).toContainText('Irrelevant since last relevant 1');
  await page.keyboard.press('e');
  await expect(page.locator('#ux-progress')).toContainText('Screened 3 · Relevant found 1 · Irrelevant since last relevant 2');
  await expect(page.locator('#ux-gate')).toContainText('1/2, 2/2');
  await expect(page.locator('#ux-start-ai')).toBeDisabled();
  await expect(page.locator('#ux-auto-wrap')).toBeHidden();
  await page.keyboard.press('i');
  await expect(page.locator('#ux-progress')).toContainText('Irrelevant since last relevant 0');
  await expect(page.locator('#ux-start-ai')).toBeEnabled();
  await expect(page.locator('#ux-auto-wrap')).toBeVisible();
  expect(await page.evaluate(() => __almScreenpro.state().hybrid.auto)).toBe(false);
  await page.locator('#ux-start-ai').click();
  await expect(page.locator('#hy-status')).toContainText('Ranked', { timeout: 30000 });
  await expect(page.locator('#ux-gate')).toContainText('AI ranking is current');
  await expect(page.locator('#ux-start-ai')).toBeHidden();
  const s = await page.evaluate(() => __almScreenpro.state());
  expect(s.sort).toBe('hybrid');
  expect(s.filter).toBe('undecided');
  expect(s.hybrid.auto).toBe(false);
  expect(s.hybrid.run.labels.length).toBe(4);
  // The progress text carries no stopping or recall-guarantee language.
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const bad of ['safe to stop', 'you can stop', 'stop screening', 'recall guarantee']) expect(body).not.toContain(bad);
  await expect(page.locator('#ux-progress-note')).toContainText('do not estimate how many relevant records remain');
});

test('the mirror toggle drives the existing opt-in retraining checkbox', async ({ page }) => {
  await ready(page);
  await page.locator('#fr-demo').click();
  for (const k of ['i', 'e', 'e', 'i']) await page.keyboard.press(k);
  await page.locator('#ux-auto').check();
  await expect(page.locator('#hy-auto')).toBeChecked();
  expect(await page.evaluate(() => __almScreenpro.state().hybrid.auto)).toBe(true);
  await expect(page.locator('#hy-status')).toContainText('Ranked', { timeout: 30000 });
});

test('dropping a RIS file anywhere imports it and names the detected format', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['TY  - JOUR\nTI  - Synthetic dropped record one\nAB  - Invented text.\nER  - \nTY  - JOUR\nTI  - Synthetic dropped record two\nER  - \n'], 'drop.txt', { type: 'text/plain' }));
    document.body.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#workflow-status')).toContainText('Imported 2 record(s) (RIS detected)');
  await expect(page.locator('body')).not.toHaveClass(/drag-over/);
  expect((await decisions(page)).map(x => x[0])).toEqual(['Synthetic dropped record one', 'Synthetic dropped record two']);
});

test('ASReview-labelled CSV and RIS imports keep labels; ASReview CSV export round-trips', async ({ page }) => {
  await ready(page);
  const csv = 'title,abstract,doi,label_included\nSynthetic A,x,10.1/a,1\nSynthetic B,y,,0\nSynthetic C,z,,\n';
  await page.locator('#file-import').setInputFiles({ name: 'asreview.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.locator('#workflow-status')).toContainText('2 existing label(s) applied as R1 title/abstract decisions');
  expect(await decisions(page)).toEqual([['Synthetic A', 'include'], ['Synthetic B', 'exclude'], ['Synthetic C', '']]);
  const ev = await page.evaluate(() => __almScreenpro.state().audit.at(-1));
  expect(ev.action).toBe('import');
  expect(ev.after.importedLabels).toEqual({ count: 2, reviewer: 'r1', stage: 'ta' });
  // imported decisions carry no invented timestamps
  expect(await page.evaluate(() => __almScreenpro.state().records[0].r1.at)).toBe('');

  const ris = 'TY  - JOUR\nTI  - Synthetic D\nN1  - ASReview_relevant\nER  - \nTY  - JOUR\nTI  - Synthetic E\nN1  - ASReview_irrelevant\nER  - \nTY  - JOUR\nTI  - Synthetic F\nN1  - ASReview_not_seen\nER  - \n';
  await page.locator('#file-import').setInputFiles({ name: 'asreview.ris', mimeType: 'application/x-research-info-systems', buffer: Buffer.from(ris) });
  expect((await decisions(page)).slice(3)).toEqual([['Synthetic D', 'include'], ['Synthetic E', 'exclude'], ['Synthetic F', '']]);

  const download = page.waitForEvent('download');
  await page.locator('#btn-export-asreview').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('screen-asreview.csv');
  const text = fs.readFileSync(await file.path(), 'utf8');
  const lines = text.split('\n');
  expect(lines[0]).toBe('"title","abstract","authors","year","journal","doi","included"');
  expect(lines[1]).toBe('"Synthetic A","x","","","","10.1/a","1"');
  expect(lines.map(l => l.slice(l.lastIndexOf(',') + 1))).toEqual(['"included"', '"1"', '"0"', '""', '"1"', '"0"', '""']);

  // Re-import into a fresh project: the same labels come back.
  await page.evaluate(() => { localStorage.clear(); });
  await ready(page);
  await page.locator('#file-import').setInputFiles({ name: 'screen-asreview.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
  expect((await decisions(page)).map(x => x[1])).toEqual(['include', 'exclude', '', 'include', 'exclude', '']);
});

test('z and Ctrl+Z undo the last decision; the overlay lists them and the ASReview key difference', async ({ page }) => {
  await ready(page);
  await page.locator('#fr-demo').click();
  await page.keyboard.press('i');
  await page.keyboard.press('e');
  expect((await decisions(page)).slice(0, 2).map(x => x[1])).toEqual(['include', 'exclude']);
  await page.keyboard.press('z');
  expect((await decisions(page)).slice(0, 2).map(x => x[1])).toEqual(['include', '']);
  await expect(page.locator('#card-host .ctitle')).toHaveText('Synthetic demo: preserved ejection fraction trial');
  await page.keyboard.press('Control+z');
  expect((await decisions(page)).slice(0, 2).map(x => x[1])).toEqual(['', '']);
  // Ctrl-modified letters no longer trigger screening shortcuts.
  await page.keyboard.press('Control+e');
  expect((await decisions(page))[0][1]).toBe('');
  await page.keyboard.press('?');
  await expect(page.locator('#help-modal')).toContainText('Undo your last decision');
  await expect(page.locator('#help-modal')).toContainText('Coming from ASReview LAB?');
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-modal')).not.toHaveClass(/on/);
});
