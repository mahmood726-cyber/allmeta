// Additional reference INPUT only. The original 38-draw fixture is immutable.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const load = require('../../../../gosh/tests/input-harness.cjs');
const input = JSON.parse(readFileSync(new URL('../fixtures/gosh-r-parity-duplicates-input.json', import.meta.url)));
const original = JSON.parse(readFileSync(new URL('../fixtures/gosh-r-parity-draws.json', import.meta.url)));
const page = load(fileURLToPath(new URL('../../../../gosh/index.html', import.meta.url)));
const draws = [];
for (const c of input.cases) for (const model of input.models) {
  const text = c.te.map((y,i)=>`${y},${c.se[i]},S${i+1}`).join('\n');
  const result = page.window.__almGoshValidationRun(text,model,String(c.draws),{});
  assert.equal(result.points.length,c.draws);
  const members = result.points.map(p=>Array.from(p.members));
  const prefix = original.find(r=>r.model===model).members;
  assert.deepEqual(Array.from(members.slice(0,prefix.length)),prefix);
  const distinct = new Set(members.map(ix=>[...ix].sort((a,b)=>a-b).join(','))).size;
  assert.ok(distinct < members.length,'additional fixture must exercise duplicates');
  draws.push({id:c.id,model,members});
  console.log(`${c.id} ${model}: ${members.length} draws, ${distinct} distinct memberships; original prefix retained.`);
}
writeFileSync(new URL('../fixtures/gosh-r-parity-duplicates-draws.json', import.meta.url),JSON.stringify(draws,null,2)+'\n');
