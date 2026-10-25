// Original page parsers/fit, executed in-process. This is not browser or R evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), E=require('../../../../shared/alm-examples.js');
const root=new URL('../../../../',import.meta.url);
const data=(app,name)=>JSON.parse(readFileSync(new URL(`validation/examples/${app}/${name}.json`,root),'utf8'));
function native(app,start,end,names) {
  const source=readFileSync(new URL(`${app}/index.html`,root),'utf8');
  const first=source.indexOf(start), last=source.indexOf(end,first);
  assert.ok(first>=0 && last>first,'original page functions found');
  return vm.runInNewContext(source.slice(first,last)+'\n({'+names.join(',')+'})');
}

test('BCG projection passes the original publication-bias parser without dropped rows',()=>{
  const n=native('pubbias-tests','function parseLines(','function parseBinary(',['parseTESE']);
  const p=E.project('pubbias-tests',data('pubbias-tests','dat.bcg'));
  const rows=n.parseTESE(p.text);
  assert.equal(rows.length,13);
  rows.forEach((r,i)=>{assert.equal(r.te,p.rows[i].yi);assert.equal(r.se,p.rows[i].se);});
  assert.throws(()=>n.parseTESE(p.text+'\n0.2, zero'),/could not be read/);
});

test('Baker projection is identifiable in the original component engine, with source ingredients',()=>{
  const n=native('component-nma','function parse(','let _lastCnma',['parse','fit']);
  const p=E.project('component-nma',data('component-nma','Baker2009'));
  const rows=n.parse(p.text), fit=n.fit(rows);
  assert.equal(rows.length,29);
  assert.equal(JSON.stringify(fit.comps),JSON.stringify(['fluticasone','formoterol','salmeterol','tiotropium']));
  assert.ok(fit.beta.every(Number.isFinite));
  assert.ok(rows.some(r=>r.A.length===2));
  assert.throws(()=>n.fit(n.parse('a+b | control | .2 | .1\na+b | control | .3 | .2')),/identifiable/);
});
