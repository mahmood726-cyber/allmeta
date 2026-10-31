import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../../../../shared/alm-examples.js');
const root = new URL('../../../../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const manifest = read('validation/examples/manifest.json');

test('all sixteen apps with synthetic examples have a source-backed addition', () => {
  assert.deepEqual(manifest.map(x=>x.paper).sort((a,b)=>a-b), [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19]);
});

for (const item of manifest) {
  const data = read(`validation/examples/${item.app}/${item.dataset}.json`);
  test(`${item.app}: exact source records, citation and usable projection`, () => {
    assert.doesNotThrow(()=>E.validateDataset(data));
    assert.equal(data.dataset, item.dataset);
    assert.equal(data.source_blob.length, 40);
    const result = E.project(item.app, data);
    assert.ok(result.text.length > 0);
    assert.ok(result.rows.length >= 2);
    assert.ok(!result.text.includes('NaN'));
    assert.ok(!result.text.includes('undefined'));
  });
  test(`${item.app}: planted missing source field fails closed`, () => {
    const broken = structuredClone(data);
    delete broken.values[0][Object.keys(broken.values[0])[0]];
    assert.throws(()=>E.project(item.app, broken), /column|field/i);
  });
}

test('planted nonfinite source count is refused rather than silently dropped', () => {
  const data = read('validation/examples/proportion-ma/dat.bcg.json');
  data.values[0].cpos = NaN;
  assert.throws(()=>E.project('proportion-ma',data), /finite|count/i);
});

test('two-arm network projection explicitly excludes multi-arm source rows', () => {
  const d = read('validation/examples/nma-inconsistency/smokingcessation.json');
  const p = E.project('nma-inconsistency', d);
  // Source schema: absent third treatment is "", while its counts are NA.
  assert.equal(p.rows.length, d.values.filter(v=>v.treat3 === '' && v.event3 === null && v.n3 === null).length);
  assert.equal(p.excluded.length, d.values.filter(v=>v.treat3 !== '').length);
  assert.equal(p.rows.length, 22);
  assert.ok(p.excluded.length > 0);
});

test('BCG controls use their own denominator and preserve source years', () => {
  const d = read('validation/examples/proportion-ma/dat.bcg.json');
  const p = E.project('proportion-ma', d);
  assert.equal(p.rows[0].n, d.values[0].cpos + d.values[0].cneg);
  assert.equal(p.rows[0].x, d.values[0].cpos);
  assert.equal(E.project('cumulative-subgroup',d).rows[0].year, d.values[0].year);
});

test('component data retain a published combination and exclude whole multi-arm studies', () => {
  const d=read('validation/examples/component-nma/Baker2009.json');
  const p=E.project('component-nma',d);
  assert.equal(p.rows.length,29);
  assert.ok(p.rows.some(r=>r.A==='Fluticasone+Salmeterol'.toLowerCase()));
  assert.equal(new Set(p.rows.map(r=>r.study)).size,p.rows.length);
  assert.equal(p.rows.length*2+p.excluded.length,d.values.length);
  const bad=structuredClone(d);bad.values[0].total=0;
  assert.throws(()=>E.project('component-nma',bad),/denominator/);
});

test('display gate accepts rounded output and rejects a planted altered result', () => {
  const d = [{ key:'mu', text:'0.123', value:0.123, digits:3, scale:1 }];
  assert.doesNotThrow(()=>E.checkDisplay(d,[{key:'mu',value:0.1234}]));
  assert.throws(()=>E.checkDisplay(d,[{key:'mu',value:0.25}]), /display/i);
});
