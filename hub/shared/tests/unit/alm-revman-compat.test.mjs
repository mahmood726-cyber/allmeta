import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const legacy=readFileSync(new URL('../../../../shared/revman-reader.js',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');

test('legacy reader retains the supplied bytes under the repository platform line-ending policy',()=>{
  // .gitattributes permits platform-default source endings. These are the exact
  // supplied CRLF bytes and the same source with LF, not a whitespace-insensitive hash.
  const expected=['182217cdcb4da3c807154ae71d0f0436c2702eb6801ae01d83d303d5d6d4375d','6fa1d97a6258cc6d42c05a26a4a49d5848e7420d50616813e409e2511af0ae83'];
  assert.ok(expected.includes(hash(legacy)));
  assert.equal(expected.includes(hash(Buffer.concat([legacy,Buffer.from('// planted rewrite')]))),false);
});

test('v2 parser is separate and never overwrites the legacy exports',()=>{
  const old=require('../../../../shared/revman-reader.js'),before={...old};
  const extension=require('../../../../shared/alm-revman.js');
  assert.ok(extension.reader);
  assert.notEqual(extension.reader.parse,old.parse);
  assert.deepEqual(old,before);
  assert.deepEqual(Object.keys(old).sort(),['_isZip','_parseXmlString','comparisonToBus','parse']);
  assert.equal(globalThis.RevmanReader,old);
});

test('fallback features host is appended outside main/results, with planted old placement rejected',()=>{
  const source=readFileSync(new URL('../../../../shared/alm-revman.js',import.meta.url),'utf8');
  const safe=s=>!s.includes("(document.querySelector('main')||document.body).appendChild(n)")&&s.includes('document.body.appendChild(n)');
  assert.equal(safe(source),true);
  assert.equal(safe(source+"(document.querySelector('main')||document.body).appendChild(n)"),false);
});
