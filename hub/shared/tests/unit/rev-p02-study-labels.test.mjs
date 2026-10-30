import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const html = read('dose-response-ma/index.html');
const pageScript = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .find(([_, attributes, code]) => !/\bsrc\s*=/.test(attributes) && code.includes('function render('))?.[2];
assert.ok(pageScript, 'load the actual dose-response page script');

// Run the real parser, engine, renderer and success lifecycle without a browser.
// Only DOM storage/event dispatch and the unrelated plot-export registration are stubbed.
function page() {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, {
    id, value: '', checked: false, hidden: false, innerHTML: '', textContent: '',
    listeners: new Map(),
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
  }]));
  const get = id => {
    assert.ok(elements.has(id), `known page element: ${id}`);
    return elements.get(id);
  };
  for (const [id, value] of Object.entries({
    'f-shape': 'linear', 'f-cov': 'indep', 'f-proc': '1stage',
    'f-method': 'FE', 'f-xref': '0', 'f-pdoses': '1, 2'
  })) get(id).value = value;
  get('f-method').options = ['REML', 'ML', 'MM', 'FE', 'PM', 'DL'].map(value => ({ value }));
  const context = vm.createContext({
    document: {
      readyState: 'complete',
      getElementById: get,
      querySelectorAll(selector) {
        assert.equal(selector, '[id^="f-"]');
        return [...elements.values()].filter(el => el.id.startsWith('f-'));
      },
      addEventListener() {}
    },
    alm: { plotExport() {} }
  });
  context.window = context;
  for (const path of ['shared/ma-core.js', 'shared/dose-response.js', 'hub/shared/analysis-lifecycle.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  let engine;
  const fitDR = context.AlmDoseResponse.fitDR;
  context.AlmDoseResponse.fitDR = (...args) => (engine = fitDR(...args));
  vm.runInContext(pageScript, context, { filename: 'dose-response-ma/index.html' });
  return {
    get,
    run(label = 'A', approach = '1stage') {
      get('f-proc').value = approach;
      // Synthetic matched studies: only the first study's label changes between runs.
      get('f-data').value = [
        `${label}, 0, 10, 100, 0, , cc`,
        `${label}, 1, 10, 100, 0.1, 0.2, cc`,
        `${label}, 2, 10, 100, 0.2, 0.2, cc`,
        'B, 0, 10, 100, 0, , cc',
        'B, 1, 10, 100, -0.1, 0.2, cc',
        'B, 2, 10, 100, -0.2, 0.2, cc'
      ].join('\n');
      const clicks = get('btn-run').listeners.get('click');
      assert.equal(clicks.length, 1);
      clicks[0]();
      return { engine, result: context._almLastDoseResponse() };
    }
  };
}

const plain = value => JSON.parse(JSON.stringify(value));
function assertRendered(p, out, label, approach) {
  assert.equal(out.engine.ok, true, out.engine.error);
  assert.equal(out.engine.excluded.length, 0);
  assert.ok(out.result, `successful engine fit must render: ${p.get('msgs').innerHTML}`);
  assert.equal(out.result.approach, approach);
  assert.equal(out.result.method, 'FE');
  assert.equal(p.get('analysis-status').hidden, false);
  assert.equal(p.get('analysis-stale').hidden, true);
  assert.doesNotMatch(p.get('msgs').innerHTML, /class='msg err'/);
  assert.equal((p.get('res-body').innerHTML.match(/<tr>/g) || []).length, 2);
  assert.ok(p.get('res-body').innerHTML.includes(`<td>${label}</td>`));
  assert.ok(p.get('res-body').innerHTML.includes('<td>B</td>'));
  assert.match(p.get('pred-body').innerHTML, /<tr>/);
  assert.match(p.get('curve-host').innerHTML, /<svg\b/);
  assert.match(p.get('resid-host').innerHTML, /<svg\b/);
}

test('P02-R2 control: ordinary labels render a one-stage fixed-effect fit', () => {
  const p = page(), out = p.run();
  assertRendered(p, out, 'A', '1stage');
  assert.equal(out.engine.perStudy, undefined);
  assert.equal(out.result.perStudy.length, 0);
  assert.equal((p.get('res-body').innerHTML.match(/— \(one-stage\)/g) || []).length, 2);
});

for (const label of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
  test(`P02-R2 plant: one-stage study label ${label} renders without inherited fits`, () => {
    const p = page(), control = p.run();
    assertRendered(p, control, 'A', '1stage');
    const out = p.run(label);
    assert.equal(out.engine.ok, true, out.engine.error);
    assert.equal(out.engine.perStudy, undefined);
    assert.deepEqual(plain(out.engine.coef), plain(control.engine.coef));
    assertRendered(p, out, label, '1stage');
    assert.equal((p.get('res-body').innerHTML.match(/— \(one-stage\)/g) || []).length, 2);
    assert.deepEqual(plain(out.result), plain(control.result), 'renaming a study preserves exported results');
  });
}

for (const label of ['A', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
  test(`P02-R2 control: two-stage study label ${label} retains its own coefficients`, () => {
    const p = page(), control = p.run('A', '2stage');
    assertRendered(p, control, 'A', '2stage');
    const controlTable = p.get('res-body').innerHTML;
    const out = p.run(label, '2stage');
    assertRendered(p, out, label, '2stage');
    assert.deepEqual(plain(out.result.perStudy).map(fit => fit.id), [label, 'B']);
    assert.ok(out.result.perStudy[0].beta[0] > 0);
    assert.ok(out.result.perStudy[1].beta[0] < 0);
    assert.doesNotMatch(p.get('res-body').innerHTML, /one-stage/);
    assert.equal(p.get('res-body').innerHTML, controlTable.replace('<td>A</td>', `<td>${label}</td>`));
    const expected = plain(control.result);
    expected.perStudy[0].id = label;
    assert.deepEqual(plain(out.result), expected, 'only the exported study label changes');
  });
}
