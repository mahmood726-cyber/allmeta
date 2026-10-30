// Generate the actual live adapter scripts and checks for native R execution.
// The separate Rscript driver reads this temporary file; no test output is saved in wt.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {harness, formats} = require('./plus-input-harness.cjs');
const reference = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/p13-live-input-reference.json'), 'utf8'));
const snippets = [
  'suppressPackageStartupMessages(library(metafor))',
  'checks <- 0L',
  `check <- function(out, key, expected, exact=FALSE) {
    actual <- out[[key]]
    stopifnot(length(actual)==1L)
    if(exact) stopifnot(actual==expected) else {
      stopifnot(is.numeric(actual), is.finite(actual), is.finite(expected),
                abs(actual-expected)/max(1,abs(expected))<=1e-9)
    }
    checks <<- checks+1L
  }`
];
let cases = 0, expectedChecks = 0;
function check(key, value, exact = false) {
  assert.ok(typeof value === 'string' || Number.isFinite(value), key);
  expectedChecks++;
  return `check(out, ${JSON.stringify(key)}, ${JSON.stringify(value)}, ${exact ? 'TRUE' : 'FALSE'})`;
}
function numericChecks(actual) {
  const lines = [check('row_count', actual.rows.length, true)];
  for (const row of actual.rows) for (const [q, value] of Object.entries(row)) {
    if (q !== 'study') lines.push(check(`study.${row.study}.${q}`, value, q.endsWith('_n')));
  }
  actual.points.forEach((p, i) => {
    lines.push(check('members.' + i, p.members.join(','), true));
    for (const q of ['mu', 'I2', 'Q', 'H2', ...(actual.model === 'DL' ? ['tau2', 'tau'] : [])]) lines.push(check(q + '.' + i, p[q]));
  });
  return lines;
}
for (const model of ['FE', 'DL']) for (const [format, input] of Object.entries(formats)) {
  const h = harness(), actual = h.current(input, model);
  assert.deepEqual(actual.te, reference.input.te);
  assert.deepEqual(actual.se, reference.input.se);
  const script = h.live.buildScript(actual);
  assert.doesNotMatch(script, /NaN|undefined|Infinity/);
  const ref = reference.models.find(m => m.model === model);
  // Align the immutable native oracle by membership, as the production script does.
  const aligned = {...ref, points: actual.points.map(p => {
    const r = ref.points.find(r => Object.values(r.members).join(',') === p.members.join(','));
    assert.ok(r);
    return {...r, members: Object.values(r.members)};
  })};
  snippets.push('local({', 'alm_output <- capture.output({', script, '})',
    "stopifnot(length(alm_output)==1L, startsWith(alm_output, 'ALMJSON:{'))",
    '# Compare actual native live output to both the independent oracle and the JS capture.',
    ...numericChecks(aligned), ...numericChecks(actual),
    `cat('PASS live script ${model} ${format}\\n')`, '})');
  cases++;
}
snippets.push(`stopifnot(checks==${expectedChecks}L)`,
  `cat('${cases} live scripts; ', checks, ' numerical/membership checks passed\\n', sep='')`,
  "cat(R.version.string, '; metafor ', as.character(packageVersion('metafor')), '\\n', sep='')");
const output = path.join(os.tmpdir(), 'p13-live-scripts.R');
fs.writeFileSync(output, snippets.join('\n') + '\n');
console.log(`${cases} currentState/buildScript cases generated; ${expectedChecks} R checks requested`);
console.log(output);
