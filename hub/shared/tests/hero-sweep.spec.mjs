// Report-only audit; do not repair other apps here. Seven expected failures have
// source-level proofs in SWEEP.md and executable proofs in hero-sweep.test.cjs.
import {test, expect} from '@playwright/test';
import sweep from './hero-sweep-contract.cjs';
const {cases, contract} = sweep;

for (const c of cases) test(`hero sweep: ${c.app}`, async ({page}) => {
  test.setTimeout(60_000);
  if (c.broken) test.fail(true, c.broken);
  const errors = [], dialogs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.goto(`/${c.app}/index.html`);
  const select = page.locator('#alm-hero-mount select[data-alm-hero]');
  await expect(select).toBeVisible();
  // Remove the initial example's output so a stale default plot cannot pass.
  await page.locator(c.result).evaluateAll(nodes => nodes.forEach(node => node.remove()));
  await select.selectOption({index:1});
  if (c.run) await page.locator('#btn-run').click();
  await expect.soft(page.locator(c.result).first(), 'fresh analysis output must render').toBeVisible();
  const messages = page.locator('[role="alert"], #warn-banner, #warn-slot, #warnings, #k-warn, #limit-error, #plot-error, #input-error');
  const visibleMessages = await messages.evaluateAll(nodes => nodes.filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden').map(n => n.textContent.trim()).filter(Boolean));
  expect.soft(visibleMessages, 'no visible error/alert messages').toEqual([]);
  expect.soft(dialogs, 'no browser alerts').toEqual([]);
  expect.soft(errors, 'no uncaught page errors').toEqual([]);
  const text = await page.locator('textarea#src, textarea#f-data').inputValue();
  const parsed = contract(c, text);
  // Rendering alone cannot detect SE-as-variance or silently dropped rows.
  expect.soft(parsed.actual, 'all canonical rows and uncertainty units must survive the real parser').toEqual(parsed.expected);
});
