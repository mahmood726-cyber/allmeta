// Read-only browser evidence for PR #327. All installations, copied inputs,
// diagnostics and browser output stay in a fresh system-temporary directory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = join(root, 'hub/shared/tests/fixtures');
const proof = JSON.parse(readFileSync(join(fixtures, 'rev-p10-parent.json'), 'utf8'));
const inputs = JSON.parse(readFileSync(join(fixtures, 'rev-p10-browser-inputs.json'), 'utf8'));
assert.equal(inputs.head, proof.head);
assert.equal(inputs.head, 'b6400e962188d05fbd065b0cda5bc8d28bf0e52a');
const lf = text => text.replaceAll('\r\n', '\n');
function blob(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function verifyText(text, expected, label) {
  assert.equal(blob(Buffer.from(lf(text), 'utf8')), expected, `LF blob mismatch: ${label}`);
}
const csvPath = 'hub/shared/csv-upload.js';
const headCsv = readFileSync(join(root, csvPath), 'utf8');
verifyText(headCsv, proof.headFiles.find(f => f.path === csvPath).blob, 'head CSV');
verifyText(proof.parentCsv.source, proof.parentCsv.blob, 'parent CSV');

const work = mkdtempSync(join(tmpdir(), 'rev-p10-browser-'));
const site = join(work, 'site');
const tests = join(site, 'hub/shared/tests');
console.log(`Browser evidence directory: ${work}`);
// Copy only the two applications and their shared dependencies. Never copy a
// developer's installed packages, prior output or browser profile into the run.
for (const path of ['shared', 'hub/shared', 'mh-peto', 'hub/app-style.css']) {
  const target = join(site, path);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(root, path), target, {
    recursive: true,
    filter: source => !['node_modules', 'test-results', 'playwright-report', 'integration-evidence', '__pycache__'].includes(basename(source)),
  });
}
// CI checks out LF. Normalize text only in this disposable copy; PNG bytes,
// all recorded hashes, numbers, assertions and references remain unchanged.
function normalize(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) normalize(path);
    else if (/\.(?:m?js|cjs|json|html|css|md|csv|txt|R)$/.test(entry.name)) {
      const original = readFileSync(path, 'utf8');
      if (original.includes('\r\n')) writeFileSync(path, lf(original), 'utf8');
    }
  }
}
normalize(site);

// The small manifest records GitHub blob IDs from the exact head, not fitted
// expectations. Raw public downloads require no credentials or environment reads.
for (const file of inputs.files) {
  assert.match(file.path, /^limit-ma\/[a-zA-Z0-9./_-]+$/);
  assert.ok(!file.path.split('/').includes('..'));
  const response = await fetch(`https://raw.githubusercontent.com/${inputs.repository}/${inputs.head}/${file.path}`, {
    signal: AbortSignal.timeout(60000),
  });
  assert.ok(response.ok, `Download failed: ${file.path}, HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, file.size, `Size mismatch: ${file.path}`);
  assert.equal(blob(Buffer.from(lf(bytes.toString('utf8')), 'utf8')), file.blob, `LF blob mismatch: ${file.path}`);
  const target = join(site, file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}
console.log(`BROWSER INPUTS PASS: ${inputs.files.length} exact-head limit-ma files verified.`);

function run(label, script, args, timeout) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: tests, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(join(work, `${label}.stdout.txt`), result.stdout || '', 'utf8');
  writeFileSync(join(work, `${label}.stderr.txt`), result.stderr || '', 'utf8');
  console.log(`${label}: exit=${result.status}; signal=${result.signal || 'none'}`);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `${label} terminated by signal`);
  return result.status;
}
const npm = join(dirname(realpathSync(process.execPath)), 'node_modules/npm/bin/npm-cli.js');
assert.ok(existsSync(npm), 'npm CLI must be installed beside Node for the isolated dependency install');
const emptyConfig = join(work, 'empty.npmrc');
writeFileSync(emptyConfig, '', 'utf8');
assert.equal(run('npm-ci', npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund',
  '--cache', join(work, 'npm-cache'), '--userconfig', emptyConfig], 360000), 0, 'locked Playwright dependency install');

// Only the disposable fixture gets passive listeners. Its existing assertions
// and the original test bodies are retained byte-for-byte after LF normalization.
const fixturePath = join(tests, 'validation-fixture.mjs');
const originalFixture = readFileSync(fixturePath, 'utf8');
const hook = '    await use();';
assert.equal(originalFixture.split(hook).length, 2, 'one diagnostic insertion point');
const observers = [
  "    page.on('pageerror', error => console.log('BROWSER PAGEERROR', error.stack || error.message));",
  "    page.on('requestfailed', request => console.log('BROWSER REQUESTFAILED', request.url(), request.failure()?.errorText));",
  "    page.on('response', response => { if (response.status() >= 400) console.log('BROWSER HTTP', response.status(), response.url()); });",
  hook,
].join('\n');
writeFileSync(fixturePath, originalFixture.replace(hook, observers), 'utf8');
const cli = join(tests, 'node_modules/@playwright/test/cli.js');
const outcomes = [];
function browserRun(label, pixel, args, count) {
  const report = join(work, `${label}.json`);
  const config = join(tests, `rev-p10-${label}.config.mjs`);
  const base = pixel ? './playwright.pixels.config.mjs' : './playwright.config.mjs';
  const additions = {
    workers: 1, retries: 0, updateSnapshots: 'none',
    outputDir: join(work, label),
    reporter: [['line'], ['json', { outputFile: report }]],
  };
  writeFileSync(config, `import base from ${JSON.stringify(base)};\nexport default {...base,...${JSON.stringify(additions)},use:{...base.use,trace:'retain-on-failure'},projects:base.projects.map(project=>({...project,use:{...project.use,channel:'msedge'}})),webServer:{...base.webServer,cwd:${JSON.stringify(tests)},reuseExistingServer:false}};\n`, 'utf8');
  const code = run(label, cli, ['test', '--config', config, ...args], 1200000);
  const stats = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')).stats : null;
  console.log(`${label} STATS ${JSON.stringify(stats)}`);
  const pass = code === 0 && stats?.expected === count && stats.unexpected === 0 && stats.skipped === 0 && stats.flaky === 0;
  outcomes.push({ label, code, stats, pass });
}

// A run failure never prevents collecting the other revision's evidence.
writeFileSync(join(site, csvPath), lf(proof.parentCsv.source), 'utf8');
browserRun('parent-limit-pixels', true, ['limit-ma-plus-pixels.spec.mjs'], 11);
writeFileSync(join(site, csvPath), lf(headCsv), 'utf8');
browserRun('head-limit-pixels', true, ['limit-ma-plus-pixels.spec.mjs'], 11);
browserRun('head-mh-peto-contract', false, ['validate-mh-peto.spec.mjs', '--grep',
  'mh-peto full paper corpus and complete restoration|mh-peto refuses changed corpus bytes|mh-peto browser replay reports removed app evidence as FAIL'], 3);
writeFileSync(join(work, 'summary.json'), JSON.stringify(outcomes, null, 2) + '\n', 'utf8');
assert.ok(outcomes.every(outcome => outcome.pass), 'browser evidence has failures or missing/skipped tests; inspect the saved logs');
console.log('BROWSER REPLAY PASS: parent/head each completed 11 unchanged limit-ma pixel tests, including the expected-failure control; all 3 mh-peto contract/control tests passed.');
