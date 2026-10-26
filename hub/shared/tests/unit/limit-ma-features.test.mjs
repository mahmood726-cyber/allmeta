import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const featureSource = readFileSync(new URL('../../../../limit-ma/alm-features.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../../../limit-ma/index.html', import.meta.url), 'utf8');
const parser = html.slice(html.indexOf('    function parse(text)'), html.indexOf('    function fmt('));
function fixture() {
  const nodes = { src: { value: '0.1,0.1,A\n0.2,0.2,B\n0.3,0.3,C' }, 'limit-error': { textContent: '' } };
  for (const id of ['plus-alpha', 'plus-binary-measure', 'plus-binary-counts']) nodes[id] = { type: 'text', value: id === 'plus-alpha' ? '0.05' : '' };
  for (const id of ['plus-limit-toggle', 'plus-fill-toggle', 'plus-reg-toggle', 'plus-contour-toggle']) nodes[id] = { type: 'checkbox', checked: true };
  const axes = Array.from({ length: 4 }, () => ({ value: '', dispatchEvent() {} }));
  let result = { k: 3 }, runs = 0;
  const context = vm.createContext({ document: { getElementById: id => nodes[id], querySelectorAll: () => axes }, Event: class {} });
  vm.runInContext(parser, context);
  context.AlmLimitEngine = { parse: context.parse };
  context.AlmFeaturesState = { entryLog: [] };
  context.AlmLimitPlusUI = { snapshot: () => null, restore() {}, run() {} };
  context._almLastLimit = () => result;
  context.__almLimitValidationSnapshot = () => ({ src: nodes.src.value, result });
  context.__almLimitValidationRestore = s => { nodes.src.value = s.src; result = s.result; };
  nodes['btn-run'] = { click() { runs++; result = { k: context.parse(nodes.src.value).length }; } };
  vm.runInContext(featureSource, context);
  return { spec: context.AlmLimitFeatures, nodes, parse: context.parse, runs: () => runs };
}

for (const [name, src] of [
  ['header', 'effect,se,label\n0.1,0.1,A\n0.2,0.2,B\n0.3,0.3,C'],
  ['blank lines', '0.1,0.1,A\n\n0.2,0.2,B\n0.3,0.3,C'],
  ['plain CSV control', '0.1,0.1,A\n0.2,0.2,B\n0.3,0.3,C'],
]) test('limit share restores accepted ' + name, () => {
  const f = fixture();
  assert.equal(f.parse(src).length, 3, 'the actual app parser accepts the source');
  f.nodes.src.value = src;
  const saved = f.spec.share.get();
  f.nodes.src.value = '0.4,0.1,X\n0.5,0.2,Y\n0.6,0.3,Z';
  f.spec.share.set(saved);
  assert.equal(f.nodes.src.value, src);
  assert.equal(f.runs(), 1);
});

test('limit share refuses invalid rows without changing current inputs', () => {
  for (const src of ['bad,0.1,A\n0.2,0.2,B\n0.3,0.3,C', '0.1,0,A\n0.2,0.2,B\n0.3,0.3,C', '0.1,0.1,A\n0.2,0.1,B\n0.3,0.1,C']) {
    const f = fixture(), before = f.nodes.src.value, saved = f.spec.share.get();
    saved.src = src;
    assert.throws(() => f.spec.share.set(saved));
    assert.equal(f.nodes.src.value, before);
    assert.equal(f.runs(), 0);
  }
});
