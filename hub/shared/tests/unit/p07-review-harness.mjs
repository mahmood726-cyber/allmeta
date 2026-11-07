// Execute the existing test bodies with explicit, in-memory source substitutions.
// No checkout files, assertions, numerical references or tolerances are rewritten.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

export function unitCases(name, substitute = (url, bytes) => bytes) {
  const url = new URL(name, import.meta.url);
  const cases = [];
  const source = readFileSync(url, 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replaceAll('import.meta.url', 'testURL');
  const read = (file, encoding) => {
    const bytes = substitute(new URL(file), readFileSync(file));
    return encoding ? bytes.toString(encoding) : bytes;
  };
  vm.runInNewContext(source, {
    test: (name, run) => cases.push({ name, run }), assert, readFileSync: read,
    createHash, vm, URL, structuredClone, testURL: url.href,
  }, { filename: url.pathname });
  return cases;
}

export async function usabilityAnnotations() {
  const url = new URL('../multilevel-ma-usability.spec.mjs', import.meta.url);
  const cases = [];
  let annotations;
  const test = (name, run) => cases.push({ name, run });
  test.describe = (name, run) => run();
  test.describe.configure = () => {};
  test.fail = (condition, reason) => { if (condition) annotations.push(reason); };
  const source = readFileSync(url, 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replaceAll('import.meta.url', 'testURL');
  vm.runInNewContext(source, { test, URL, testURL: url.href });
  const result = new Map();
  const stop = new Error('Stop before browser I/O');
  for (const { name, run } of cases.filter(c => c.name.startsWith('4 '))) {
    annotations = [];
    const page = { on() {}, async goto() { throw stop; } };
    await assert.rejects(run({ page }, {}), error => error === stop);
    result.set(name, annotations);
  }
  return result;
}
