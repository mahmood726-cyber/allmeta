import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../../../', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('p02-zero-cases-reference.json', import.meta.url)));
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('shared/dose-response.js', root), 'utf8'), ctx);
const html = readFileSync(new URL('dose-response-ma/index.html', root), 'utf8');
for (const f of fixture.cases) {
  test(`zero cases R parity: ${f.name}`, () => {
    const groups = new Map();
    for(const row of f.rows) {
      if(!groups.has(row.id)) groups.set(row.id, {id:row.id,rows:[]});
      groups.get(row.id).rows.push(row);
    }
    const r = ctx.AlmDoseResponse.fitDR([...groups.values()], f);
    assert.equal(r.ok, f.ok, r.error || f.error);
    assert.equal(r.excluded.length, 0, 'zero cells must never silently drop a study');
    if(f.ok) {
      assert.equal(r.k, 3);
      assert.ok(Math.abs(r.coef[0]-f.slope) <= 1e-6, `slope: ${r.coef[0]} vs R ${f.slope}`);
      assert.ok(Math.abs(Math.sqrt(r.vcov[0][0])-f.se) <= 1e-6, 'SE');
      if(f.covariance==='h') assert.match(r.warnings.join(' '), /zero.*retained.*no continuity correction/i);
    } else assert.match(r.error, /study zero-category.*zero.*dosresmeta/i);
  });
  test(`zero cases page parser retains all rows: ${f.name}`, () => {
    const pc = vm.createContext({window:{}, $:()=>({value:f.covariance})});
    vm.runInContext(html.slice(html.indexOf('    function inputError('), html.indexOf('    function syncControls(')), pc);
    const csv = ['study,dose,cases,n,logrr,se,type',...f.rows.map(r=>[r.id,r.dose,r.cases,r.n,r.logrr,r.se,r.type].join(','))].join('\n');
    assert.equal(pc.parse(csv,false).length,3);
  });
}
