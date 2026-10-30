// Read-only corpus replay through production engines; outputs belong in temp.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const app = fileURLToPath(new URL('../../../../limit-ma/', import.meta.url));
export const destination = path.join(tmpdir(), 'limit-ma-p12-r4-' + createHash('sha256').update(app).digest('hex').slice(0,16));
const {load} = require(path.join(app, 'tests/input-harness.cjs'));
const {load:loadLoo} = require(path.join(app, 'validate/loo/replay.cjs'));
const read = p => JSON.parse(readFileSync(path.join(app, p), 'utf8'));
export function capture() {
  const h = load(path.join(app,'index.html'), path.join(app,'plus-ui.js'));
  const l = loadLoo();
  const outputs = {hashes:[], primary:[], plus:[], loo:[]};
  for (const manifest of ['validate/MANIFEST.json','validate/MANIFEST-plus.json','validate/loo/MANIFEST.json']) {
    const m = read(manifest);
    for (const f of m.files) {
      const absolute = path.join(app, manifest.includes('/loo/') ? 'validate/loo' : '', f.path);
      const data = readFileSync(absolute), hash = createHash('sha256').update(data).digest('hex');
      assert.equal(data.length,f.bytes); assert.equal(hash,f.sha256);
      outputs.hashes.push({manifest,path:f.path,sha256:hash,bytes:data.length});
    }
  }
  for (const tier of ['primary','plus']) {
    const corpus = read(tier === 'primary' ? 'validate/corpus/corpus.json' : 'validate/plus/corpus.json');
    assert.equal(corpus.length,169);
    for (const c of corpus) {
      const csv = c.te.map((t,i)=>`${t},${c.se[i]},Study ${i+1}`).join('\n');
      h.window.__almLimitValidationRun(csv,true);
      const result = h.window._almLastLimit();
      assert.ok(result,c.id);
      if (tier === 'primary') outputs.primary.push({id:c.id,result:structuredClone(result),
        dom:['body','plot','limit-error','limit-range-note','limit-diagnostics'].map(id=>h.nodes[id].innerHTML),
        exported:structuredClone(h.window.alm.exportOptions.getResults()),
        receipt:structuredClone(h.window.alm.plotOptions.getReceiptInput())});
      else outputs.plus.push({id:c.id,results:h.window.AlmLimitPlus.compute(c,result)});
    }
  }
  const corpus = read('validate/loo/corpus.json');
  assert.equal(corpus.length,165);
  for (const c of corpus) {
    const rows = c.te.map((te,i)=>({te,se:c.se[i],label:'Study '+(i+1)}));
    const result = l.window.AlmLimitLoo.compute(rows);
    outputs.loo.push(...result.rows.map(r=>({id:c.id,k:rows.length,...r})));
  }
  assert.equal(outputs.loo.length,5304);
  return outputs;
}
