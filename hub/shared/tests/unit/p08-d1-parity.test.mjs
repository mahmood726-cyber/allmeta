import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pageResult } from '../../../../meta-regression/tests/page-result.mjs';

const tests = new URL('../../../../meta-regression/tests/', import.meta.url);
const tiny = readFileSync(new URL('fixtures/mr-tiny.csv', tests), 'utf8');
const tolerance = 1e-6;
function close(actual, expected, key) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), key + ' must be finite');
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${key}: ${actual} versus ${expected} (tol=${tolerance})`);
}
function caller(directory) {
  const args = [fileURLToPath(new URL('capture-parity.py', tests))];
  if (directory) args.push(directory);
  const proc = spawnSync('python', args, { encoding: 'utf8', timeout: 60000 });
  assert.ifError(proc.error);
  assert.equal(proc.status, 0, proc.stderr);
  return JSON.parse(proc.stdout);
}

test('P08-D1 plant: legacy parity caller submits actual page uncertainty', () => {
  const actual = pageResult(tiny).result;
  const call = caller();
  assert.equal(call.tol, tolerance);
  close(call.result.slope_se, actual.slope_se, 'slope_se');
  assert.deepEqual(Object.keys(call.result).sort(), Object.keys(actual).sort());
  for (const key of Object.keys(actual)) close(call.result[key], actual[key], key);
});

test('P08-D1 control: point estimates agree even when the floor binds', () => {
  const actual = pageResult(tiny);
  assert.ok(actual.raw_q < 1);
  assert.equal(actual.q, 1);
  const call = caller();
  for (const key of ['intercept', 'slope', 'tau2', 'R2', 'k']) close(call.result[key], actual.result[key], key);
});

test('P08-D1 plant: parity caller responds to changed input', () => {
  const directory = mkdtempSync(join(tmpdir(), 'p08-d1-'));
  try {
    const shifted = tiny.trim().split(/\r?\n/).map((line, index) => {
      if (index === 0) return line;
      const fields = line.split(',');
      fields[1] = String(Number(fields[1]) + 1);
      return fields.join(',');
    }).join('\n') + '\n';
    writeFileSync(join(directory, 'mr-tiny.csv'), shifted);
    const original = caller().result;
    const changed = caller(directory).result;
    close(changed.intercept - original.intercept, 1, 'intercept must follow the input');
    close(changed.slope, original.slope, 'slope translation control');
    close(changed.slope_se, original.slope_se, 'SE translation control');
  } finally {
    unlinkSync(join(directory, 'mr-tiny.csv'));
    rmdirSync(directory);
  }
});

test('P08-D1 plant: live R fixture selects the page export convention', () => {
  const reference = readFileSync(new URL('fixtures/mr-tiny.R', tests), 'utf8');
  const html = readFileSync(new URL('../index.html', tests), 'utf8');
  assert.ok(html.includes('test = \\"adhoc\\"'), 'page exports PM/adhoc');
  assert.match(reference, /test\s*=\s*"adhoc"/);
});

const reference = JSON.parse(readFileSync(new URL('fixtures/p08-d1-reference.json', tests), 'utf8'));
function compareFields(actual, expected) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const key of Object.keys(expected)) close(actual[key], expected[key], key);
}

test('P08-D1 reference: real R provenance matches the generator and inputs', () => {
  assert.equal(reference.method, 'PM');
  assert.equal(reference.test, 'adhoc');
  assert.equal(reference.control.tol, 1e-12);
  assert.match(reference.provenance.R, /^R version /);
  assert.match(reference.provenance.metafor, /^\d+\.\d+/);
  assert.match(reference.provenance.jsonlite, /^\d+\.\d+/);
  const md5 = file => createHash('md5').update(readFileSync(new URL('fixtures/' + file, tests))).digest('hex');
  assert.equal(md5(reference.provenance.script), reference.provenance.script_md5);
  assert.deepEqual(reference.cases.map(c => c.file), ['mr-tiny.csv', 'mr-heterogeneous.csv']);
  for (const c of reference.cases) assert.equal(md5(c.file), c.md5, c.file);
});

test('P08-D1 parity: binding floor matches all 15 real R PM/adhoc fields', () => {
  const c = reference.cases[0];
  const actual = pageResult(tiny);
  assert.ok(c.raw_q < 1);
  assert.ok(actual.raw_q < 1);
  assert.equal(actual.q, 1);
  close(actual.raw_q, c.raw_q, 'raw_q');
  assert.equal(Object.keys(c.adhoc).length, 15);
  compareFields(actual.result, c.adhoc);
});

test('P08-D1 control: positive heterogeneity matches PM/adhoc and PM/knha', () => {
  const c = reference.cases[1];
  const actual = pageResult(readFileSync(new URL('fixtures/' + c.file, tests), 'utf8'));
  assert.ok(actual.result.tau2 > 0);
  assert.ok(c.adhoc.tau2 > 0);
  close(actual.raw_q, 1, 'non-binding floor (to numerical precision)');
  close(actual.raw_q, c.raw_q, 'raw_q');
  compareFields(actual.result, c.adhoc);
  compareFields(actual.result, c.knha);
});

test('P08-D1 plant: removing the page floor is detected by the R oracle', () => {
  const html = readFileSync(new URL('../index.html', tests), 'utf8');
  const planted = html.replace('const q = Math.max(1, q_raw);', 'const q = q_raw;');
  assert.notEqual(planted, html, 'the defect must be planted');
  const actual = pageResult(tiny, { html: planted });
  const c = reference.cases[0];
  compareFields(actual.result, c.knha);
  assert.throws(() => close(actual.result.slope_se, c.adhoc.slope_se, 'slope_se'), assert.AssertionError);
  compareFields(pageResult(tiny).result, c.adhoc);
});
