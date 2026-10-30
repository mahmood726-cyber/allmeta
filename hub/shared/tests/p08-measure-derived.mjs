// Read-only comparison; detailed evidence is written only to the system TEMP.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { engineVariant } from './p08-engine-variants.mjs';

const base = new URL('../../../meta-regression/', import.meta.url);
await import(new URL('validate/contract.js', base));
const read = name => JSON.parse(readFileSync(new URL(name, base), 'utf8'));
const corpus = read('validate/plus/corpus.json'), refs = read('validate/plus/reference.json');
const manifest = read('validate/MANIFEST-plus.json');
const recorded = read('validate/plus/numeric-evidence.json');
const source = readFileSync(new URL('plus-engine.js', base), 'utf8');
const html = readFileSync(new URL('index.html', base), 'utf8');
const lines = html.match(/<textarea id="plus-data"[^>]*>([\s\S]*?)<\/textarea>/)[1].trim().split(/\r?\n/);
const names = lines.shift().split(',').slice(2), rows = lines.map(line => line.split(',').map(Number));
const example = { names, yi: rows.map(r => r[0]), vi: rows.map(r => r[1]), mods: rows.map(r => r.slice(2)), interaction: false };
const results = {};
for (const variant of ['original', 'pr-head', 'fixed']) {
  const context = vm.createContext({});
  vm.runInContext(engineVariant(source, variant), context);
  const output = corpus.map(c => context.AlmMetaPlus.compute(c));
  let checks = 0;
  const maxima = {}, failures = [];
  output.forEach((actual, i) => {
    for (const row of AlmMetaPlusContract.audit(actual, refs[i].result)) {
      checks++;
      if (!row.pass) failures.push({ id: corpus[i].id, ...row });
      if (row.kind !== 'exact') maxima[row.key] = Math.max(maxima[row.key] || 0, row.diff);
    }
  });
  const defaultResult = context.AlmMetaPlus.compute(example);
  assert.equal(defaultResult.status, 'ok', defaultResult.reason);
  results[variant] = { checks, maxima, failures, output, defaultIntercept: defaultResult.full.beta[0],
    maxPValueDifference: Math.max(...Object.entries(maxima).filter(([key]) => /pval(?:\.|$)/.test(key)).map(([, value]) => value)) };
  console.log(JSON.stringify({ variant, checks, failed: failures.length, maxPValueDifference: results[variant].maxPValueDifference,
    defaultIntercept: results[variant].defaultIntercept, firstFailures: failures.slice(0,5) }));
}
const summaries = [];
for (const [before, after] of [['original','pr-head'],['original','fixed'],['pr-head','fixed']]) {
  const a = results[before], b = results[after];
  const changedMaxima = Object.keys(a.maxima).filter(key => a.maxima[key] !== b.maxima[key]);
  const changedConfigurations = a.output.filter((r, i) => JSON.stringify(r) !== JSON.stringify(b.output[i])).length;
  const summary = { before, after, changedConfigurations, changedMaxima: changedMaxima.length };
  summaries.push(summary); console.log(JSON.stringify(summary));
}
const mismatchedRecordedMaxima = Object.keys(recorded.maxima).filter(key => recorded.maxima[key] !== results.original.maxima[key]);
console.log(JSON.stringify({ originalMismatchedRecordedMaxima: mismatchedRecordedMaxima.length }));
const destination = join(mkdtempSync(join(tmpdir(), 'p08-derived-')), 'measurements.json');
writeFileSync(destination, JSON.stringify({ summaries, mismatchedRecordedMaxima, results }, null, 2) + '\n');
console.log('Detailed derived evidence: ' + destination);
for (const result of Object.values(results)) {
  assert.equal(result.checks, manifest.numericChecks);
  assert.deepEqual(result.failures, []);
}
