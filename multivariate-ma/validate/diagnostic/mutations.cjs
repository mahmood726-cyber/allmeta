'use strict';
// Engine-level mutations of the diagnostic. Each patches shared/multivariate-ma.js in memory (the file on disk is
// not touched) and reruns the exact comparison against R: the 297 fits (oracle-verdicts.json) and, separately,
// the added mutation controls (oracle-mutation-controls.json). The unmutated engine is not 297/297 (see
// agreement.json), so a mutation is KILLED on a population when it disagrees with R on at least one fit on which
// the unmutated engine agrees with R. Usage: node mutations.cjs   (writes mutations.json)
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { compare } = require('./compare.cjs'), { fits } = require('./run.cjs'), { controls } = require('./mutation-controls.cjs');
const enginePath = path.resolve(__dirname, '../../../shared/multivariate-ma.js'), source = fs.readFileSync(enginePath, 'utf8');
const read = p => JSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8'));
const expected = read('oracle-verdicts.json').fits, controlVerdicts = new Map(read('oracle-mutation-controls.json').fits.map(f => [f.id, f.verdict]));
if (controlVerdicts.size !== controls.length || !controls.every(c => controlVerdicts.has(c.id))) throw Error('oracle-mutation-controls.json does not match mutation-controls.cjs');
const mutations = [
  { name: 'boundary variance threshold x1e4', from: 'var threshold = 1e-10 * Math.max(1,', to: 'var threshold = 1e-6 * Math.max(1,' },
  { name: 'correlation boundary 1e-6 -> 1e-2', from: 'if (Math.abs(r) >= 1 - 1e-6) correlations.push', to: 'if (Math.abs(r) >= 1 - 1e-2) correlations.push' },
  { name: 'skip the multiple-optima check', from: 'multiple = clusters.length > 1;', to: 'multiple = false;' },
  { name: 'swap precedence (multiple before boundary)', from: "verdict: boundary ? 'boundary maximum' : multiple ? 'multiple near-equal optima' : 'interior maximum',",
    to: "verdict: multiple ? 'multiple near-equal optima' : boundary ? 'boundary maximum' : 'interior maximum'," },
  { name: 'absolute (not scale-free) SD tolerance', from: 'if (Math.abs(sa - sb) > sdTol * Math.max(sa, sb)) return true;', to: 'if (Math.abs(sa - sb) > sdTol) return true;' }
];
function load(code) {
  const m = new Module(enginePath, null); m.filename = enginePath; m.paths = Module._nodeModulePaths(path.dirname(enginePath));
  m._compile(code, enginePath); return m.exports;
}
const controlFits = eng => controls.map(c => ({ id: c.id, expected: controlVerdicts.get(c.id), actual: eng.fit(c.studies).diagnostic.verdict }));
const engine0 = load(source), base = compare(expected, fits(engine0, false)), baseFailed = new Set(base.failures.map(f => f.id));
const baseControls = controlFits(engine0);
const results = mutations.map(mu => {
  const occurrences = source.split(mu.from).length - 1;
  if (occurrences !== 1) throw Error(`${mu.name}: patch site found ${occurrences} times`);
  const eng = load(source.replace(mu.from, mu.to)), r = compare(expected, fits(eng, false));
  const caught = r.failures.filter(f => !baseFailed.has(f.id)).map(f => ({ id: f.id, expected: f.expected, actual: f.actual }));
  const ctl = controlFits(eng), ctlCaught = ctl.filter((c, i) => c.actual !== c.expected && baseControls[i].actual === baseControls[i].expected);
  const killed297 = caught.length > 0, killedControls = ctlCaught.length > 0;
  console.log(`MUTATION ${mu.name}: 297 ${killed297 ? 'KILLED' : 'SURVIVED'} (${r.agreement}/${r.expected}); controls ${killedControls ? 'KILLED' : 'SURVIVED'} (${ctl.filter(c => c.actual === c.expected).length}/${ctl.length})`);
  for (const f of caught) console.log(`  297 caught by ${f.id}: R ${f.expected}, mutant ${f.actual}`);
  for (const f of ctlCaught) console.log(`  control caught by ${f.id}: R ${f.expected}, mutant ${f.actual}`);
  return { name: mu.name, from: mu.from, to: mu.to, killed297, agreement297: r.agreement, caughtBy297: caught,
    killedByControls: killedControls, controlAgreement: ctl.filter(c => c.actual === c.expected).length, caughtByControls: ctlCaught, killed: killed297 || killedControls };
});
console.log(`UNMUTATED 297 ${base.agreement}/${base.expected}; controls ${baseControls.filter(c => c.actual === c.expected).length}/${baseControls.length}`);
fs.writeFileSync(path.join(__dirname, 'mutations.json'), JSON.stringify({ node: process.version,
  rule: 'killed on a population = disagrees with R on >=1 fit where the unmutated engine agrees with R',
  unmutated: { agreement297: base.agreement, expected297: base.expected, failures297: base.failures, controls: baseControls }, mutations: results }, null, 2) + '\n');
process.exitCode = results.every(r => r.killed) && baseControls.every(c => c.actual === c.expected) ? 0 : 1;
