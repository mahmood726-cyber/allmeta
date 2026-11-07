import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const specURL = new URL('../proportion-ma-usability.spec.mjs', import.meta.url);
const source = readFileSync(specURL, 'utf8');
const refusal = '4 refusal does not leave the previous result on screen';

// Inspect the actual browser test's status before navigation. The existing
// p09-clear-undo tests execute the real app and establish that refusal succeeds.
// No browser or Playwright installation is needed for this status contract.
async function expectedStatus(title, spec = source) {
  const cases = new Map();
  let status = 'passed';
  const register = (name, body) => cases.set(name, body);
  register.describe = (_name, body) => body();
  register.describe.configure = () => {};
  register.setTimeout = () => {};
  for (const [method, value] of [['fail', 'failed'], ['skip', 'skipped'], ['fixme', 'skipped']]) {
    register[method] = condition => { if (condition) status = value; };
  }
  const code = spec.replace(/^import .*;\r?$/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(specURL.href));
  vm.runInNewContext(code, { test: register, URL }, { filename: specURL.pathname });
  assert.ok(cases.has(title), `browser regression is still registered: ${title}`);
  const navigation = new Error('stop before browser navigation');
  await assert.rejects(cases.get(title)({ page: { on() {}, goto() { throw navigation; } } }),
    error => error === navigation);
  return status;
}

test('P09 CI plant: fixed refusal regression must expect a pass', async () => {
  assert.equal(await expectedStatus(refusal), 'passed',
    'a passing refusal regression must not become an unexpected-pass CI failure');
});

test('P09 CI control: unresolved empty-input diagnostic still expects failure', async () => {
  assert.equal(await expectedStatus('4 input error: empty'), 'failed');
});

test('P09 CI control: ordinary successful analysis still expects a pass', async () => {
  assert.equal(await expectedStatus('3 core output in <=3 clicks from a fresh load'), 'passed');
});

test('P09 CI mutation: reinstating the obsolete marker is detected', async () => {
  const declaration = `test('${refusal}', async ({ page }) => {`;
  assert.equal(source.split(declaration).length, 2, 'one refusal regression to mutate');
  const planted = source.replace(declaration, declaration + '\n    test.fail(true, "obsolete refusal defect");');
  await assert.rejects(async () => assert.equal(await expectedStatus(refusal, planted), 'passed'),
    assert.AssertionError);
});
