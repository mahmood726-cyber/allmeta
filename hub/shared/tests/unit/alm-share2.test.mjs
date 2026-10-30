// V2 codec and guarded restore tests. Planted defects must never reach set().
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
require('../../../../shared/url-pack.js');
const S = require('../../../../shared/alm-share.js');
const codec = require('../../../../shared/vendor/share-deflate.js');
const B = require('../../../../shared/build-info.js');
const app = 'proportion-ma';
const state = { src: '12,150,\u65e5\u672c \ud83d\udcca\n8,90,Smith \u2013 2019', trans: 'ft', tau: 'DL' };
const provenance = [{ label: '\u00c9tude', pastedText: '12/150 \u00b7 8%', confirmed: true, values: [{ span: [0, 2], text: '12', value: 12 }] }];
const fixture = () => S.payload(app, state, provenance);
const packIndependent = p => {
  const bytes = Buffer.from(JSON.stringify(p));
  return createHash('sha256').update(bytes).digest('hex').slice(0, 8) + '.' + deflateRawSync(bytes).toString('base64url');
};
test('v2 unicode, every option and provenance round-trip; independent zlib/SHA-256 verification', async () => {
  const p = fixture(), packed = await S.encodeV2(p);
  assert.deepEqual(await S.decodeV2(packed, app), p);
  const raw = inflateRawSync(Buffer.from(packed.slice(9), 'base64url'));
  assert.deepEqual(JSON.parse(raw.toString()), p);
  assert.equal(packed.slice(0, 8), createHash('sha256').update(raw).digest('hex').slice(0, 8));
  assert.deepEqual(await S.decodeV2(packIndependent(p), app), p);
  assert.deepEqual(S.parseFile(JSON.stringify(p, null, 2), app), p);
});
test('PLANTED: character flip, checksum flip, truncation and base64 garbage refuse before set()', async () => {
  const packed = await S.encodeV2(fixture());
  let calls = 0;
  const block = { get: () => ({}), set: () => { calls++; } };
  const mid = Math.floor(packed.length / 2);
  const bad = [
    packed.slice(0, mid) + (packed[mid] === 'A' ? 'B' : 'A') + packed.slice(mid + 1),
    (packed[0] === '0' ? '1' : '0') + packed.slice(1),
    packed.slice(0, -10), packed + '!', 'garbage', '', '00000000.A'
  ];
  for (const s of bad) {
    await assert.rejects(S.openHash('#a2=' + s, app, block), /checksum|invalid|corrupt|truncated|length/i);
    assert.equal(calls, 0);
  }
  console.log('SHARE2 planted corrupt links refused; set calls=' + calls);
});
test('exact fragment threshold: 8000 produces link, 8001 selects file fallback', () => {
  assert.equal(S.MAX_FRAGMENT, 8000);
  assert.equal(S.makeLinkV2('https://example.org/a#old', 'x'.repeat(7996)).split('#')[1].length + 1, 8000);
  assert.throws(() => S.makeLinkV2('https://example.org/a', 'x'.repeat(7997)), e => e.code === 'TOO_LARGE' && e.length === 8001);
  // The page URL does not count towards the fragment limit.
  assert.ok(S.makeLinkV2('https://example.org/' + 'x'.repeat(9000), 'abc').endsWith('#a2=abc'));
});
test('version or SHA mismatch requires explicit confirmation for links and files', async () => {
  let calls = 0;
  const block = { get: () => state, set: () => { calls++; } };
  for (const build of [{ version: B.version, sha: 'f'.repeat(40) }, { version: 'v0.0.1', sha: B.sha }]) {
    const p = S.payload(app, state, provenance, build);
    assert.equal(S.versionMismatch(p), true);
    assert.equal((await S.openHash('#a2=' + await S.encodeV2(p), app, block)).pending, true);
    assert.equal(calls, 0);
    assert.equal((await S.restore(S.parseFile(JSON.stringify(p), app), app, block)).pending, true);
    assert.equal(calls, 0);
    assert.match(S.versionNotice(p), /^This link was made with allmeta .*; you are using .*Results may differ\.$/);
  }
  const p = S.payload(app, state, provenance, { version: 'v0.0.1', sha: 'f'.repeat(40) });
  await S.restore(p, app, block, { allowMismatch: true });
  assert.equal(calls, 1);
  assert.equal(S.archiveURL(p), 'https://github.com/mahmood726-cyber/allmeta/releases/tag/v0.0.1');
  p.build.version = 'development';
  assert.equal(S.archiveURL(p), 'https://github.com/mahmood726-cyber/allmeta/tree/' + 'f'.repeat(40));
  assert.equal(S.versionMismatch(fixture()), false);
});
test('restore awaits adapter, restores provenance, and suppresses URL writes', async () => {
  const previous = globalThis.alm;
  let guarded = false, received;
  globalThis.alm = { urlState: { withoutWrites: async fn => { guarded = true; try { return await fn(); } finally { guarded = false; } } } };
  try {
    await S.restore(fixture(), app, { get: () => state, set: async s => { await Promise.resolve(); assert.equal(guarded, true); received = s; } });
    assert.deepEqual(received, state);
    assert.deepEqual(globalThis.AlmFeaturesState.provenance, provenance);
  } finally { globalThis.alm = previous; }
});
test('adapter validation errors preserve state and provenance; asynchronous failures roll back', async () => {
  const original = { src: 'original', trans: 'raw', tau: 'FE' };
  let current = original;
  globalThis.AlmFeaturesState.provenance = [{ label: 'original' }];
  const block = { get: () => current, set: async s => {
    current = s;
    if (s !== original && s.src !== original.src) throw new Error('planted adapter failure');
  } };
  await assert.rejects(S.restore(fixture(), app, block), /planted adapter failure/);
  assert.deepEqual(current, original);
  assert.deepEqual(globalThis.AlmFeaturesState.provenance, [{ label: 'original' }]);
});
test('legacy #s= links still restore; malformed legacy links refuse', async () => {
  let calls = 0;
  const block = { get: () => state, set: s => { assert.deepEqual(s, state); calls++; } };
  await S.openHash('#s=' + await S.encode(app, state, provenance), app, block);
  assert.equal(calls, 1);
  assert.deepEqual(globalThis.AlmFeaturesState.provenance, provenance);
  await assert.rejects(S.openHash('#s=broken!!', app, block), /invalid/);
  assert.equal(calls, 1);
});
test('pure-JS fallback works without either CompressionStream, interoperates with native zlib', async () => {
  const cs = globalThis.CompressionStream, ds = globalThis.DecompressionStream;
  try {
    globalThis.CompressionStream = undefined; globalThis.DecompressionStream = undefined;
    const p = fixture(), packed = await S.encodeV2(p);
    assert.deepEqual(await S.decodeV2(packed, app), p);
    for (let removed = 1; removed <= 12; removed++) {
      await assert.rejects(S.decodeV2(packed.slice(0, -removed), app), /invalid|corrupt|truncated|checksum/);
    }
    assert.deepEqual(await S.decodeV2(packIndependent(p), app), p);
    assert.deepEqual(JSON.parse(inflateRawSync(Buffer.from(packed.slice(9), 'base64url')).toString()), p);
    for (const n of [0, 1, 256, 65536]) {
      const raw = Uint8Array.from({ length: n }, (_, i) => (i * 79 + (i >>> 3)) & 255);
      assert.deepEqual(Buffer.from(codec.inflateRaw(deflateRawSync(raw))), Buffer.from(raw));
      assert.deepEqual(inflateRawSync(codec.deflateRaw(raw)), Buffer.from(raw));
    }
  } finally { globalThis.CompressionStream = cs; globalThis.DecompressionStream = ds; }
});
test('PLANTED: wrong app, malformed payload/file, unknown version and build refuse before set()', async () => {
  let calls = 0;
  const block = { get: () => state, set: () => { calls++; } };
  for (const edit of [p => { p.app = 'dta-sroc'; }, p => { p.v = 3; }, p => { p.state = []; },
    p => { p.provenance = [1]; }, p => { delete p.build; }, p => { p.build.sha = '../evil'; }]) {
    const p = fixture(); edit(p);
    assert.throws(() => S.parseFile(JSON.stringify(p), app));
    await assert.rejects(S.openHash('#a2=' + packIndependent(p), app, block));
    assert.equal(calls, 0);
  }
  assert.throws(() => S.parseFile('{', app));
});
test('file name and supplementary-material text pin the payload identity', () => {
  const p = fixture(), name = S.filename(p, new Date('2026-10-21T12:00:00Z'));
  assert.equal(name, 'proportion-ma-analysis-20261021.json');
  assert.equal(S.reproduction(p, 'https://example.org/#a2=x'),
    'Analysis reproducible at https://example.org/#a2=x (allmeta proportion-ma ' + B.version + ', commit ' + B.sha.slice(0, 7) + '; open in a browser, no installation needed).');
  assert.match(S.reproduction(p, null, name), /reproducible from the attached file proportion-ma-analysis-20261021.json/);
});

test('proportion adapter includes axis controls and refuses invalid input before any mutation', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const controls = [{ value: '', dispatchEvent() {} }, { value: '', dispatchEvent() {} }, { checked: false, dispatchEvent() {} }];
  let runs = 0, registered;
  const nodes = {
    src: { value: '12,150,A\n8,90,B' }, trans: { value: 'logit' }, 'tau-est': { value: 'PM' },
    'alm-axis-mount': { querySelectorAll: () => controls }, 'btn-run': { click: () => { runs++; } }
  };
  runInNewContext(readFileSync(new URL('../../../../proportion-ma/alm-features.js', import.meta.url), 'utf8'), {
    AlmFeatures: { register: (app, spec) => { registered = spec; } },
    document: { getElementById: id => nodes[id] }, Event
  });
  const share = registered.share, plain = x => JSON.parse(JSON.stringify(x));
  const initial = plain(share.get());
  for (const bad of [
    { ...initial, tau: 'bad' }, { ...initial, trans: 'bad' }, { ...initial, src: 'invalid data' },
    { ...initial, axis: { x: [1, 0], xLog: false } },
    { ...initial, axis: { x: [NaN, 1], xLog: false } },
    { ...initial, axis: { x: [0, 1], xLog: 'false' } }
  ]) {
    assert.throws(() => share.set(bad));
    assert.deepEqual(plain(share.get()), initial);
    assert.equal(runs, 0);
  }
  const changed = { ...state, axis: { x: [0, 0.8], xLog: true } };
  share.set(changed);
  assert.deepEqual(plain(share.get()), changed);
  assert.equal(runs, 1);
  share.set(state); // legacy links have no axis field: restore the original automatic axes.
  assert.deepEqual(plain(share.get()).axis, { x: [null, null], xLog: false });
});

test('proportion data accepted by the v2 codec restores through both links and files', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const controls = [{ value: '', dispatchEvent() {} }, { value: '', dispatchEvent() {} }, { checked: false, dispatchEvent() {} }];
  let share, runs = 0;
  const nodes = {
    src: { value: '12,150,A\n8,90,B' }, trans: { value: 'logit' }, 'tau-est': { value: 'PM' },
    'alm-axis-mount': { querySelectorAll: () => controls }, 'btn-run': { click: () => { runs++; } }
  };
  runInNewContext(readFileSync(new URL('../../../../proportion-ma/alm-features.js', import.meta.url), 'utf8'), {
    AlmFeatures: { register: (_app, spec) => { share = spec.share; } },
    document: { getElementById: id => nodes[id] }, Event
  });
  const initial = JSON.parse(JSON.stringify(share.get()));
  // A long study label compresses well. The exporter accepts it, but the old
  // adapter's independent 200,000-character cap rejected its own exported state.
  nodes.src.value = '12,150,' + 'Study '.repeat(34000) + '\n8,90,B';
  const expected = JSON.parse(JSON.stringify(share.get()));
  assert.ok(expected.src.length > 200000);
  const p = S.payload(app, expected, provenance);
  const link = S.makeLinkV2('https://example.org/proportion-ma/', await S.encodeV2(p));
  assert.ok(link.slice(link.indexOf('#')).length <= 8000);
  share.set(initial);
  await S.openHash(link.slice(link.indexOf('#')), app, share);
  assert.deepEqual(JSON.parse(JSON.stringify(share.get())), expected);
  share.set(initial);
  await S.restore(S.parseFile(JSON.stringify(p, null, 2), app), app, share);
  assert.deepEqual(JSON.parse(JSON.stringify(share.get())), expected);
  assert.equal(runs, 4);
});
