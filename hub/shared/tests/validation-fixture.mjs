import { test as base, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const evidence = new URL('../../../integration-evidence/', import.meta.url);
export const test = base.extend({
  requestAudit: [async ({ context, page }, use, info) => {
    const requests = [];
    context.on('request', request => requests.push(request.url()));
    await use();
    const panels=[];
    for(const page of context.pages()) {
      // Edge adds a blank (url "") page to the context after a blob download; it has no panel, and
      // waiting for #alm-validate there would hang the teardown until the test timeout.
      if(page.isClosed() || !/^https?:/.test(page.url()))continue;
      panels.push({url:page.url(),panel:await page.locator('#alm-validate').innerText().catch(()=>null)});
    }
    const outside = requests.filter(u=>/^https?:/.test(u) && new URL(u).origin !== new URL(page.url()).origin);
    expect(outside, 'Validation requests must stay on the page origin').toEqual([]);
    await mkdir(evidence, { recursive: true });
    const name = info.title.replace(/[^a-z0-9]+/gi, '-').slice(0,150);
    await writeFile(new URL(name + '.requests.json', evidence), JSON.stringify({title:info.title, status:info.status, panels, requests, hosts:[...new Set(requests.filter(u=>/^https?:/.test(u)).map(u=>new URL(u).host))]}, null, 2));
  }, { auto: true }]
});
export { expect };
