import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const dir = new URL('../fixtures/p0parse/', import.meta.url);
const cases = JSON.parse(fs.readFileSync(new URL('cases.json',dir)));
const source = fs.readFileSync(new URL('../../csv-upload.js',import.meta.url),'utf8');
const context = {window:{}}; vm.runInNewContext(source,context);
const columns = [{name:'study'},{name:'yi',type:'float'},{name:'se',type:'float'}];
for (const c of cases) test(c.id + ' defect/control',()=>{
 const result = JSON.parse(JSON.stringify(context.window.alm.csvUpload.parse(fs.readFileSync(new URL(c.id+'.csv',dir),'utf8'),c.columns||columns)));
 assert.deepEqual(result.rows,c.rows);
 if(c.warningsExact) assert.deepEqual(result.warnings,c.warningsExact);
 if(c.warning) { assert.ok(result.warnings.some(w=>w.includes(c.warning))); assert.ok(result.warnings.some(w=>w.includes('1,234'))); }
 const refused = result.warnings.filter(w=>/^row \d+.*refused/.test(w));
 assert.deepEqual(refused.map(w=>Number(w.match(/^row (\d+)/)[1])),c.refused);
 for(const w of refused) { assert.match(w,/column/); assert.match(w,/Use|Supply/); }
});
test('numeric label planted corruption is detected',()=>{
 const c=cases.find(c=>c.id==='labels');
 const result=JSON.parse(JSON.stringify(context.window.alm.csvUpload.parse(fs.readFileSync(new URL('labels.csv',dir),'utf8'),columns)));
 assert.deepEqual(result.rows,c.rows);
 const planted=result.rows.filter(r=>Number(r.study)!==0);
 assert.throws(()=>assert.deepEqual(planted,c.rows));
});

test('planted sample-size variance alias is detected',()=>{
 const c=cases.find(c=>c.id==='guard-sample-size');
 const result=JSON.parse(JSON.stringify(context.window.alm.csvUpload.parse(fs.readFileSync(new URL(c.id+'.csv',dir),'utf8'),c.columns)));
 assert.deepEqual(result.rows,c.rows);
 const planted=result.rows.map(r=>({...r,vi:Number(r['sample size'])}));
 assert.throws(()=>assert.deepEqual(planted,c.rows));
});

test('missing float and malformed float retain main warning text and rows',()=>{
 const cols=[{name:'study'},{name:'yi',type:'float',required:true},{name:'sei',type:'float',required:true}];
 const result=JSON.parse(JSON.stringify(context.window.alm.csvUpload.parse('study,yi,sei\nA,,0.2\nB,x,0.3\nC,0.1,0.2',cols)));
 assert.deepEqual(result.rows,[{study:'A',yi:null,sei:0.2},{study:'B',yi:null,sei:0.3},{study:'C',yi:0.1,sei:0.2}]);
 assert.deepEqual(result.warnings,['row 1: missing float','row 2: not float: x']);
 const control=context.window.alm.csvUpload.parse('study,yi,sei\nC,0.1,0.2',cols);
 assert.equal(control.warnings.length,0);
});
test('all invalid cells are diagnosed without losing the rest of the record',()=>{
 const result=JSON.parse(JSON.stringify(context.window.alm.csvUpload.parse('study,yi,se\nA,"0,45",0.1-0.3\nB,0.2,0.1',columns)));
 assert.deepEqual(result.rows,[{study:'A',yi:null,se:null},{study:'B',yi:0.2,se:0.1}]);
 assert.equal(result.warnings.length,2);
 assert.match(result.warnings[0],/row 1: column "yi"/);
 assert.match(result.warnings[1],/row 1: column "se"/);
});
