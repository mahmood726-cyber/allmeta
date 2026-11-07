// Run from wt. Evidence goes to the OS temporary directory.
import { writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOracle, comparisons, runCase } from './nma-edge-parity-helper.mjs';
import { runAll, jobsOf, checkDataset } from '../_nma_parity_check.mjs';

const oracle = readOracle();
const results = oracle.cases.flatMap(c => c.fits.map(ref => {
  const actual = runCase(c, ref.ci);
  const checks = comparisons(c, ref, actual);
  const failures = checks.filter(x => !x.pass);
  const row = { id: c.id, ci: ref.ci, checks: checks.length, failed: failures.length,
    appError: actual.desirable.error ?? null, failures };
  console.log(`${c.id} / ${ref.ci}: ${checks.length - failures.length}/${checks.length} checks`);
  return row;
}));
const archived = JSON.parse(readFileSync(new URL('../_nma_parity_fixture.json', import.meta.url), 'utf8'));
const corpus = archived.datasets.map(ds => ({ dataset: ds.dataset, ...checkDataset(ds, runAll(jobsOf(ds))) }));
const dest = join(tmpdir(), 'nma-edge-parity-replay.json');
writeFileSync(dest, JSON.stringify({ versions: { ...oracle.provenance, node: process.version }, results, archivedCorpus: corpus }, null, 2));
console.log(`Archived corpus: ${corpus.reduce((n, d) => n + d.n, 0)} checks; ${corpus.reduce((n, d) => n + d.bad.length, 0)} failures`);
console.log(`REPLAY_PATH: ${dest}`);
