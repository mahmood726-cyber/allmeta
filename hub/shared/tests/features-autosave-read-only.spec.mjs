// Reading an app's state must have no side effects: AlmAutosave (shared/autosave.js) saves a draft on every
// input/change event from the page's own fields, so a "read" that synthesises such an event makes a draft the
// user never made, and the next visit offers a spurious "Draft found. Restore?" banner.
// Seen on heterogeneity: validate/adapter.js liveState() (the live adapter's currentState) dispatched an input
// event on #f-data; the Verify-in-R panel calls currentState() on every render (alm-verify-r.js adapterCount),
// so a plain page load wrote a draft.
// For every app that installs AlmAutosave and exposes a live R adapter:
//   (a) LOAD — a plain page load (which renders the feature panels where present) writes no draft;
//   (b) READ — calling the live adapter's currentState() writes no draft;
//   (c) positive control — an edit of the app's own data field still writes a draft (the probe can see one).
// Run: npx playwright test -c playwright.features.config.mjs features-autosave-read-only
import { test, expect } from '@playwright/test';

// [app, its main data field]; inputs as shared/alm-examples.js specifications() names them.
const APPS = [
  ['heterogeneity', '#f-data'], ['gosh', '#src'], ['proportion-ma', '#src'], ['mh-peto', '#src'],
  ['multilevel-ma', '#src'], ['pubbias-tests', '#src'], ['dta-sroc', '#f-data'], ['meta-regression', '#f-data'],
  ['influence', '#src'], ['limit-ma', '#src'], ['cumulative-subgroup', '#f-data'], ['rve-meta', '#src'],
  ['nma-inconsistency', '#src'], ['component-nma', '#src'],
];
// Longer than any autosave debounce in use (shared/autosave.js default 600 ms).
const SETTLE = 1500;

for (const [app, input] of APPS) {
  test(app + ': reading state (page load, live currentState) writes no autosave draft', async ({ page }) => {
    const draft = () => page.evaluate(app => localStorage.getItem('alm-autosave:' + app), app);
    // Some apps (component-nma, meta-regression) hand their live adapter only to AlmExamples.register(app, {adapter});
    // keep a reference to it so the test can call the same currentState() the example capture and Verify panel use.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'AlmExamples', { configurable: true, get() { return undefined; }, set(api) {
        const register = api.register;
        api.register = function (app, extension) {
          if (extension && typeof extension.adapter === 'function') window.__almTestExampleAdapter = extension.adapter;
          return register.apply(this, arguments);
        };
        Object.defineProperty(window, 'AlmExamples', { configurable: true, writable: true, value: api });
      } });
    });
    await page.goto('/' + app + '/index.html');
    await page.waitForLoadState('load');
    expect(await page.evaluate(() => !!(window.AlmAutosave && typeof AlmAutosave.install === 'function')), 'AlmAutosave loaded').toBe(true);
    await page.waitForTimeout(SETTLE);
    expect(await draft(), 'a plain page load must not write a draft').toBeNull();

    const read = await page.evaluate(app => {
      const live = (window.AlmLiveAdapters && window.AlmLiveAdapters[app]) ||
        (window.AlmValidate && AlmValidate.adapters && AlmValidate.adapters[app] && AlmValidate.adapters[app].live) ||
        (window.__almTestExampleAdapter && window.__almTestExampleAdapter());
      if (!live || typeof live.currentState !== 'function') return { adapter: false };
      try { live.currentState(); return { adapter: true }; } catch (e) { return { adapter: true, error: String(e && e.message || e) }; }
    }, app);
    expect(read.adapter, 'app exposes a live adapter with currentState()').toBe(true);
    await page.waitForTimeout(SETTLE);
    expect(await draft(), 'currentState() must not write a draft' + (read.error ? ' (it threw: ' + read.error + ')' : '')).toBeNull();

    // Positive control: a real edit event on the data field is still saved.
    await page.evaluate(sel => document.querySelector(sel).dispatchEvent(new Event('input', { bubbles: true })), input);
    await expect.poll(draft, { timeout: 5000 }).not.toBeNull();
  });
}
