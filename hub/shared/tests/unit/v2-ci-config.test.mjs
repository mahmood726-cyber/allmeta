import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const testsDir = new URL('../', import.meta.url);
const workflow = readFileSync(new URL('../../../../.github/workflows/v2-app-suites.yml', import.meta.url), 'utf8');
const generated = workflow.match(/cat > playwright\.v2-ci\.config\.mjs <<'CONFIG'\r?\n([\s\S]*?)\r?\n\s*CONFIG/);
assert.ok(generated, 'the workflow must generate the configuration used by Run shard');

// Evaluate the actual configuration sources without installing Playwright in the
// dependency-free node unit job. Only defineConfig/devices are stand-ins; all
// suite settings and the workflow's composition code come from the repository.
function evaluate(source) {
  const context = {
    defineConfig: config => config,
    devices: { 'Desktop Chrome': { browserName: 'chromium', viewport: { width: 1280, height: 720 } } },
    process: { env: { CI: 'true' } },
    loadConfig: name => evaluate(readFileSync(new URL(name, testsDir), 'utf8')),
  };
  source = source
    .replace(/import \{ defineConfig, devices \} from '@playwright\/test';/g, '')
    .replace(/import (\w+) from '([^']+)';/g, 'const $1 = loadConfig(\'$2\');')
    .replace('export default', 'globalThis.result =');
  runInNewContext(source, context);
  return JSON.parse(JSON.stringify(context.result));
}

const shared = evaluate(readFileSync(new URL('playwright.config.mjs', testsDir), 'utf8'));
const features = evaluate(readFileSync(new URL('playwright.features.config.mjs', testsDir), 'utf8'));
const combined = evaluate(generated[1]);

function effective(config) {
  return config.projects.map(project => ({ ...config, ...project, use: { ...config.use, ...project.use } }));
}
function matches(pattern, name) {
  return new RegExp('^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(name);
}
function selects(project, name) {
  return [project.testMatch].flat().some(pattern => matches(pattern, name))
    && ![project.testIgnore ?? []].flat().some(pattern => matches(pattern, name));
}
function selected(name) {
  const projects = effective(combined).filter(project => selects(project, name));
  assert.equal(projects.length, 1, `${name} must run in exactly one project`);
  return projects[0];
}

test('v2 regression: live feature tests retain the dedicated feature timeout', () => {
  const project = selected('features-live-nma-inconsistency.spec.mjs');
  assert.equal(project.timeout, features.timeout);
});

test('v2 control: shared tests retain their original timeout and browser settings', () => {
  const project = selected('nma-inconsistency-parity.spec.mjs');
  const original = effective(shared)[0];
  for (const key of ['timeout', 'use', 'testMatch', 'testIgnore', 'retries', 'workers']) {
    assert.deepEqual(project[key], original[key], key);
  }
});

test('v2 feature tests retain their worker limit, browser, downloads and server URL', () => {
  const project = selected('features-live-nma-inconsistency.spec.mjs');
  const original = effective(features)[0];
  for (const key of ['workers', 'use', 'testMatch', 'retries']) {
    assert.deepEqual(project[key], original[key], key);
  }
});

test('v2 serves both suites using their existing server configurations', () => {
  assert.deepEqual([combined.webServer].flat(), [shared.webServer, features.webServer]);
});

test('v2 selects every non-pixel spec exactly once and excludes all pixel specs', () => {
  const specs = readdirSync(testsDir).filter(name => name.endsWith('.spec.mjs'));
  assert.ok(specs.some(name => name.startsWith('features-')));
  assert.ok(specs.some(name => name.endsWith('-plus-pixels.spec.mjs')));
  for (const spec of specs) {
    const count = effective(combined).filter(project => selects(project, spec)).length;
    assert.equal(count, spec.endsWith('-plus-pixels.spec.mjs') ? 0 : 1, spec);
  }
});

test('v2 project names are unique and the workflow uses the tested configuration', () => {
  assert.equal(new Set(combined.projects.map(project => project.name)).size, combined.projects.length);
  assert.match(workflow, /'--config=playwright\.v2-ci\.config\.mjs'/);
});
