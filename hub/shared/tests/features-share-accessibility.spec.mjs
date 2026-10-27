import { test, expect } from '@playwright/test';

test('Share archive action announces a new tab and retains the version-consent guard', async ({ page }) => {
  await page.goto('/proportion-ma/index.html');
  await page.waitForFunction(() => !!window.AlmFeatures?.get('proportion-ma')?.share);
  await page.evaluate(() => AlmFeatures.open('proportion-ma', 'share'));
  const archive = page.locator('[data-testid=share-version] a[target=_blank]');
  await expect(archive).toHaveAttribute('aria-label', 'Open the archived version (opens in new tab)');
  await expect(page.locator('[data-testid=share-version]')).toBeHidden();

  const { payload, before, href } = await page.evaluate(() => {
    const before = AlmFeatures.get('proportion-ma').share.get();
    const payload = AlmShare.payload('proportion-ma', { ...before, tau: 'DL' }, []);
    payload.build.sha = 'f'.repeat(40);
    return { payload, before, href: AlmShare.archiveURL(payload) };
  });
  await page.getByLabel('Open analysis file', { exact: true }).setInputFiles({
    name: 'different-version.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload))
  });
  await expect(page.locator('[data-testid=share-version]')).toBeVisible();
  await expect(archive).toHaveAccessibleName('Open the archived version (opens in new tab)');
  await expect(archive).toHaveText('Open the archived version');
  await expect(archive).toHaveAttribute('href', href);
  await expect(archive).toHaveAttribute('rel', 'noopener noreferrer');
  expect(await page.evaluate(() => AlmFeatures.get('proportion-ma').share.get())).toEqual(before);
  await page.getByRole('button', { name: 'Restore anyway', exact: true }).click();
  await expect(page.locator('[data-testid=share-status]')).toHaveText('Analysis restored from the analysis file.');
  expect(await page.evaluate(() => AlmFeatures.get('proportion-ma').share.get())).toEqual(payload.state);
});
