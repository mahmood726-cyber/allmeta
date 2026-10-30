// Wrapper commands have a 20-minute limit. Run eight bounded shards first, then
// this file to require complete coverage and every original aggregate assertion.
// The single-process entrypoint remains p05-qprofile-replay.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, root } from './p05-qprofile-harness.mjs';
import { loadPublicationInputs, replayPublication, checkPublicationResult } from './p05-qprofile-replay.mjs';

const corpusKey = 'validate/corpus/corpus.json', referenceKey = 'validate/corpus/reference.json';
const loaded = loadPublicationInputs(); // Verify full original hashes before partitioning.
const corpus = loaded[corpusKey], shardCount = 8;
// Balance cost without changing any case, estimator or comparison.
const shards = Array.from({ length: shardCount }, () => ({ cost: 0, indices: [] }));
for (const index of corpus.map((_, index) => index).sort((a, b) => corpus[b].k ** 2 - corpus[a].k ** 2)) {
  const shard = shards.reduce((a, b) => a.cost <= b.cost ? a : b);
  shard.indices.push(index);
  shard.cost += corpus[index].k ** 2;
}
for (const shard of shards) shard.indices.sort((a, b) => a - b);
const unit = 'hub/shared/tests/unit/';
const inputs = ['shared/ma-core.js', 'shared/heterogeneity-ci.js', 'shared/alm-validate.js',
  'heterogeneity/index.html', 'hub/shared/results-export.js', 'heterogeneity/validate/adapter.js',
  'heterogeneity/validate/MANIFEST.json', 'heterogeneity/' + corpusKey, 'heterogeneity/' + referenceKey,
  ...['harness.mjs', 'replay.mjs', 'publication-check.mjs'].map(name => unit + 'p05-qprofile-' + name)];
const hash = createHash('sha256');
for (const path of inputs) hash.update(path + '\0').update(read(path).replace(/\r\n/g, '\n')).update('\0');
const fingerprint = hash.digest('hex');
const workspace = createHash('sha256').update(root.href).digest('hex').slice(0, 16);
const pointer = join(tmpdir(), `p05-publication-${workspace}.json`);
function evidence() {
  const state = JSON.parse(readFileSync(pointer, 'utf8'));
  assert.equal(state.fingerprint, fingerprint, 'Sources changed: restart from publication shard 0');
  assert.deepEqual(state.shards, shards.map(s => s.indices));
  return state;
}

if (!isMainThread) {
  const c = corpus[workerData.index];
  assert.equal(workerData.fingerprint, fingerprint);
  assert.equal(c.id, workerData.id);
  const result = await replayPublication({
    [corpusKey]: [c], [referenceKey]: loaded[referenceKey].filter(r => r.analysis === c.id)
  }, () => {});
  parentPort.postMessage({ index: workerData.index, id: c.id, result });
}

export async function runPublicationShard(shard) {
  assert.ok(Number.isInteger(shard) && shard >= 0 && shard < shardCount);
  if (shard === 0) {
    // Always start fresh; earlier partial runs are never silently reused.
    const scratch = mkdtempSync(join(tmpdir(), 'p05-publication-'));
    writeFileSync(pointer, JSON.stringify({ scratch, fingerprint, shards: shards.map(s => s.indices) }));
  }
  const { scratch } = evidence(), indices = shards[shard].indices;
  console.log('Publication shard:', shard, 'cases:', indices.length, 'evidence:', scratch);
  const messages = [];
  let next = 0;
  async function consume() {
    while (next < indices.length) {
      const index = indices[next++], c = corpus[index], started = Date.now();
      const message = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { index, id: c.id, fingerprint } });
        let message;
        worker.once('message', value => { message = value; });
        worker.once('error', reject);
        worker.once('exit', code => code === 0 && message ? resolve(message) : reject(new Error(`Worker ${c.id} exited ${code}`)));
      });
      assert.equal(message.index, index);
      assert.equal(message.id, c.id);
      writeFileSync(join(scratch, `case-${index}.json`), JSON.stringify(message));
      assert.equal(message.result.passed, message.result.checks);
      assert.deepEqual(message.result.failed, []);
      assert.deepEqual(message.result.displayFails, []);
      messages.push(message);
      console.log('P05_PUBLICATION_CASE', index, c.id, 'checks', message.result.checks,
        'elapsed_ms', Date.now() - started);
    }
  }
  await Promise.all(Array.from({ length: 2 }, consume));
  messages.sort((a, b) => a.index - b.index);
  assert.deepEqual(messages.map(m => m.index), indices);
  writeFileSync(join(scratch, `shard-${shard}.json`), JSON.stringify({ fingerprint, shard, messages }));
  console.log('P05_PUBLICATION_SHARD_COMPLETE', shard, 'full-corpus validation still requires the aggregate check');
}

export function aggregatePublication() {
  const { scratch } = evidence(), results = new Array(corpus.length);
  for (let shard = 0; shard < shardCount; shard++) {
    const record = JSON.parse(readFileSync(join(scratch, `shard-${shard}.json`), 'utf8'));
    assert.equal(record.fingerprint, fingerprint);
    assert.equal(record.shard, shard);
    assert.deepEqual(record.messages.map(m => m.index), shards[shard].indices);
    for (const message of record.messages) {
      assert.equal(message.id, corpus[message.index].id);
      assert.equal(results[message.index], undefined, 'No case may be counted twice');
      results[message.index] = message.result;
    }
  }
  assert.equal(results.filter(Boolean).length, corpus.length, 'Every corpus case is required');
  const total = { checks: 0, passed: 0, displayed: 0, failed: [], displayFails: [], emptySets: [],
    maxima: { REL: 0, ABS: 0, EXACT: 0 }, refusals: { configurations: 0, refused: 0, compared: 0 } };
  for (const result of results) {
    for (const key of ['checks', 'passed', 'displayed']) total[key] += result[key];
    for (const key of ['failed', 'displayFails', 'emptySets']) total[key].push(...result[key]);
    for (const key of Object.keys(total.maxima)) total.maxima[key] = Math.max(total.maxima[key], result.maxima[key]);
    for (const key of Object.keys(total.refusals)) total.refusals[key] += result.refusals[key];
  }
  writeFileSync(join(scratch, 'aggregate.json'), JSON.stringify(total));
  checkPublicationResult(total); // All original full-corpus totals and tolerances apply.
  assert.deepEqual(total.refusals, { configurations: 704, refused: 28, compared: 676 });
  assert.deepEqual(total.emptySets, ['dat.axfors2021#1', 'dat.axfors2021#2', 'dat.nissen2007#1', 'dat.nissen2007#2']);
  console.log('P05 publication evidence:', scratch);
}

if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  aggregatePublication();
}
