/**
 * Regression for the 2026-05-31 nma-dose-response-app dark-theme contrast fix.
 *
 * The app is an intentional dark "Glass" theme, but the shared hub/app-style.css
 * (loaded after the app's <style>) imposes its OS-scheme palette by clobbering the
 * design tokens (--panel/--input-bg/--panel-raised=#fff under light, accent=teal
 * #6fa9a0 under dark, --ink/--muted), so its own rules painted mismatched surfaces —
 * 22 axe color-contrast nodes. Fixed by re-asserting the app's dark token values
 * (incl. --accent) on html:root so both stylesheets resolve dark, light panel
 * headings, and a dark-blue fill for the active tab/toggles.
 *
 * Asserted under BOTH OS colour-schemes (the fix is meant to be scheme-independent),
 * with the transient onboarding wizard overlay dismissed so the steady-state app is
 * what's graded (the wizard is removed by the app's own close handler).
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const scheme of ['light', 'dark']) {
  test.describe(`scheme=${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`nma-dose-response-app: zero colour-contrast violations (${scheme})`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto('/nma-dose-response-app/index.html', { waitUntil: 'load' });
      // Dismiss the transient onboarding wizard so the steady-state UI is graded.
      await page.evaluate(() => {
        document.querySelectorAll('.wizard-overlay, .tutorial-overlay').forEach(el => el.remove());
      });
      await page.waitForTimeout(900);
      const results = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
      const nodes = results.violations.filter(v => v.id === 'color-contrast').flatMap(v => v.nodes.map(n => {
        const d = (n.any || []).find(x => x.id === 'color-contrast')?.data || {};
        return `${d.contrastRatio} fg=${d.fgColor} bg=${d.bgColor} ${n.target}`;
      }));
      expect(nodes, 'colour-contrast failures:\n' + nodes.join('\n')).toEqual([]);
    });
  });
}
