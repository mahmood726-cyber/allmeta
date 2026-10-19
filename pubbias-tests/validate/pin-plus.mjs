// Canonicalise the native R reference and pin the #alm-plus corpus.
// Run from the repository root after validate/generate-plus.R:  node pubbias-tests/validate/pin-plus.mjs
// Reads validate/plus-corpus/reference-plus-raw.json, writes reference-plus.json (compact UTF-8 JSON + final LF),
// MANIFEST-plus.json and plus-pins.js. Documented exceptions are pinned only if every failing check belongs to the
// generic parent-REML refusal class; any other failure stops pinning.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const rawPath = join(here, 'plus-corpus', 'reference-plus-raw.json'), refPath = join(here, 'plus-corpus', 'reference-plus.json');
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
if (raw.versions.metafor !== '5.2.1' || raw.versions.meta !== '8.5.0') throw Error('Reference must come from metafor 5.2-1 and meta 8.5-0');
const tsRef = JSON.parse(readFileSync(join(here, 'plus-corpus', 'thompson-sharp-reference.json'), 'utf8'));
if (tsRef.versions.metafor !== '5.2.1' || Object.keys(tsRef.datasets).length !== 152) throw Error('Thompson-Sharp reference must cover 152 configurations from metafor 5.2-1');
const text = JSON.stringify(raw) + '\n';
writeFileSync(refPath, text, 'utf8');
const { run } = await import('./check-plus.mjs');
const checks = run(raw), failed = checks.filter(c => !c.pass);
const CLASSES = ['parent-reml-refusal', 'side-regression-refusal'];
const other = failed.filter(c => !CLASSES.includes(c.cls));
if (other.length) { for (const f of other.slice(0, 40)) console.error('UNCLASSIFIED', f.id, f.quantity, JSON.stringify(f.app), JSON.stringify(f.ref)); throw Error(other.length + ' failures outside the documented class; not pinned'); }
const sha = p => createHash('sha256').update(readFileSync(join(here, '..', p))).digest('hex');
const bytes = p => readFileSync(join(here, '..', p)).length;
const files = ['validate/corpus/corpus.json', 'validate/plus-corpus/reference-plus.json', 'validate/plus-corpus/dataset-disposition.json', 'validate/plus-corpus/thompson-sharp-reference.json'].map(path => ({ path, sha256: sha(path), bytes: bytes(path) }));
const loo = Object.values(raw.datasets).filter(d => d.loo.rows);
const byConfig = {};
for (const f of failed) byConfig[f.id] = (byConfig[f.id] || 0) + 1;
const manifest = {
  schema: 'pubbias-tests-plus-v1',
  protocol: 'PET, PEESE, conditional PET-PEESE (full data) and leave-one-out of Egger, Begg, trim-and-fill, PET/PEESE, Peters and Harbord against native R',
  configurations: Object.keys(raw.datasets).length,
  looConfigurations: loo.length,
  omissions: loo.reduce((a, d) => a + d.loo.rows.length - 1, 0),
  numericChecks: checks.length,
  thompsonSharpChecks: checks.filter(c => c.quantity.startsWith('thompson_sharp.')).length,
  displayChecks: Object.keys(raw.datasets).length,
  dispositionChecks: 1,
  checks: checks.length + Object.keys(raw.datasets).length + 1,
  expectedPassed: checks.length + Object.keys(raw.datasets).length + 1 - failed.length,
  versions: raw.versions,
  settings: raw.settings,
  files,
  exceptions: {
    classes: {
      'parent-reml-refusal': "R refuses because the parent REML model required by the archive's calls (rma for regtest; metabin's random-effects fit for metabias) does not converge, while the app's closed-form test returns a value; R's fallback that needs no parent REML fit (regtest on the vectors; metabin with method.tau='DL') agrees with the app at the stated tolerance.",
      'side-regression-refusal': "R's trimfill refuses because its side-determining REML meta-regression rma(yi, vi, mods=sqrt(vi)) does not converge with default controls, while the app's side regression returns a value; R's trimfill given the side from that regression refitted with step halving (stepadj=0.5, maxiter=1000) agrees with the app at the stated tolerance."
    },
    note: 'Flags whose R value is undefined because of such a refusal inherit its class. All remain FAIL; the rule uses no dataset identifiers.',
    byConfiguration: byConfig,
    identities: failed.map(f => f.id + ' | ' + f.quantity),
    classOf: Object.fromEntries(failed.map(f => [f.id + ' | ' + f.quantity, f.cls]))
  }
};
writeFileSync(join(here, 'MANIFEST-plus.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
writeFileSync(join(here, 'plus-pins.js'), 'globalThis.AlmPubbiasPlusPins = ' + JSON.stringify({ schema: manifest.schema, configurations: manifest.configurations, looConfigurations: manifest.looConfigurations, omissions: manifest.omissions, checks: manifest.checks, expectedPassed: manifest.expectedPassed, files, exceptions: { identities: manifest.exceptions.identities, classOf: manifest.exceptions.classOf } }) + ';\n', 'utf8');
if (process.argv.includes('--drop-raw')) unlinkSync(rawPath);
console.log(JSON.stringify({ configurations: manifest.configurations, looConfigurations: manifest.looConfigurations, omissions: manifest.omissions, checks: manifest.checks, expectedPassed: manifest.expectedPassed, exceptions: failed.length, byConfig }));
