// Reconstruct the pre-repair schema/loaders and pass-2 browser port in TEMP.
// Run the SAME planted tests and controls; a runner failure is not evidence.
// PR expressions come from the supplied head; the port comes from pass 2.
// This does not reconstruct the unavailable main/base tree.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), 'p07-baseline-'));
for (const name of ['multilevel-ma', 'shared', 'hub/shared']) {
  cpSync(join(root, name), join(workspace, name), {
    recursive: true,
    filter: path => !/(?:^|[\\/])(?:node_modules|test-results|artifacts|integration-evidence)(?:[\\/]|$)/.test(path),
  });
}
function replace(path, replacements) {
  const file = join(workspace, path);
  let text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const [current, old] of replacements) {
    assert.equal(text.split(current).length, 2, 'one exact repair expression: ' + path);
    text = text.replace(current, old);
  }
  writeFileSync(file, text);
}
replace('multilevel-ma/validate/plus-adapter.js', [
  ["    const build=window.AlmBuildInfo||null;\n    const provenance=build===null?exported?.producedBy===null:!!keys(exported?.producedBy,Object.keys(build))&&Object.keys(build).every(key=>exported.producedBy[key]===build[key]);\n", ''],
  ["keys(exported,['model','inference','status','rows','clusters','robust','logLik','profiles','producedBy'])&&provenance&&exported.model", "keys(exported,['model','inference','status','rows','clusters','robust','logLik','profiles'])&&exported.model"],
]);
replace('hub/shared/tests/unit/p07-translation.test.mjs', [
  ["const inputBytes = Buffer.from(readFileSync(new URL('./p07-translation-input.json', import.meta.url)).toString('utf8').replace(/\\r\\n/g, '\\n'));", "const inputBytes = readFileSync(new URL('./p07-translation-input.json', import.meta.url));"],
]);
replace('hub/shared/tests/unit/p07-replay.mjs', [
  ["const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\\r\\n/g, '\\n');", "const read = path => readFileSync(new URL(path, root), 'utf8');"],
  ['  const bytes = Buffer.from(read(`multilevel-ma/${file.path}`));', '  const bytes = readFileSync(new URL(`multilevel-ma/${file.path}`, root));'],
]);
replace('hub/shared/tests/unit/p07-ci-browser.mjs', [
  ["import { createServer } from 'node:net';\n", ''],
  ["// Ask the OS for an available loopback port instead of assuming 8088 is free.\n// Playwright still refuses to reuse a server if another process wins the bind.\nconst port = await new Promise((resolve, reject) => {\n  const probe = createServer();\n  probe.once('error', reject);\n  probe.listen(0, '127.0.0.1', () => {\n    const selected = probe.address().port;\n    probe.close(error => error ? reject(error) : resolve(selected));\n  });\n});\nconst baseURL = `http://127.0.0.1:${port}`;\n", ''],
  ['baseURL: ${JSON.stringify(baseURL)}, browserName:', "baseURL: 'http://127.0.0.1:8088', browserName:"],
  ["command: 'python -m http.server ${port} --bind 127.0.0.1'", "command: 'python -m http.server 8088 --bind 127.0.0.1'"],
  ['url: ${JSON.stringify(baseURL)},', 'port: 8088,'],
  ["console.log('P07 private server:', baseURL);\n", ''],
]);
const tests = ['p07-export-provenance.test.mjs', 'p07-line-endings.test.mjs', 'p07-ci-browser-port.test.mjs']
  .map(name => join(workspace, 'hub/shared/tests/unit', name));
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], {
  cwd: workspace, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024,
});
if (run.error) throw run.error;
console.log(run.stdout);
if (run.stderr) console.error(run.stderr);
const expected = [
  'P07-R4 schema plant: the real extras download passes the unchanged numerical contract with provenance',
  'P07-R4 schema plant: a missing build stamp is accepted only as explicit null',
  'P07-R4 schema plant: missing provenance is rejected when a build stamp is loaded',
  'P07-R4 schema control: a replacement stamp is checked by value, independent of key order',
  'P07 provenance CRLF plant: translation input retains its recorded MD5',
  'P07 provenance CRLF plant: corpus replay retains all manifest byte counts and SHA-256 values',
  'P07 browser port plant: occupied default port uses the OS-selected free address',
];
const failed = [...run.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(match => match[1].trim());
assert.equal(run.status, 1, 'old assertions must fail');
assert.deepEqual(failed.sort(), expected.sort(), 'only the seven known pre-repair failures');
assert.match(run.stdout, /^# tests 21\r?$/m);
assert.match(run.stdout, /^# pass 14\r?$/m);
assert.match(run.stdout, /^# fail 7\r?$/m);
console.log('P07 baseline confirmed: all seven expected failures; all 14 other assertions pass.');
