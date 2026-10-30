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
  // Re-pinned deliberately: once for the IPD_OUTCOME import (unit/revman-reader-ipd.test.mjs), and again for CONT_OUTCOME /
  // IV_OUTCOME import, child-element NAME/GROUP_LABEL + YEAR, and the explicit outcome.skipped list
  // (unit/revman-reader-legacy.test.mjs). Same strictness: exact CRLF and LF bytes; any other edit still fails here.
  const expected=['235fc47bb8b98cc6c71e353a37c1cd547ec85c22fafa2ba183cfd3f79fbf025b','f756b108b65a5ffb8f86b007ff18e419b14aaffa27bce920f4590f9c16f8e401'];
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
