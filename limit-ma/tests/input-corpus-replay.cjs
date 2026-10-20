// Before/after equality, not a substitute for the pinned R/browser validation tiers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {load} = require('./input-harness.cjs');
const root = path.join(__dirname,'..');
const original = process.argv[2];
if (!original) throw Error('Usage: node input-corpus-replay.cjs ORIGINAL_PAGE [ORIGINAL_PLUS_UI]');
const before = load(original,process.argv[3]), after = load();
let hashes = 0, parsed = 0, replayed = 0, sensitivity = 0;
function capture(h) {
  return JSON.stringify({result:h.window._almLastLimit(),
    dom:['body','plot','limit-error','limit-range-note','limit-diagnostics'].map(id=>h.nodes[id].innerHTML),
    exported:h.window.alm.exportOptions.getResults(),receipt:h.window.alm.plotOptions.getReceiptInput()});
}
for (const [tier, manifest] of [['primary','MANIFEST.json'],['plus','MANIFEST-plus.json']]) {
  const m = JSON.parse(fs.readFileSync(path.join(root,'validate',manifest),'utf8'));
  for (const file of m.files) {
    const bytes = fs.readFileSync(path.join(root,file.path));
    assert.equal(bytes.length,file.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256); hashes++;
  }
  const corpus = JSON.parse(fs.readFileSync(path.join(root,m.files[0].path),'utf8'));
  assert.equal(corpus.length,169);
  let rows = 0;
  for (const c of corpus) {
    const text = c.te.map((x,i)=>`${x}, ${c.se[i]}, row ${c.source_rows[i]}`).join('\n');
    const oldRows = before.parse(text), newRows = after.parse(text);
    assert.equal(oldRows.length,c.k,c.id);assert.equal(newRows.length,c.k,c.id);
    assert.equal(JSON.stringify(newRows),JSON.stringify(oldRows),c.id+' parsed rows');parsed++;rows+=c.k;
    before.window.__almLimitValidationRun(text,true);after.window.__almLimitValidationRun(text,true);
    assert.ok(before.window._almLastLimit(),c.id+' original fit');
    assert.equal(capture(after),capture(before),c.id+' exact page outputs');replayed++;
    if(tier==='plus') {
      const input = {...c,te:newRows.map(r=>r.te),se:newRows.map(r=>r.se)};
      const a = after.window.AlmLimitPlus.compute(input,after.window._almLastLimit());
      const b = before.window.AlmLimitPlus.compute(c,before.window._almLastLimit());
      assert.equal(JSON.stringify(a),JSON.stringify(b),c.id+' sensitivity outputs');sensitivity++;
    }
  }
  console.log(`${tier}: 169/169 inputs accepted with exactly identical parsed rows (${rows}/${rows} rows); 169/169 byte-identical page result/table/funnel/diagnostics/export outputs`);
}
console.log(`Pinned hashes: ${hashes}/4; parser configurations: ${parsed}/338; page replays: ${replayed}/338; sensitivity outputs: ${sensitivity}/169`);
