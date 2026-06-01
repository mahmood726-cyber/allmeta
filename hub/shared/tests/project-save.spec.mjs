/**
 * Round-trip verification for cross-app project save/restore (shared/project-save.js,
 * surfaced by the /project workspace app). There is no external reference here — the
 * contract is: snapshot() captures every localStorage entry, and restore() writes them
 * back byte-for-byte, so save→mutate→restore returns the workspace to its saved state.
 * Also asserts the schema guard rejects foreign JSON and that the install() widget mounts.
 */
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8088/project/index.html';
const BENIGN = /frame-ancestors|ERR_CONNECTION/;

test('project snapshot → mutate → restore is a faithful round-trip', async ({ page }) => {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !BENIGN.test(m.text())) errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AlmProject && typeof window.AlmProject.snapshot === 'function', { timeout: 10000 });

  const result = await page.evaluate(() => {
    const P = window.AlmProject;
    // Seed a representative workspace: the cross-app bus + a per-app autosave key.
    localStorage.setItem('ma-studies-v1', JSON.stringify([{ id: 1, te: 0.35, se: 0.1 }, { id: 2, te: -0.12, se: 0.2 }]));
    localStorage.setItem('alm-autosave-workbench', JSON.stringify({ model: 'REML', hksj: true }));
    localStorage.setItem('alm-theme', 'dark');

    const snap = P.snapshot();
    const hadBus = snap.entries['ma-studies-v1'];

    // Mutate the workspace: change one, delete one, add a stray.
    localStorage.setItem('ma-studies-v1', '[]');
    localStorage.removeItem('alm-autosave-workbench');
    localStorage.setItem('stray-key', 'should-survive-merge');

    const n = P.restore(snap);

    return {
      schema: snap._schema,
      count: snap.count,
      hadBus,
      restoredCount: n,
      busAfter: localStorage.getItem('ma-studies-v1'),
      autosaveAfter: localStorage.getItem('alm-autosave-workbench'),
      themeAfter: localStorage.getItem('alm-theme'),
      strayAfter: localStorage.getItem('stray-key'),
    };
  });

  expect(result.schema).toBe('allmeta-project-v1');
  expect(result.count).toBeGreaterThanOrEqual(3);
  // restore() rewrote every captured entry, including the ones we mutated/deleted.
  expect(result.busAfter).toBe(result.hadBus);
  expect(JSON.parse(result.busAfter)).toHaveLength(2);
  expect(JSON.parse(result.autosaveAfter)).toMatchObject({ model: 'REML', hksj: true });
  expect(result.themeAfter).toBe('dark');
  // Default restore is a merge: keys not present in the snapshot are left untouched.
  expect(result.strayAfter).toBe('should-survive-merge');
  expect(errs, 'no console errors').toEqual([]);
});

test('restore rejects a non-project JSON file', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AlmProject, { timeout: 10000 });
  const threw = await page.evaluate(() => {
    try { window.AlmProject.restore({ hello: 'world' }); return false; }
    catch (e) { return /allmeta project/.test(e.message); }
  });
  expect(threw).toBe(true);
});

test('install() mounts save + load controls', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('#proj-mount .alm-proj-save', { timeout: 10000 });
  await expect(page.locator('#proj-mount .alm-proj-save')).toBeVisible();
  await expect(page.locator('#proj-mount .alm-proj-load')).toBeVisible();
  await expect(page.locator('#proj-mount .alm-proj-load input[type=file]')).toHaveCount(1);
});
