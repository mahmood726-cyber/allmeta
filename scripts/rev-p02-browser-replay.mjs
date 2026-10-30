// Run the unchanged Playwright specs, with all runtime files confined to TEMP.
// Optional argument: an existing node_modules directory containing @playwright/test.
// --ui-only reruns the unchanged UI file after a browser-fixture setup failure.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = [process.argv[2], join(root, 'hub/shared/tests/node_modules'),
  join(root, 'node_modules'), join(tmpdir(), 'r3fix233-deps/node_modules'),
  join(tmpdir(), 'r3fix234-deps/node_modules')].filter(Boolean);
const deps = candidates.find(dir => existsSync(join(dir, '@playwright/test/package.json')));
if (!deps) throw new Error('Playwright unavailable: pass an installed node_modules directory as the first argument');
const work = mkdtempSync(join(tmpdir(), 'rev-p02-browser-'));
const site = join(work, 'site');
mkdirSync(site);
for (const name of ['shared', 'hub', 'dose-response-ma']) cpSync(join(root, name), join(site, name), {
  recursive: true, filter: source => !['node_modules', 'test-results', 'playwright-report'].includes(source.split(/[\\/]/).at(-1))
});
// Copy dependencies so ESM spec imports resolve without editing the checkout.
cpSync(deps, join(site, 'node_modules'), { recursive: true });
const require = createRequire(join(site, 'package.json'));
const cli = require.resolve('@playwright/test/cli');
console.log(`Playwright ${require('@playwright/test/package.json').version}; artifacts: ${work}`);
const directory = join(site, 'hub/shared/tests');
const suites = process.argv.includes('--ui-only') ? [
  ['ui', 'playwright.config.mjs', ['dose-response-ui.spec.mjs']]
] : [
  ['parity-and-ui', 'playwright.config.mjs', [
    'dose-response-dosresmeta-parity.spec.mjs', 'dose-response-parity.spec.mjs',
    'dose-response-rcs4-regression.spec.mjs', 'dose-response-spline-parity.spec.mjs',
    'dose-response-ui.spec.mjs', 'validate-dose-response-ma.spec.mjs']],
  ['usability', 'usability-dose-response-ma.config.mjs', []]
];
for (const [name, config, specs] of suites) {
  const result = spawnSync(process.execPath, [cli, 'test', ...specs, '--config', config,
    '--workers=1', '--reporter=line', '--output', join(work, name)], {
    cwd: directory, encoding: 'utf8', timeout: 900_000, maxBuffer: 32 * 1024 * 1024
  });
  const output = (result.stdout || '') + (result.stderr || '');
  writeFileSync(join(work, name + '.log'), output);
  console.log(`\n${name}: exit ${result.status}\n${output}`);
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exitCode = 1;
}
