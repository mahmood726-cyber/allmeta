import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {pageHarness} from '../fixtures/p0prop/page-harness.mjs';
import {badRows,withBadRow,valid} from '../fixtures/p0prop/cases.mjs';

test('plant: successful runs restore the ordinary edit message; refusal control keeps its warning',()=>{
  const page=pageHarness();
  const editMessage='Results out of date — press Run analysis';
  const refusalMessage='Results do not match the current input';
  page.run(valid);
  assert.equal(page.el('analysis-stale').textContent,editMessage);
  page.run(withBadRow('12.5,150,Bad study'));
  assert.equal(page.el('analysis-stale').textContent,refusalMessage);
  assert.equal(page.el('analysis-stale').hidden,false);
  const refused=page.context.__almPropValidation.save();
  page.run(valid);
  assert.equal(page.el('analysis-stale').textContent,editMessage);
  assert.equal(page.el('analysis-stale').hidden,true);
  page.context.__almPropValidation.restore(refused);
  assert.equal(page.el('analysis-stale').textContent,refusalMessage);
  assert.equal(page.el('analysis-stale').hidden,false);
});

test('control: actual page outputs across every archived corpus configuration',()=>{
  const page=pageHarness();
  const corpus=JSON.parse(fs.readFileSync(new URL('../../../../proportion-ma/validate/corpus/corpus.json',import.meta.url),'utf8'));
  const hash=createHash('sha256');let count=0;
  for(const ca of corpus) for(const tr of ['logit','ft','raw']) for(const method of ['PM','DL','FE']) {
    const result=page.run(ca.rows.map((r,i)=>`${r.x},${r.n},row_${i}`).join('\n'),tr,method);
    hash.update(JSON.stringify({id:ca.id,tr,method,result}));count++;
  }
  assert.equal(count,2160);
  const digest=hash.digest('hex');
  // Measured on the unmodified page before the P09 repair, including refusals,
  // every pooled quantity, transformed value and per-study result.
  assert.equal(digest,'a8e57f0bee8ed406b629b85fc65180ca4f2321fbd691cde28f0b8a099e70147d');
  console.log('P0PROP_CORPUS_OUTPUT_SHA256',digest);
});
test('plant: refusal invalidates stored results, dims output and disables exports; control recovers',()=>{
  const page=pageHarness();const before=page.run(valid);
  page.run(withBadRow('12.5,150,Bad study'));
  assert.equal(page.context._almLastPropMA(),null);
  assert.equal(page.context.__almPropValidation.snapshot(),null);
  assert.equal(page.el('analysis-stale').hidden,false);
  assert.equal(page.el('results-panel').classList.contains('results-stale'),true);
  assert.ok(page.buttons.every(b=>b.disabled));
  assert.deepEqual(page.run(valid),before);
  assert.equal(page.el('analysis-stale').hidden,true);
  assert.ok(page.buttons.every(b=>!b.disabled));
});
test('plant: CSV upload refuses malformed rows before loading a partial dataset; control accepts quoted CSV',()=>{
  const page=pageHarness();
  // Old page delegates to the shared parser. Read it unchanged for the red run.
  if(!page.widgets.csvUpload.parse) {
    const ctx=vm.createContext({window:{}});
    vm.runInContext(fs.readFileSync(new URL('../../csv-upload.js',import.meta.url),'utf8'),ctx);
    page.widgets.csvUpload.parse=ctx.window.alm.csvUpload.parse;
  }
  for(const [name,row] of badRows) {
    page.run(valid);
    const result=page.widgets.csvUpload.parse('events,total,label\n'+withBadRow(row),page.widgets.csvUpload.columns);
    page.widgets.csvUpload.onParse(result);
    assert.equal(page.context._almLastPropMA(),null,name);
    assert.equal(page.el('analysis-stale').hidden,false,name);
  }
  const result=page.widgets.csvUpload.parse('label,total,events\n"Study, A",150,12.0\n"Study ""B""",90,8');
  page.widgets.csvUpload.onParse(result);
  assert.equal(page.context._almLastPropMA().k,2);
  assert.equal(page.context.__almPropValidation.snapshot().studies[0].label,'Study, A');
  assert.equal(page.el('analysis-stale').hidden,true);
});
test('plant: restoring validation state preserves a prior refusal; valid-run control recovers',()=>{
  const page=pageHarness();page.run(valid);
  page.run(withBadRow('12.5,150,Bad study'));
  const saved=page.context.__almPropValidation.save();
  const message=page.el('parse-warn').textContent;
  page.run(valid);
  page.context.__almPropValidation.restore(saved);
  assert.equal(page.context._almLastPropMA(),null);
  assert.equal(page.el('analysis-stale').hidden,false);
  assert.equal(page.el('parse-warn').textContent,message);
  assert.ok(page.buttons.every(b=>b.disabled));
  page.run(valid);
  assert.equal(page.el('analysis-stale').hidden,true);
  assert.ok(page.buttons.every(b=>!b.disabled));
});
