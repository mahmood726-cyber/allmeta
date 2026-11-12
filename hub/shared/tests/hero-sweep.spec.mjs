// Report-only audit; do not repair other apps here. Four expected failures (cases with `broken`) have
// source-level proofs in SWEEP.md and executable proofs in hero-sweep.test.cjs.
import {test, expect} from '@playwright/test';
import sweep from './hero-sweep-contract.cjs';
const {cases, contract} = sweep;

// Message regions pages use for errors, refusals and warnings. Everything visible in them fails the sweep
// EXCEPT content the page itself declares informational with role="note" (WAI-ARIA: ancillary content), e.g.
// a caution it always shows for small k. The page decides by its markup, not this spec by message text.
// Neither a class name (copas styles its refused-rows message and its k < 15 caution alike, class "note")
// nor role="status" (warn-banners carry "Analysis blocked: CSV rejected" there) exempts anything.
const MESSAGES = '[role="alert"], #warn-banner, #warn-slot, #warnings, #k-warn, #limit-error, #plot-error, #input-error';
function visibleMessages(page) {
  return page.locator(MESSAGES).evaluateAll(nodes => nodes
    .filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden')
    .filter(n => !n.closest('[role="note"]'))
    .map(n => {
      const copy = n.cloneNode(true);
      copy.querySelectorAll('[role="note"]').forEach(note => note.remove());
      return copy.textContent.trim();
    })
    .filter(Boolean));
}

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
  expect.soft(await visibleMessages(page), 'no visible error/alert messages').toEqual([]);
  expect.soft(dialogs, 'no browser alerts').toEqual([]);
  expect.soft(errors, 'no uncaught page errors').toEqual([]);
  const text = await page.locator('textarea#src, textarea#f-data').inputValue();
  const parsed = contract(c, text);
  // Rendering alone cannot detect SE-as-variance or silently dropped rows.
  expect.soft(parsed.actual, 'all canonical rows and uncertainty units must survive the real parser').toEqual(parsed.expected);
});

// Controls for the role="note" rule: a real refusal must still fail the sweep, and an exempt note must really
// be on screen (so "no messages" is not passing because nothing was shown).
test('hero sweep control: copas refused upload rows still fail, in the same #k-warn as the k < 15 note', async ({page}) => {
  await page.goto('/copas/index.html');
  await page.locator('#alm-hero-mount select[data-alm-hero]').selectOption({index:1});
  await page.locator('#btn-run').click();
  await expect(page.locator('#k-warn')).toContainText('k ≥ 15');
  await expect(page.locator('#k-warn')).toHaveAttribute('role', 'note');
  expect(await visibleMessages(page)).toEqual([]);
  // Planted refusal through the page's real CSV-load path: one malformed effect among valid rows.
  await page.evaluate(() => window.__almCopasLoad([
    {yi: '-0.9', sei: '0.3'}, {yi: '-1.6', sei: '0.4'}, {yi: '.4oops', sei: '0.5'}, {yi: '-0.2', sei: '0.2'}]));
  await expect(page.locator('#k-warn')).toContainText('were refused');
  const planted = await visibleMessages(page);
  expect(planted, 'a refusal must fail the sweep').toEqual([expect.stringContaining('1 uploaded row(s) were refused')]);
});

test('hero sweep control: pet-peese exempts role="note" content only, not class "note"', async ({page}) => {
  await page.goto('/pet-peese/index.html');
  await page.locator('#btn-run').click();
  await expect(page.locator('#warn-slot [role="note"]').first()).toContainText('Conditional estimator');
  expect(await visibleMessages(page)).toEqual([]);
  // Planted error in the same slot, styled like the notes (class "note") but not declared one.
  await page.locator('#warn-slot').evaluate(n => n.insertAdjacentHTML('beforeend',
    '<div class="note"><strong>Error:</strong> planted refusal.</div>'));
  expect(await visibleMessages(page)).toEqual([expect.stringContaining('planted refusal')]);
  // A note nested inside an alert exempts only itself, never the alert's own text.
  await page.locator('#warn-slot').evaluate(n => { n.innerHTML = '<div role="alert">planted alert <span role="note">aside</span></div>'; });
  const nested = await visibleMessages(page);
  expect(nested.length).toBeGreaterThan(0);
  for (const m of nested) { expect(m).toContain('planted alert'); expect(m).not.toContain('aside'); }
});
