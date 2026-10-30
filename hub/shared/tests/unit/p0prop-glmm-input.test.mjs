import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pageHarness} from '../fixtures/p0prop/page-harness.mjs';
import {valid} from '../fixtures/p0prop/cases.mjs';

const core = fs.readFileSync(new URL('../../../../proportion-ma/plus-core.js', import.meta.url), 'utf8');
function setup() {
  const page = pageHarness();
  vm.runInContext(core, page.context);
  return page;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('plant: uploaded CSV remains usable by GLMM with exact counts and quoted labels', () => {
  const page = setup();
  const csv = 'events,total,label\n12,150,"Study, A"\n8,90,"Study ""B"""';
  const parsed = page.widgets.csvUpload.parse(csv);
  page.widgets.csvUpload.onParse(parsed);
  assert.equal(page.context._almLastPropMA().k, 2);
  assert.deepEqual(plain(page.context.AlmPropPlusCore.parse(page.el('src').value)), [
    {x:12,n:150,label:'Study, A'}, {x:8,n:90,label:'Study "B"'},
  ]);
});

test('control: ordinary pasted counts give the same GLMM input with or without page validator', () => {
  const standalone = vm.createContext({});
  vm.runInContext(core, standalone);
  const page = setup();
  assert.deepEqual(plain(page.context.AlmPropPlusCore.parse(valid)), plain(standalone.AlmPropPlusCore.parse(valid)));
  assert.deepEqual(plain(page.context.AlmPropPlusCore.parse('')), []);
});

test('control: GLMM refuses fractional counts in the page and standalone', () => {
  const standalone = vm.createContext({});
  vm.runInContext(core, standalone);
  const page = setup();
  for (const context of [page.context, standalone]) {
    assert.throws(() => context.AlmPropPlusCore.parse('12.5,150,A\n8,90,B'));
  }
});
