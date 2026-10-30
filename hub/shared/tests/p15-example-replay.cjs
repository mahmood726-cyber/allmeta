// Compare the page's actual example inputs/fits with the supplied PR head and
// the reconstructed hash-dropping parser. This is not a historical tree replay.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { restorePreFix } = require('./p15-diagnostics-replay.cjs');
const root = path.resolve(__dirname, '../../..');
const file = path.join(root, 'shared/rve-extras.js');
const E = require(file);
require(path.join(root, 'shared/stats-qt.js'));
const RVE = require(path.join(root, 'shared/rve.js'));
const current = fs.readFileSync(file, 'utf8');
const before = restorePreFix(current);
const filter = 'if (!raw.trim()) continue;';
assert.equal(before.split(filter).length, 2);
const old = before.replace(filter, 'if (!raw.trim() || raw.trim().charAt(0) === "#") continue;');
function extras(source) {
  const module = { exports: {} };
  new Function('module', 'exports', 'require', source)(module, module.exports, createRequire(file));
  return module.exports;
}
const alternatives = [extras(before), extras(old)];
const html = fs.readFileSync(path.join(root, 'rve-meta/index.html'), 'utf8');
const corrdat = html.match(/<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/);
const small = html.match(/var SMALL_EXAMPLE = ("(?:[^"\\]|\\.)*");/);
assert.ok(corrdat && small, 'both real page example inputs must be found');
for (const [name, input] of [['corrdat', corrdat[1]], ['small', JSON.parse(small[1])]]) {
  assert.ok(!input.split(/\r?\n/).some(line => line.trim().startsWith('#')), name);
  const parsed = E.parseStudies(input);
  const fit = RVE.fitCORR(parsed.rows, { rho: 0.8 });
  for (const other of alternatives) {
    assert.deepEqual(other.parseStudies(input), parsed, `${name}: exact parser equality`);
    assert.deepEqual(RVE.fitCORR(other.parseStudies(input).rows, { rho: 0.8 }), fit, `${name}: exact fit equality`);
  }
  console.log(`${name}: parser and full fit exactly equal across all three parsers; k=${fit.k_total}, m=${fit.m_clusters}, beta=${JSON.stringify(fit.beta)}`);
}
