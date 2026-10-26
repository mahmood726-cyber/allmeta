const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const load = require('./input-harness.cjs');

// Synthetic input deliberately retains blank lines, optional labels and numeric
// spelling. Sharing may normalize CRLF, but must not otherwise rewrite the data.
const lf = '\n+.42e0, 8.e-2, Synthetic A\n\n.2, .1, \n.3, .2, Synthetic C\n';
const plain = value => JSON.parse(JSON.stringify(value));

function app() {
  const h = load(path.join(__dirname, '../index.html'));
  const axes = ['', '', false, '0', '100', false].map(value => ({
    type: typeof value === 'boolean' ? 'checkbox' : 'number',
    value: typeof value === 'string' ? value : '', checked: value === true,
    dispatchEvent() {}
  }));
  h.window.AlmFeaturesState = { entryLog: [{ study: 'Synthetic A', method: 'test control' }] };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../alm-features.js'), 'utf8'), {
    window: h.window, Event,
    document: { getElementById: id => h.nodes[id], querySelectorAll: () => axes }
  });
  h.share = h.window.AlmGoshFeatures.share;
  return h;
}

for (const model of ['FE', 'DL']) {
  for (const [name, src] of [['CRLF regression', lf.replaceAll('\n', '\r\n')], ['LF control', lf]]) {
    test(`share ${model} ${name}: canonical source, unchanged live input and exact restoration`, () => {
      const sender = app();
      sender.nodes.model.value = model;
      const result = plain(sender.run(src));
      assert.equal(result.k, 3);
      const state = plain(sender.share.get());
      assert.equal(state.src, lf);
      assert.equal(sender.nodes.src.value, src, 'capture must not edit the live input');
      assert.deepEqual(plain(sender.window._almLastGosh()), result);

      const receiver = app();
      let value = receiver.nodes.src.value;
      // A browser textarea normalizes CRLF when the share adapter assigns value.
      Object.defineProperty(receiver.nodes.src, 'value', {
        get() { return value; }, set(next) { value = String(next).replace(/\r\n?/g, '\n'); }
      });
      receiver.share.set(state);
      assert.deepEqual(plain(receiver.share.get()), state);
      assert.deepEqual(plain(receiver.window._almLastGosh()), result);
      assert.equal(receiver.nodes.plot.innerHTML, sender.nodes.plot.innerHTML);
    });
  }
}
