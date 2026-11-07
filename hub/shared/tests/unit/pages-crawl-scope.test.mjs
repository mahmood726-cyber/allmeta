// playwright.yml runs on pull requests against the PR's checkout, but pages-crawl.spec.ts fetches
// the LIVE site, so its verdict is about the last deploy and never about the PR. It belongs to the
// nightly job only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('the PR and push suite does not crawl the live site', () => {
  assert.match(read('tests/playwright/playwright.config.ts'), /^\s*testIgnore:\s*"pages-crawl\.spec\.ts",/m);
  assert.doesNotMatch(read('.github/workflows/playwright.yml'), /playwright\.pages\.config|PAGES_BASE/);
});

test('the crawl keeps a job: the nightly workflow runs it against the deployed site', () => {
  assert.match(read('tests/playwright/playwright.pages.config.ts'), /testMatch:\s*"pages-crawl\.spec\.ts"/);
  const nightly = read('.github/workflows/nightly-pages-crawl.yml');
  assert.match(nightly, /--config=playwright\.pages\.config\.ts/);
  assert.match(nightly, /schedule:/);
});
