// Pages opened from a local copy (file://) cannot fetch() glossary.json, so method help
// went missing there. tooltips.js reads the same glossaries from glossary-data.js, a
// classic script that file:// allows. These tests pin that copy to the JSON files so
// the two cannot drift. Regenerate with: node tools/fileproto/build-glossary-data.cjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../../', import.meta.url);
const jsonFiles = readdirSync(dir).filter((f) => /^glossary(\.[a-z]{2})?\.json$/.test(f)).sort();

function loadData() {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('glossary-data.js', dir), 'utf8'), ctx);
  // Plain objects from this realm (vm objects carry another realm's prototypes).
  return JSON.parse(JSON.stringify(ctx.window.ALM_GLOSSARY_FILES));
}

test('glossary-data.js carries every glossary JSON file, equal as parsed data', () => {
  assert.ok(jsonFiles.includes('glossary.json') && jsonFiles.length >= 2, 'expected the glossary JSON files');
  const data = loadData();
  assert.deepEqual(Object.keys(data).sort(), jsonFiles);
  for (const f of jsonFiles) assert.deepEqual(data[f], JSON.parse(readFileSync(new URL(f, dir), 'utf8')), f + ' drifted from glossary-data.js');
});

test('tooltips.js reads glossary-data.js instead of fetch() on file://', () => {
  const src = readFileSync(new URL('tooltips.js', dir), 'utf8');
  assert.ok(src.includes("location.protocol === 'file:'"), 'tooltips.js has no file:// branch');
  assert.ok(src.includes('glossary-data.js'), 'tooltips.js does not read glossary-data.js');
});
