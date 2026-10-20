// Request audit for multivariate-ma specs: every http(s) request must stay on the page origin.
// (validation-fixture.mjs reads #alm-validate at teardown; this page mounts #alm-plus-validate instead.)
import { test as base, expect } from '@playwright/test';
export const test = base.extend({
  originAudit: [async ({ context, page }, use) => {
    const requests = []; context.on('request', r => requests.push(r.url()));
    await use();
    const origin = page.isClosed() ? null : new URL(page.url()).origin;
    const outside = requests.filter(u => /^https?:/.test(u) && origin && new URL(u).origin !== origin);
    expect(outside, 'requests must stay on the page origin').toEqual([]);
  }, { auto: true }]
});
export { expect };
