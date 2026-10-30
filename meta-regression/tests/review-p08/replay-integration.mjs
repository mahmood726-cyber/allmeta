// Run existing app suites unchanged in a temporary source copy: numeric.test.mjs
// writes evidence, pytest writes caches, and Playwright writes browser artifacts.
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = fileURLToPath(new URL('../../../', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'p08-integration-'));
const tree = join(work, 'tree');
cpSync(source, tree, { recursive: true, filter: path =>
  !/(^|[\\/])(node_modules|test-results|playwright-report|__pycache__|\.pytest_cache)([\\/]|$)/.test(path) });
console.log(`Temporary integration tree: ${tree}`);
const failures = [];
function run(label, executable, args, cwd = tree, timeout = 600000) {
  console.log(`\n--- ${label} ---`);
  const out = spawnSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 });
  if (out.stdout) console.log(out.stdout);
  if (out.stderr) console.error(out.stderr);
  if (out.error || out.status !== 0) {
    failures.push(label);
    console.error(`${label}: ${out.error?.message || `exit ${out.status}`}`);
    return false;
  }
  return true;
}

run('existing Python app suite', 'python', ['-B', '-m', 'pytest',
  join(tree, 'meta-regression/tests'), '-q', '-o', 'addopts=', '-o', `cache_dir=${join(work, 'pytest-cache')}`,
  `--basetemp=${join(work, 'pytest-tmp')}`, '-rs']);

// No dependency manifest, lockfile or installed package is written into source.
// The shared Playwright version comes from its existing lockfile. The DOM-only
// dependency omitted by that manifest is pinned explicitly for this replay.
let npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!existsSync(npm)) npm = join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
if (!existsSync(npm)) {
  console.error('Cannot locate npm-cli.js beside Node; DOM/browser suites remain unverified.');
  failures.push('npm unavailable');
} else {
  const flags = ['--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(work, 'npm-cache')];
  writeFileSync(join(tree, 'package.json'), JSON.stringify({ private: true, dependencies: { linkedom: '0.18.12' } }));
  if (run('install isolated DOM dependency', process.execPath, [npm, 'install', '--package-lock=false', ...flags])) {
    run('existing numeric and DOM suite', process.execPath,
      ['--test', join(tree, 'meta-regression/validate/numeric.test.mjs')]);
  }
  const tests = join(tree, 'hub/shared/tests');
  if (run('install locked browser dependencies', process.execPath, [npm, 'ci', ...flags], tests)) {
    // Observe missing resources without routing, mocking or changing app/specs.
    writeFileSync(join(tests, 'p08-network-probe.spec.mjs'), `import { test, expect } from '@playwright/test';
test('P08 bundle network diagnostics', async ({ page }) => {
  page.on('response', r => { if (r.status() >= 400) console.log('PAGE_HTTP', r.status(), r.url()); });
  page.on('requestfailed', r => console.log('PAGE_REQUEST_FAILED', r.url(), r.failure()));
  page.on('console', m => { if (m.type() === 'error') console.log('PAGE_CONSOLE', m.text(), m.location()); });
  await page.goto('/meta-regression/');
  await expect(page.locator('#svg-host svg')).toBeVisible();
  for (const path of ['/favicon.ico', '/r-shiny/shinylive/webr/repo/manifest.json']) {
    const response = await page.request.get(path);
    console.log('BUNDLE_RESOURCE', response.status(), path);
  }
});
`);
    const config = join(tests, 'p08-replay.config.mjs');
    writeFileSync(config, `import original from './playwright.config.mjs';
export default {
  ...original,
  testMatch: ['meta-regression-*.spec.mjs', 'p08-network-probe.spec.mjs'],
  outputDir: ${JSON.stringify(join(work, 'browser-results'))},
  projects: original.projects.map(project => ({ ...project, use: { ...project.use,
    channel: ${JSON.stringify(process.platform === 'win32' ? 'msedge' : 'chromium')} } })),
  webServer: { ...original.webServer, cwd: ${JSON.stringify(tests)}, reuseExistingServer: false }
};
`);
    run('existing meta-regression browser suites', process.execPath,
      [join(tests, 'node_modules/@playwright/test/cli.js'), 'test', '--config', config, '--workers=1', '--reporter=list'], tests, 1200000);
  }
}
console.log(`Integration phases failed: ${failures.length ? failures.join(', ') : 'none'}`);
console.log(`Artifacts retained outside source: ${work}`);
process.exitCode = failures.length ? 1 : 0;
