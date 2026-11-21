'use strict';
// Requirement: the shipped page carries no build-machine paths, and its embedded validation manifest
// still verifies: every artifact digest and the integrity_signature digest equal SHA-256 of the build's
// stable JSON (Python json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False), as
// dev/build.py computes them).
// Limitation sweep LIM-P60 L34 (also stated in the P60 pack): four absolute paths
// "C:\HTML apps\IPD-Meta-Pro\dev\benchmarks\..." in the superiority snapshot's source_artifacts.
// The digest check runs Python (python3 or python); without it the test prints SKIPPED and exits 2.
//   node dev/tests/manifest_paths.test.cjs [path/to/ipd-meta-pro.html]
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const pageFile = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'ipd-meta-pro.html'));
const html = fs.readFileSync(pageFile, 'utf8');
let failed = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + String(detail).slice(0, 300) + ']' : '')); if (!ok) failed++; }
const abs = html.match(/"[A-Za-z]:(\\|\/)[^"\n]{0,160}"/g) || [];
check('no absolute drive paths in JSON strings of the shipped page', abs.length === 0, abs.slice(0, 4).join(' | '));
const homes = html.match(/(C:\\Users\\|\/home\/[a-z]|HTML apps)/g) || [];
check('no user-home or build-folder paths', homes.length === 0, homes.slice(0, 4).join(' | '));
// the build copies source_artifacts from this file (dev/build.py), so it must not hold them either
const snapFile = path.join(path.dirname(pageFile), 'dev', 'benchmarks', 'latest_ipd_superiority_snapshot.json');
if (fs.existsSync(snapFile)) {
  const snap = fs.readFileSync(snapFile, 'utf8');
  const sabs = snap.match(/"[A-Za-z]:(\\\\|\/)[^"\n]{0,160}"/g) || [];
  check('dev/benchmarks/latest_ipd_superiority_snapshot.json holds no absolute drive paths', sabs.length === 0, sabs.slice(0, 4).join(' | '));
}
const PY = `
import json, hashlib, sys
s = open(sys.argv[1], encoding='utf-8', newline='').read()
k = s.find('IPD_EMBEDDED_VALIDATION_MANIFEST = {'); start = s.find('{', k); end = s.find('\\n};', start)
obj = json.loads(s[start:end + 2])
dump = lambda v: json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
h = lambda t: hashlib.sha256(t.encode('utf-8')).hexdigest()
core = {a: b for a, b in obj.items() if a != 'integrity_signature'}
bad = [rel for rel, d in obj['artifact_digests'].items() if h(dump(obj['artifacts'][rel])) != d['digest']]
print(json.dumps({'n': len(obj['artifact_digests']), 'bad': bad, 'integrity': h(dump(core)) == obj['integrity_signature']['digest']}))
`;
let py = null;
for (const exe of ['python3', 'python']) { const r = spawnSync(exe, ['-I', '-c', PY, pageFile], { encoding: 'utf8' }); if (r.status === 0 && /"n"/.test(r.stdout)) { py = JSON.parse(r.stdout.trim().split('\n').pop()); break; }
  console.log('NOTE ' + exe + ': rc=' + r.status + ' ' + String(r.stderr || r.error || '').slice(-300)); }
if (!py) { console.log('SKIPPED: the digest check needs Python'); process.exit(2); }
check('every embedded artifact digest verifies', py.n > 0 && py.bad.length === 0, JSON.stringify(py));
check('the manifest integrity_signature digest verifies', py.integrity === true, JSON.stringify(py));
if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
console.log('all passed');
