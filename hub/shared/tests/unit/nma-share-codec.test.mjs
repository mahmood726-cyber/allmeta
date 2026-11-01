import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import vm from 'node:vm';

const page = new URL('../../../../nma/index.html', import.meta.url);
const html = readFileSync(page, 'utf8');
const codec = '../shared/vendor/share-deflate.js';
const shareScripts = new Set(['../shared/build-info.js', codec, '../shared/alm-share.js']);
const data = readFileSync(new URL('./tests/fixtures/nma-tiny.csv', page), 'utf8');

// Use the page's actual script list and browser globals. CommonJS require would
// load the fallback automatically and hide a missing browser script dependency.
function load({ native = false, omitCodec = false } = {}) {
  const context = vm.createContext({
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob, atob, btoa,
    crypto: webcrypto,
    CompressionStream: native ? CompressionStream : undefined,
    DecompressionStream: native ? DecompressionStream : undefined,
  });
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)) {
    if (!shareScripts.has(src) || (omitCodec && src === codec)) continue;
    vm.runInContext(readFileSync(new URL(src, page), 'utf8'), context, { filename: src });
  }
  assert.ok(context.AlmShare, 'The NMA page must load the share module');
  return context.AlmShare;
}

function payload(share) {
  return share.payload('nma', {
    data, ref: 'A', model: 're', ci: 't-dist', dir: 'undesirable', scale: 'exp',
    title: 'NMA codec control — Étude 日本', example: 'generic', entryLog: [],
  }, []);
}

const plain = value => JSON.parse(JSON.stringify(value));

async function roundTrip(share) {
  const original = payload(share);
  const packed = await share.encodeV2(original);
  assert.deepEqual(plain(await share.decodeV2(packed, 'nma')), plain(original));
  // An independent decoder must recover the exact fixture and options too.
  assert.deepEqual(JSON.parse(inflateRawSync(Buffer.from(packed.slice(9), 'base64url')).toString('utf8')), plain(original));
  return packed;
}

test('NMA page scripts round-trip Share v2 without browser compression APIs', async () => {
  await roundTrip(load());
});

test('CONTROL: native compression round-trips NMA state without the fallback', async () => {
  await roundTrip(load({ native: true, omitCodec: true }));
});

test('PLANTED: removing the NMA fallback script breaks offline creation and restore', async () => {
  const packed = await roundTrip(load({ native: true, omitCodec: true }));
  const broken = load({ omitCodec: true });
  await assert.rejects(broken.encodeV2(payload(broken)), /offline compression library is unavailable/);
  await assert.rejects(broken.decodeV2(packed, 'nma'), /offline compression library is unavailable/);
});
