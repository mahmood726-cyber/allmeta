import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {numeric, unzip, crc32, resolvePart, quote, toCSV} = require('../xlsx-import.js');
const fixture = name => new Uint8Array(readFileSync(new URL('./addons-a2-fixtures/'+name, import.meta.url)));
for (const value of ['0.12345678901234567','1.0000000000000002','5e-324','1.7976931348623157e308','-2.2250738585072014e-308','9007199254740991']) {
  test('raw double round trip '+value, () => {
    const bits = n => { const b = Buffer.alloc(8); b.writeDoubleLE(Number(n)); return b.toString('hex'); };
    assert.equal(bits(numeric(value)), bits(value));
    assert.notEqual(bits(Number(value) === 5e-324 ? '0' : Number(value)*0.5), bits(value));
  });
}
for (const value of ['NaN','Infinity','1e309','0x10','',' 1 ','1,000']) test('refuses numeric '+JSON.stringify(value), () => assert.throws(() => numeric(value), /invalid numeric/));
test('stored and deflated archives decode identically', async () => {
  const a = await unzip(fixture('precision.xlsx')), b = await unzip(fixture('stored.xlsx'));
  assert.deepEqual(a,b);
  assert.match(new TextDecoder().decode(a.get('xl/worksheets/sheet1.xml')), /1.0000000000000002/);
});
for (const [name, error] of [['crc',/CRC/],['truncated',/invalid ZIP/],['expanded-limit',/oversized/],['traversal',/unsafe/]]) {
  test('ZIP refusal '+name, async () => assert.rejects(unzip(fixture(name+'.xlsx')),error));
}
test('rejects oversized file before reading bytes', async () => {
  await assert.rejects(toCSV({size:52428801,arrayBuffer(){throw Error('must not read');}}),/50 MB/);
});
test('rejects legacy XLS before reading bytes', async () => {
  await assert.rejects(toCSV({name:'old.XLS',size:1,arrayBuffer(){throw Error('must not read');}}),/not supported/);
});
test('relationships resolve package absolute and relative paths', () => {
  assert.equal(resolvePart('xl/workbook.xml','/xl/worksheets/sheet1.xml'),'xl/worksheets/sheet1.xml');
  assert.equal(resolvePart('xl/workbook.xml','worksheets/sheet1.xml'),'xl/worksheets/sheet1.xml');
  assert.throws(()=>resolvePart('xl/workbook.xml','../../bad'),/escapes/);
  assert.throws(()=>resolvePart('xl/workbook.xml','https://bad'),/unsupported/);
});
test('RFC4180 escaping and known CRC vector', () => {
  assert.equal(quote('a,"b"\nc'),'"a,""b""\nc"');
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
});