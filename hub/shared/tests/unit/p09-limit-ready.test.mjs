import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual pixel-spec render helper without Playwright or a browser.
const source = readFileSync(new URL('../limit-ma-plus-pixels.spec.mjs', import.meta.url), 'utf8');
const renderSource = source.slice(source.indexOf('async function render('), source.indexOf("const plots="));
function harness() {
  let rendered = 0;
  const browser = vm.createContext({
    __almLimitValidationRun() {}, _almLastLimit: () => ({}),
    document: { getElementById: () => ({ checked: false }) },
    AlmLimitPlus: { compute: () => ({}) },
    AlmLimitPlusUI: { render() { rendered++; } }
  });
  const page = {
    async evaluate(fn, arg) {
      browser.arg = arg;
      return vm.runInContext(`(${fn.toString()})(arg)`, browser);
    },
    async waitForFunction(fn) {
      for (let i = 0; i < 20; i++) {
        if (await this.evaluate(fn)) return;
        await new Promise(resolve => setImmediate(resolve));
      }
      throw new Error('readiness timed out');
    }
  };
  const context = vm.createContext({ corpus: [{ id: 'case', te: [1], se: [0.2] }],
    expect: value => ({ toBeTruthy: () => assert.ok(value) }) });
  vm.runInContext(renderSource, context);
  return { browser, run: () => context.render(page, { id: 'case', mask: 12 }),
    get rendered() { return rendered; } };
}

test('P09 pixels regression: delayed readiness registration and pending initialization block rendering', async () => {
  const h = harness();
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  const running = h.run();
  // Attach a rejection handler before yielding, including for the old-code replay.
  const outcome = running.then(() => null, error => error);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.rendered, 0);
  h.browser.AlmLimitPlusReady = ready;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.rendered, 0, 'registering a promise is not completion');
  release();
  assert.equal(await outcome, null);
  assert.equal(h.rendered, 1);
});

test('P09 pixels control: already registered readiness still renders once', async () => {
  const h = harness();
  h.browser.AlmLimitPlusReady = Promise.resolve();
  await h.run();
  assert.equal(h.rendered, 1);
});

test('P09 pixels control: initialization rejection fails without rendering', async () => {
  const h = harness();
  h.browser.AlmLimitPlusReady = Promise.reject(new Error('initialization failed'));
  await assert.rejects(h.run(), /initialization failed/);
  assert.equal(h.rendered, 0);
});

test('P09 pixels regression: absent readiness times out without rendering', async () => {
  const h = harness();
  await assert.rejects(h.run(), /readiness timed out/);
  assert.equal(h.rendered, 0);
});
