import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import vm from 'node:vm';

const harnessURL = new URL('../../../../gosh/tests/input-harness.cjs', import.meta.url);
const pagePath = fileURLToPath(new URL('../../../../gosh/index.html', import.meta.url));
const require = createRequire(harnessURL);
const load = require(fileURLToPath(harnessURL));
const source = readFileSync(harnessURL, 'utf8');
const stub = 'urlState: Object.assign(noop, { read: () => null, write: () => true, isSuspended: () => false })';

test('P13 harness: page initialization and FE/DL validation run without an R fixture', () => {
  const page = load(pagePath);
  assert.equal(page.window.alm.urlState.isSuspended(), false);
  assert.equal(page.window.alm.urlState.write({}), true);
  for (const model of ['FE', 'DL']) {
    const result = page.window.__almGoshValidationRun('0.1,0.2,A\n0.2,0.3,B\n0.3,0.4,C', model, '5000', {});
    assert.equal(result.summary.model, model);
    assert.equal(result.summary.n_subsets, 7);
    assert.equal(result.points.length, 7);
    assert.equal(result.points.filter(p => p.k === 1).length, 3);
    assert.ok(result.points.every(p => Number.isFinite(p.mu) && Number.isFinite(p.se)));
    assert.equal(page.nodes['input-error'].textContent, '');
  }
});

test('P13 small-k page contract: fewer than three input studies are refused; three recover', () => {
  const page = load(pagePath);
  for (const model of ['FE', 'DL']) {
    for (const text of ['0.1,0.2,A', '0.1,0.2,A\n0.2,0.3,B']) {
      const result = page.window.__almGoshValidationRun(text, model, '5000', {});
      assert.equal(result.summary, null);
      assert.equal(result.points.length, 0);
      assert.match(page.nodes['input-error'].textContent, /at least 3 valid studies/);
    }
    assert.ok(page.window.__almGoshValidationRun('0.1,0.2,A\n0.2,0.3,B\n0.3,0.4,C', model, '5000', {}).summary);
  }
});

for (const [label, replacement, error] of [
  ['obsolete URL-state API', 'urlState: Object.assign(noop, { read: () => null, write: noop })', /isSuspended is not a function/],
  ['missing write-success result', 'urlState: Object.assign(noop, { read: () => null, write: noop, isSuspended: () => false })', /createElement is not a function/]
]) {
  test(`P13 harness plant: ${label} prevents initialization; current stub is the control`, () => {
    assert.equal(source.split(stub).length, 2, 'the plant must replace exactly one UI stub');
    const module = { exports: {} };
    vm.runInNewContext(source.replace(stub, replacement), {
      require, module, __dirname: dirname(fileURLToPath(harnessURL))
    });
    assert.throws(() => module.exports(pagePath), error);
    assert.ok(load(pagePath).window._almLastGosh());
  });
}
