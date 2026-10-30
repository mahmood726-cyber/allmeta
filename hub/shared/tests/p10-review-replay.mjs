// Run from wt/: node hub/shared/tests/p10-review-replay.mjs
// The parent tree is unavailable. This plants the reviewed pre-P10 markup
// defect in a temporary copy; it does NOT authenticate or replay a PR parent.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const suite = 'hub/shared/tests/unit/p10-stale-live-region.test.mjs';
const lifecycle = 'hub/shared/analysis-lifecycle.js';
const page = 'mh-peto/index.html';
const lf = text => text.replace(/\r\n/g, '\n');
const read = path => readFileSync(join(root, path), 'utf8');
const sha256 = text => createHash('sha256').update(lf(text)).digest('hex');

export const plants = [
  'plant P10-R5: input exposes the stale warning inside an established polite live region',
  'plant P10-R5: change exposes the stale warning inside an established polite live region',
  'plant P10-R5: rerun clears the live warning and a later edit exposes it again'
];
export const controls = [
  'control P10-R5: success and input-error notices retain their live semantics',
  'control P10-R5: unchanged commits and unrelated inputs do not mark results stale',
  'control P10-R5: refused runs hide both notices and a successful rerun clears stale state'
];

function withoutLiveContainer(html) {
  const region = /^      <!-- Keep the live container exposed before the lifecycle reveals its warning\. -->\n      <div role="status" aria-live="polite" aria-atomic="true">\n        (<div id="analysis-stale" hidden>[^\n]+<\/div>)\n      <\/div>/gm;
  assert.equal([...lf(html).matchAll(region)].length, 1, 'exactly one reviewed P10 wrapper must be present');
  return lf(html).replace(region, '      $1');
}

export function replay({ plant = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'p10-review-'));
  const hashes = {};
  for (const path of [page, lifecycle, suite]) {
    const original = read(path);
    const source = plant && path === page ? withoutLiveContainer(original) : original;
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
    hashes[path] = { suppliedLF: sha256(original), replayLF: sha256(source) };
  }
  // A child `--test` run must not inherit the outer runner's context. Use the
  // absolute executable and an empty environment; no environment reads needed.
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', suite], {
    cwd: directory, encoding: 'utf8', timeout: 30000, env: {}
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, 'replay must finish normally');
  assert.equal(result.stderr, '', 'replay must not fail to load');
  writeFileSync(join(directory, 'unit.tap'), result.stdout);
  return { directory, hashes, status: result.status, output: result.stdout };
}

export function verify(result, plant) {
  const outcomes = [...result.output.matchAll(/^(not ok|ok) \d+ - (.+)$/gm)]
    .map(([, status, name]) => ({ status, name }));
  assert.deepEqual(outcomes, [...plants, ...controls].map((name, i) => ({
    status: plant && i < plants.length ? 'not ok' : 'ok', name
  })), 'only the three live-region requirements may fail in the planted replay');
  assert.equal(result.status, plant ? 1 : 0);
  assert.match(result.output, /^# tests 6$/m);
  assert.match(result.output, plant ? /^# pass 3$/m : /^# pass 6$/m);
  assert.match(result.output, plant ? /^# fail 3$/m : /^# fail 0$/m);
  assert.match(result.output, /^# skipped 0$/m);
  if (plant) {
    assert.equal((result.output.match(/error: 'visible stale warning must have live-region semantics on itself or an ancestor'/g) || []).length, 2);
    assert.equal((result.output.match(/error: 'stale transition needs a live region'/g) || []).length, 1);
    assert.notEqual(result.hashes[page].suppliedLF, result.hashes[page].replayLF);
  }
  for (const path of plant ? [suite, lifecycle] : [page, suite, lifecycle]) {
    assert.equal(result.hashes[path].suppliedLF, result.hashes[path].replayLF, path);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('P10 replay: reconstructed missing-live-container defect, NOT an authenticated PR-parent checkout.');
  const before = replay({ plant: true });
  const after = replay();
  for (const [label, result, plant] of [['planted', before, true], ['current', after, false]]) {
    console.log(label, JSON.stringify({ directory: result.directory, hashes: result.hashes }));
    console.log(result.output);
    verify(result, plant);
  }
  // Use the existing validator and frozen R corpus unchanged. Only its HTML
  // input differs; logs stay in the temporary replay directories.
  const numerical = [before, after].map(result => {
    const check = spawnSync(process.execPath, [join(root, 'mh-peto/validate/check-plus.mjs'), '--index', join(result.directory, page)], {
      cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024
    });
    if (check.error) throw check.error;
    writeFileSync(join(result.directory, 'numerical.txt'), check.stdout + check.stderr);
    assert.equal(check.signal, null);
    assert.equal(check.status, 0, check.stdout + check.stderr);
    return check.stdout;
  });
  assert.equal(numerical[0], numerical[1], 'removing only the P10 wrapper must leave validator output identical');
  console.log(numerical[1]);
  console.log('P10 REVIEW REPLAY PASS: three expected assertion failures, three passing controls, six current passes; numerical output identical.');
}
