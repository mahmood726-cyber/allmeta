// Read-only evidence inventory; no git, network, environment or corpus writes.
// Run from wt/: node hub/shared/tests/unit/p13-review-audit.mjs
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const root = new URL('../../../../', import.meta.url);
const paths = [
  '../base', '../ctx',
  'hub/shared/tests/unit/p04-r8-extraction-import.test.mjs',
  'nma-inconsistency/index.html', 'nma-inconsistency/validate/adapter.js',
  'nma-inconsistency/validate/MANIFEST.json',
  'pubbias-tests/index.html', 'pubbias-tests/validate/adapter.js',
  'pubbias-tests/validate/MANIFEST.json',
];
const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
const source = read('shared/ma-comparisons-v1.js');
const context = vm.createContext({});
vm.runInContext(source, context);
const bus = context.MaComparisons;
const env = bus.buildEnvelope([{ id: 'missing-n', arms: [
  { treatment: 'A', mean: 1, sd: 1, n: 10 },
  { treatment: 'B', mean: 2, sd: 1, n: 10 },
  { treatment: 'C', mean: 3, sd: 1 },
] }], 'MD');
const namedSources = ['hub/shared/results-export.js', 'shared/ma-comparisons-v1.js',
  'shared/ma-comparisons-v1.md', 'hub/shared/tests/unit/p13-results-export.test.mjs'];
console.log(JSON.stringify({
  scope: 'Supplied tree only; no authenticated base or PR diff is available.',
  paths: paths.map(path => ({ path, exists: existsSync(new URL(path, root)) })),
  comparisonEvidence: {
    validates: bus.validate(env).ok,
    expectedArmPairs: 3,
    emittedPairs: bus.toContrasts(env).map(r => [r.study, r.treatment1, r.treatment2]),
    detailedAPI: typeof bus.toContrastsDetailed,
    documentedDetailedAPI: read('shared/ma-comparisons-v1.md').includes('toContrastsDetailed'),
    attributionToPR414: 'unverified',
  },
  lfSha256: Object.fromEntries(namedSources.map(path => [path, createHash('sha256').update(read(path)).digest('hex')])),
}, null, 2));
