import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const source = read('dose-response-ma/alm-glossary.js');
const glossary = JSON.parse(read('hub/shared/glossary.json'));
const window = {};
vm.runInNewContext(read('hub/shared/tooltips.js'), { window });

function resolve(text, code = source) {
  let terms;
  vm.runInNewContext(code, {
    window: { alm: { tooltips: options => { terms = options.terms; } } },
    document: { createElement: () => ({}), head: { append() {} } }
  });
  return Array.from(text.matchAll(window.alm.tooltips.buildMatcher(terms)), match => ({
    text: match[0], key: terms[match[0]], ...glossary[terms[match[0]]]
  }));
}

// Read the actual prose text node following the input type's standalone code.
// An incidence rate is events/person-time, not the person-time denominator.
const rateLabel = read('dose-response-ma/index.html').match(/<code>ir<\/code> \(([^<]*)/)[1];

test('dose-response incidence-rate input does not receive the person-time definition', () => {
  assert.equal(rateLabel, 'incidence rate; ');
  assert.deepEqual(resolve(rateLabel), []);
});

test('dose-response controls preserve person-time and cumulative-incidence help', () => {
  const [denominator] = resolve('person-time');
  assert.equal(denominator.key, 'PersonTime');
  assert.match(denominator.long, /denominator for incidence rates/);
  const [risk] = resolve('cumulative incidence');
  assert.equal(risk.key, 'CumulativeIncidence');
  assert.match(risk.long, /Proportion experiencing an event/);
});

test('planted incidence-rate alias is detected while the shipped registration passes', () => {
  const marker = '"person-time": "PersonTime",';
  assert.equal(source.split(marker).length, 2);
  const gate = code => assert.deepEqual(resolve(rateLabel, code), []);
  gate(source);
  assert.throws(() => gate(source.replace(marker,
    `${marker}\n    "incidence rate": "PersonTime",`)), { name: 'AssertionError' });
});
