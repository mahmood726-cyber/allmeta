// Lane A6 (node --test): the R reproduction script. The R-executing tests need Rscript
// (ALM_RSCRIPT, or R 4.6.0 at its default Windows path) and are reported as skipped without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require = createRequire(import.meta.url);
const X = require('../r-export.js');
const RSCRIPT = process.env.ALM_RSCRIPT || 'C:/Program Files/R/R-4.6.0/bin/Rscript.exe';
const haveR = existsSync(RSCRIPT);

// A live contract whose R side prints fixed numbers, so the comparison logic is tested on its own.
function fakeLive(rValues, pageValues, compare) {
  return {
    packages: ['stats'], paperVersions: {stats: '4.6.0'},
    currentState: () => ({}),
    appValues: () => Object.entries(pageValues).map(([key, value]) => ({key, label: key, value})),
    compare: compare || {tolerance: {default: 1e-6}, kind: {a: 'rel', b: 'rel', c: 'abs'}},
    buildScript: () => "out <- list(" + Object.entries(rValues).map(([k, v]) => '`' + k + '`=' + (v === null ? 'NA' : v)).join(',') +
      ")\nnum <- function(x) if (is.na(x)) 'null' else sprintf('%.17g', x)\n" +
      "cat('ALMJSON:{', paste(sprintf('\"%s\":%s', names(out), vapply(out, num, '')), collapse=','), '}\\n', sep='')"
  };
}
function script(rValues, pageValues, extra = {}) {
  return X.compose({app: 'fixture', live: fakeLive(rValues, pageValues, extra.compare), state: {}, now: new Date('2026-10-18T00:00:00Z'),
    build: {version: 'v0', sha: 'abc'}, webR: {webR: '0.5.5', packages: {stats: '4.6.0'}}, readable: extra.readable});
}
function runR(text) {
  const dir = mkdtempSync(join(tmpdir(), 'alm-rexport-'));
  try {
    writeFileSync(join(dir, 's.R'), text);
    const r = spawnSync(RSCRIPT, [join(dir, 's.R')], {encoding: 'utf8', env: {...process.env, R_ENVIRON_USER: 'NUL', R_PROFILE_USER: 'NUL'}, timeout: 120000});
    return {status: r.status, out: (r.stdout || '') + (r.stderr || '')};
  } finally { rmSync(dir, {recursive: true, force: true}); }
}
const verdict = out => (/ALLMETA REPRODUCTION: (PASS|FAIL) \((\d+)\/(\d+)/.exec(out) || []).slice(1);

test('header records app, build, UTC time, paper and webR versions; body excludes it', () => {
  const s = script({a: 1}, {a: 1});
  for (const line of ['# App: fixture', '# allmeta: v0 (abc)', '# Generated (UTC): 2026-10-18T00:00:00.000Z',
    '# Validated in the paper with: stats 4.6.0', '# In-browser webR check uses: webR 0.5.5; stats 4.6.0']) assert.ok(s.includes(line + '\n'), line);
  const body = X.bodyOf(s);
  assert.ok(!body.includes('Generated'));
  assert.equal(X.bodyOf(script({a: 1}, {a: 1})), body);
  assert.throws(() => X.bodyOf('no header'), /Not an allmeta R export/);
  assert.ok(body.includes('alm_out <- capture.output(local({'));
  assert.ok(!/\bstop\(\s*"Package/.test(body), 'package problems warn, never stop');
});

test('compose refuses incomplete contracts', () => {
  const live = fakeLive({a: 1}, {a: 1});
  assert.throws(() => X.compose({app: 'x', live: {...live, appValues: () => []}, state: {}}), /no values/);
  assert.throws(() => X.compose({app: 'x', live: {...live, compare: {tolerance: {}}}, state: {}}), /No tolerance/);
  assert.throws(() => X.compose({app: 'x', live: {...live, buildScript: () => 'print(1)'}, state: {}}), /ALMJSON/);
  assert.throws(() => X.compose({app: 'x', live: {...live, appValues: () => [{key: 'a', value: NaN}]}, state: {}}), /finite/);
  assert.throws(() => X.attach({app: 'Bad slug', live}), /slug/);
  assert.throws(() => X.attach({app: 'x', live: {}}), /live contract/);
});

test('R: matching values PASS; the readable part runs but is not compared', {skip: !haveR && 'Rscript not available'}, () => {
  const r = runR(script({a: 0.1234567890123, b: 2, c: null}, {a: 0.1234567890123, b: 2 + 1e-7, c: null}, {readable: 'x <- 1\nprint("readable part ran")'}));
  assert.deepEqual(verdict(r.out), ['PASS', '3', '3'], r.out);
  assert.ok(r.out.includes('readable part ran'));
});

test('R: a page value outside tolerance, a missing R key and a null mismatch each FAIL', {skip: !haveR && 'Rscript not available'}, () => {
  assert.deepEqual(verdict(runR(script({a: 1, b: 2}, {a: 1 + 2e-6, b: 2})).out), ['FAIL', '1', '2']);
  assert.deepEqual(verdict(runR(script({a: 1}, {a: 1, b: 2})).out), ['FAIL', '1', '2']);
  assert.deepEqual(verdict(runR(script({a: 1, b: 2}, {a: 1, b: null})).out), ['FAIL', '1', '2']);
  // abs tolerance applies to c: 1e-6 absolute on a large value fails where rel would pass.
  assert.deepEqual(verdict(runR(script({c: 1000}, {c: 1000.0001})).out), ['FAIL', '0', '1']);
  assert.deepEqual(verdict(runR(script({a: 1000}, {a: 1000.0001})).out), ['PASS', '1', '1']);
});

test('R: package version differences warn but do not stop the check', {skip: !haveR && 'Rscript not available'}, () => {
  const s = X.compose({app: 'fixture', live: {...fakeLive({a: 1}, {a: 1}), paperVersions: {stats: '0.0-1'}}, state: {}});
  const r = runR(s);
  assert.equal(r.status, 0);
  assert.match(r.out, /differs from the validated 0\.0-1/);
  assert.deepEqual(verdict(r.out), ['PASS', '1', '1']);
});
