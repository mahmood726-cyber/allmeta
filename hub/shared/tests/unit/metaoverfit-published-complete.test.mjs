// A result must be complete when it is published. updateMetaoverfitResults used to run on a
// 500 ms timer after Run, mutating AppState.results in place, so a project saved inside that
// window stored metaoverfit {risk: 'unknown', skipped: true} and one saved after it stored the
// assessment. The same analysis could therefore save two different files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const wrappers = [
  'Truthcert1/TruthCert-PairwisePro-v1.0-production.html',
  'Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html',
  'Pairwiseai/TruthCert-PairwisePro-v1.0-dist.html',
  'Pairwiseai/TruthCert-PairwisePro-v1.0-min.html',
  'Pairwiseai/TruthCert-PairwisePro-v1.0-fast.html',
];
const engines = [
  'Truthcert1/app.min.js',
  'Pairwiseai/app.js',
  'Pairwiseai/app.min.js',
  'Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html',
  'Pairwiseai/TruthCert-PairwisePro-v1.0-dist.html',
  'Pairwiseai/TruthCert-PairwisePro-v1.0-min.html',
];

// Compiles the whole file, not a slice of it: one bad byte in an inline script kills every
// feature in that block, and a test that lifts out a single function cannot see it.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const inlineScripts = source => [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attrs]) => !/\bsrc\s*=/i.test(attrs) && !/\btype\s*=\s*["']?(?!text\/javascript)/i.test(attrs))
  .map(([, , body]) => body);

for (const path of [...new Set([...wrappers, ...engines])]) {
  test(`${path}: holds no control byte and every script compiles`, () => {
    const bytes = readFileSync(new URL(path, root)).toString('latin1');
    const hit = bytes.match(CONTROL);
    assert.equal(hit, null, hit && `control byte 0x${hit[0].charCodeAt(0).toString(16)} at offset ${hit.index}`);
    const source = read(path);
    const scripts = path.endsWith('.html') ? inlineScripts(source) : [source];
    assert.ok(scripts.length > 0, 'at least one script must be compiled');
    scripts.forEach((body, i) => assert.doesNotThrow(() => new vm.Script(body, { filename: `${path}#${i}` })));
  });
}

for (const path of wrappers) {
  test(`${path}: no timer rewrites a published result`, () => {
    assert.doesNotMatch(read(path), /setTimeout\(\s*updateMetaoverfitResults/);
  });
  test(`${path}: the assessment is synchronous and schedules nothing`, () => {
    const source = read(path);
    const start = source.indexOf('function updateMetaoverfitResults() {');
    const end = source.indexOf('// Update on analysis', start);
    assert.ok(start >= 0 && end > start, 'the real function must be exercised');
    const r = { yi: [0, 0, 0, 0, 0], vi: [1, 1, 1, 1, 1], tau2: 0, metaoverfit: { risk: 'unknown', skipped: true } };
    const context = vm.createContext({
      AppState: { results: r }, console: { log() {}, error(...a) { throw new Error(a.join(' ')); } },
      setTimeout() { throw new Error('the assessment must not schedule work after publication'); },
    });
    vm.runInContext(source.slice(start, end) + '\nupdateMetaoverfitResults();', context);
    assert.equal(r.metaoverfit.skipped, undefined);
    assert.equal(r.metaoverfit.k, 5);
    assert.equal(r.metaoverfit.ratio, 2.5);
    assert.equal(r.metaoverfit.risk_level, 'SEVERE');
  });
}

// applyProjectState also calls renderResults and must not refit, so the call belongs at the point
// runAnalysis publishes its result, not inside renderResults.
for (const path of engines) {
  test(`${path}: runAnalysis assesses before it renders, and a reopen does not`, () => {
    const source = read(path);
    const publish = source.match(/updateMetaoverfitResults\(\),\s*renderResults\(\),\s*document\.querySelector\('\[data-tab="analysis"\]'\)\.click\(\)/g);
    assert.equal(publish?.length, 1);
    assert.doesNotMatch(source.slice(source.indexOf('function renderResults')).slice(0, 400), /updateMetaoverfitResults/);
  });
}
