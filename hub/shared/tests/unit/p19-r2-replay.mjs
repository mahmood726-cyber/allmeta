// Replay the same, unmodified assertions against the supplied PR head and fix.
// No historical pre-PR source is available; this does not impersonate it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { run } from 'node:test';

const root = new URL('../../../../', import.meta.url);
const canonical = url => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
const headScript = canonical(new URL('fixtures/p19-r2-pr-head-inline.txt', import.meta.url));
const fixedHTML = canonical(new URL('component-nma/index.html', root));
const currentScript = [...fixedHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('function fit(rows)'));
assert.ok(currentScript && headScript.includes('function fit(rows)'));
const headHTML = fixedHTML.replace(currentScript, () => headScript);
assert.equal(createHash('sha256').update(headHTML).digest('hex'),
  'c9dc80c8d6cf9254abe796d21ca810dc140dc578d78672a8912d8a6445656db4',
  'reconstructed page must exactly match the supplied original PR head in LF');

const unitPath = 'hub/shared/tests/unit/';
const sharedFiles = [
  'hub/shared/results-export.js',
  'component-nma/tests/fixtures/cnma-validation-oracle.json',
  ...['p19-review-defects.test.mjs', 'p19-provenance.test.mjs',
    'p19-scale-defect.test.mjs', 'p19-scale-reference.R', 'p19-scale-reference.json',
    'p19-f2-reference.json', 'p19-r2-reference.json'].map(name => unitPath + name),
];
const expectedFailures = [
  'plant P19-R2 follow-up: implied combination overflows clears display and every export',
  'plant P19-R2 follow-up: forest span overflows clears display and every export',
  'plant P19-R2 follow-up: forest padding overflows clears display and every export',
  'plant P19-R2 follow-up: derived covariance sum cannot publish infinite uncertainty',
  'plant P19-R2 follow-up: tiny saturated fit retains finite sampling-variance results',
  'P19 provenance plant: CRLF checkout hashes canonical LF bytes',
].sort();
const work = mkdtempSync(join(tmpdir(), 'p19-r2-replay-'));
console.log(`Isolated replay files and diagnostics: ${work}`);
const totals = [];
for (const [name, html] of [['original-pr-head', headHTML], ['fixed', fixedHTML]]) {
  const destination = join(work, name);
  const put = (path, text) => {
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  put('component-nma/index.html', html);
  for (const file of sharedFiles) {
    let text = canonical(new URL(file, root));
    if (name === 'original-pr-head' && file.endsWith('p19-scale-defect.test.mjs')) {
      const fixedRead = "readFileSync(new URL('./p19-scale-reference.R', import.meta.url), 'utf8').replace(/\\r\\n/g, '\\n')";
      assert.equal(text.split(fixedRead).length, 2, 'find the sole hash canonicalization change');
      text = text.replace(fixedRead, "readFileSync(new URL('./p19-scale-reference.R', import.meta.url))");
    }
    put(file, text);
  }
  const failures = [], names = [], diagnostics = [];
  let passed = 0;
  for await (const event of run({ concurrency: 1, files: [
    join(destination, unitPath, 'p19-review-defects.test.mjs'),
    join(destination, unitPath, 'p19-provenance.test.mjs'),
  ] })) {
    if (!['test:pass', 'test:fail'].includes(event.type)) continue;
    const data = event.data;
    assert.ok(!data.skip && !data.todo, 'no skipped or todo cases');
    names.push(data.name);
    const label = event.type === 'test:pass' ? 'PASS' : 'FAIL';
    console.log(`${name} ${label}: ${data.name}`);
    if (label === 'PASS') passed++;
    else {
      failures.push(data.name);
      const error = data.details?.error;
      diagnostics.push(`${data.name}\n${error?.cause?.stack || error?.stack || error}`);
    }
  }
  writeFileSync(join(destination, 'failures.log'), diagnostics.join('\n\n'));
  console.log(`${name}: passed=${passed} failed=${failures.length}`);
  assert.ok(passed > 0);
  assert.deepEqual(failures.sort(), name === 'original-pr-head' ? expectedFailures : []);
  totals.push(names.sort());
}
assert.deepEqual(totals[0], totals[1], 'identical test selection on both sources');
console.log('PASS: six planted defects fail on the authenticated PR head and pass on the fix; all controls pass on both.');
