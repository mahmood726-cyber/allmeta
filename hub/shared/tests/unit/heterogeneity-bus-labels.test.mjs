import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const heterogeneity = readFileSync(new URL('../../../../heterogeneity/index.html', import.meta.url), 'utf8');
const validator = readFileSync(new URL('../../../../webr-validator/index.html', import.meta.url), 'utf8');
const bus = readFileSync(new URL('../../../../shared/ma-studies-v1.js', import.meta.url), 'utf8');
function section(html, start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return html.slice(a, b);
}
const plain = value => JSON.parse(JSON.stringify(value));

function roundTrip(text, destination) {
  const storage = new Map(), textarea = {value: ''};
  const window = {localStorage: {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value),
  }, location: {search: '?fromBus=1'}};
  const ctx = vm.createContext({window, URLSearchParams,
    document: {getElementById: () => textarea}, Toast: {show() {}},
    addWarning: message => assert.fail(message), render() {},
  });
  vm.runInContext(bus, ctx);
  ctx.MaStudies = window.MaStudies;
  vm.runInContext(section(heterogeneity, '    function parseStudies(text)', '    function weightedSums('), ctx);
  const original = ctx.parseStudies(text);
  assert.deepEqual(plain(original.warnings), []);
  ctx.render = () => {ctx._lastInfo = {}; ctx._lastStudies = original.studies;};
  vm.runInContext(section(heterogeneity, '    function onBusSave()', '    // Push the HKSJ'), ctx);
  assert.equal(ctx.onBusSave(), true);
  const html = destination === 'heterogeneity' ? heterogeneity : validator;
  vm.runInContext(section(html, '    function parseStudies(text)', destination === 'heterogeneity'
    ? '    function weightedSums(' : '    // ---- Browser pooling:'), ctx);
  let result;
  ctx.render = () => {result = ctx.parseStudies(textarea.value);};
  if (destination === 'validator-auto') {
    vm.runInContext(section(html, '    (function maybeAutoLoadBus()', '\n  })();'), ctx);
  } else {
    vm.runInContext(section(html, '    function onBusLoad()', destination === 'heterogeneity'
      ? '    function onBusSave()' : '    function onExample()') + '\nonBusLoad();', ctx);
  }
  assert.ok(result, 'loading shared studies renders the destination');
  assert.deepEqual(plain(result.warnings), []);
  assert.deepEqual(plain(result.studies), plain(original.studies));
}

for (const destination of ['heterogeneity', 'validator-manual', 'validator-auto']) {
  for (const label of ['Study, A', '#Site B', '"Site" C']) {
    test(`${destination}: shared studies preserve ${label}`, () => {
      roundTrip('"' + label.replace(/"/g, '""') + '",1.8,0.1\nB,-0.2,0.3\nC,0.1,0.2', destination);
    });
  }
  test(`${destination}: control ordinary study labels and numbers`, () => {
    roundTrip('A,1.8,0.1\nB,-0.2,0.3\nC,0.1,0.2', destination);
  });
}
