import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MODULE_SRC = readFileSync(join(__dirname, '..', 'reset-undo.js'), 'utf-8');

const HARNESS = `
<!doctype html><html><body>
<div id="undo-mount"></div>
<script src="/hub/shared/reset-undo.js"></script>
<script>
  window._state = { items: [] };
  window.alm.resetUndo({
    target: '#undo-mount',
    snapshot: () => JSON.parse(JSON.stringify(window._state)),
    restore: (snap) => { window._state = snap; },
    capacity: 3,
  });
  window.bump = (label) => {
    window.alm.resetUndo.snapshot();
    window._state.items.push(label);
  };
</script>
</body></html>`;

test.describe('reset-undo', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/hub/shared/reset-undo.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: MODULE_SRC });
    });
  });

  test('undo restores prior snapshot', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window.bump === 'function');

    await page.evaluate(() => {
      window.bump('a');
      window.bump('b');
    });

    // After bump('b'), stack has snapshots: [{items:[]}, {items:['a']}]
    // Current state: {items: ['a', 'b']}
    await page.evaluate(() => window.alm.resetUndo.undo());
    let state = await page.evaluate(() => window._state);
    expect(state).toEqual({ items: ['a'] });

    await page.evaluate(() => window.alm.resetUndo.undo());
    state = await page.evaluate(() => window._state);
    expect(state).toEqual({ items: [] });
  });

  test('stack capacity drops oldest', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window.bump === 'function');

    // capacity=3; bump a/b/c/d
    // After bump('a'): stack=[{items:[]}], state={items:['a']}
    // After bump('b'): stack=[{items:[]},{items:['a']}], state={items:['a','b']}
    // After bump('c'): stack=[{items:[]},{items:['a']},{items:['a','b']}], state={items:['a','b','c']}
    // After bump('d'): stack full at 3; push {items:['a','b','c']}, shift {items:[]}
    //   stack=[{items:['a']},{items:['a','b']},{items:['a','b','c']}], state={items:['a','b','c','d']}
    // Undo 3 times -> restores {items:['a','b','c']}, {items:['a','b']}, {items:['a']}
    await page.evaluate(() => {
      window.bump('a');
      window.bump('b');
      window.bump('c');
      window.bump('d');
    });

    // Undo 3 times
    await page.evaluate(() => {
      window.alm.resetUndo.undo();
      window.alm.resetUndo.undo();
      window.alm.resetUndo.undo();
    });

    const state = await page.evaluate(() => window._state);
    expect(state).toEqual({ items: ['a'] });
  });

  test('undo button disabled when stack empty', async ({ page }) => {
    await page.goto('http://localhost:8088/');
    await page.setContent(HARNESS, { baseURL: 'http://localhost:8088/' });
    await page.waitForFunction(() => typeof window.bump === 'function');

    // Fresh init — stack empty — button must be disabled
    await expect(
      page.locator('#undo-mount button[data-action="undo"]')
    ).toBeDisabled();
  });
});
