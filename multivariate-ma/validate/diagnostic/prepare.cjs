'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const source = path.resolve(process.argv[2] || 'C:/Users/User/p18ll');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, x) => fs.writeFileSync(path.join(__dirname, p), JSON.stringify(x, null, 2) + '\n');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const jobs = read(path.join(source, 'jobs.json')), pop = read(path.join(source, 'population.json')), summary = read(path.join(source, 'summary.json'));
const provenance = ['fits.csv', 'population.json', 'jobs.json', 'summary.json', 'P18LL.md'].map(p => ({ path: path.join(source, p), sha256: hash(fs.readFileSync(path.join(source, p))) }));
const hard = pop.fits.map(f => {
  const s = summary.fits.find(x => x.id === f.id), job = jobs.find(j => j.job === f.job);
  assert(s && job);
  const p = path.join(source, 'results', `job-${String(f.job).padStart(3, '0')}.json`);
  const oracle = read(p);
  provenance.push({ path: p, sha256: hash(fs.readFileSync(p)) });
  const boundary = oracle.best.G.some((r, i) => r[i] <= 1e-10) || Math.abs(oracle.best.rho) >= 1 - 1e-6;
  return { id: f.id, job: f.job, classification: s.classification, reason: s.reason,
    expected: s.classification === 'b' ? ['boundary maximum', 'flat likelihood: estimates not unique'] : [boundary ? 'boundary maximum' : 'unique interior maximum'],
    studies: job.studies, oracle: { best: oracle.best, default: oracle.default } };
});
assert.equal(hard.length, 69); assert.equal(new Set(hard.map(f => f.id)).size, 69);
const csvIds = fs.readFileSync(path.join(source, 'fits.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map(line => {
  const first = line.match(/^"((?:[^"]|"")*)",/);
  assert.ok(first, 'Expected quoted fit ID in P18LL fits.csv');
  return first[1].replaceAll('""', '"');
});
assert.deepEqual(hard.map(f => f.id).sort(), csvIds.sort(), 'Hard IDs must equal the entire registered fits.csv population');
assert.equal(hard.filter(f => f.classification === 'a').length, 3);
assert.equal(hard.filter(f => f.classification === 'b').length, 66);
write('hard.json', hard);
const corpusPath = path.join(__dirname, '../plus/corpus.json'), corpus = read(corpusPath);
const seen = new Set(hard.map(f => hash(JSON.stringify(f.studies)))), ids = new Set(hard.map(f => f.id)), candidates = [];
for (const c of corpus.configurations) for (const rw of [null, ...corpus.grid]) {
  const id = c.id + (rw === null ? '#main' : '#rhoW=' + rw);
  const studies = c.rows.map(r => {
    const cov = rw === null ? r.cov : rw * Math.sqrt(r.v[0] * r.v[1]);
    return { y: r.y, S: [[r.v[0], cov], [cov, r.v[1]]] };
  });
  const key = hash(JSON.stringify(studies));
  if (ids.has(id) || seen.has(key) || studies.length < 3 || studies.some(s => !(s.S[0][0] * s.S[1][1] > s.S[0][1] ** 2))) continue;
  seen.add(key); candidates.push({ id, studies });
}
write('control-candidates.json', candidates);
provenance.push(...[corpusPath, path.join(__dirname, 'PREREG.md'), path.join(__dirname, 'baseline-engine.cjs'), path.join(__dirname, '../generate-plus.R')].map(p => ({ path: p, sha256: hash(fs.readFileSync(p)) })));
write('provenance.json', [...new Map(provenance.map(p => [p.path, p])).values()]);
console.log(`${hard.length} hard IDs; ${candidates.length} ordered control candidates; PREREG SHA256 ${hash(fs.readFileSync(path.join(__dirname, 'PREREG.md')))}`);
