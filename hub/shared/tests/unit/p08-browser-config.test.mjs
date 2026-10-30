// Exercise the replay's generated config without installing or launching a browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const source = readFileSync(new URL('./p08-browser-replay.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('writeFileSync(config, `');
const end = source.indexOf('\nconst mime', start);
assert.ok(start >= 0 && end > start, 'The replay must generate its Playwright config');

function fixture(extension, moduleSource) {
  const output = mkdtempSync(join(tmpdir(), 'p08-config-'));
  const playwright = join(output, 'playwright.' + extension);
  const config = join(output, 'playwright.config.mjs');
  const testDir = join(output, 'tests');
  writeFileSync(playwright, moduleSource);
  // Execute the actual config-writing expression, not a duplicate of its settings.
  vm.runInNewContext(source.slice(start, end), {
    writeFileSync, config, pathToFileURL, playwright, testDir, join, output,
  });
  return { output, playwright, config, testDir };
}

test('P08 runner plant: generated config loads the resolved CommonJS Playwright entry', async t => {
  // Like Playwright's forwarding CJS entry, this exposes defineConfig at runtime
  // without a statically detectable named ESM export.
  const files = fixture('cjs', "module.exports = Object.fromEntries([['defineConfig', config => config]]);\n");
  const oldConfig = join(files.output, 'named-import.config.mjs');
  writeFileSync(oldConfig, `import { defineConfig } from ${JSON.stringify(pathToFileURL(files.playwright).href)};\nexport default defineConfig({});\n`);
  await assert.rejects(import(pathToFileURL(oldConfig).href), /Named export 'defineConfig' not found/);
  t.diagnostic('Original named-import defect rejected with the observed CommonJS error');
  const { default: config } = await import(pathToFileURL(files.config).href);
  assert.equal(config.testDir, files.testDir);
});

test('P08 runner control: config preserves all four suites and execution settings', async () => {
  // An entry with both ESM export forms is compatible with the old and new import.
  const files = fixture('mjs', 'export const defineConfig = config => config;\nexport default { defineConfig };\n');
  const { default: config } = await import(pathToFileURL(files.config).href);
  assert.deepEqual(config, {
    testDir: files.testDir,
    testMatch: ['meta-regression-features.spec.mjs', 'meta-regression-sanity.spec.mjs', 'meta-regression-permtest.spec.mjs', 'meta-regression-pi.spec.mjs'],
    workers: 1, retries: 0, timeout: 30000,
    outputDir: join(files.output, 'test-results'),
    reporter: [['list'], ['json', { outputFile: join(files.output, 'report.json') }]],
    use: { baseURL: 'http://localhost:8088', browserName: 'chromium', trace: 'retain-on-failure' },
  });
});
