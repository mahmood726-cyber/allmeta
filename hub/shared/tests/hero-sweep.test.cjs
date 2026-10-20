const {test} = require('node:test');
const assert = require('node:assert/strict');
const {isDeepStrictEqual} = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const {cases, contract, root} = require('./hero-sweep-contract.cjs');
test('sweep covers every app with an AlmHero.attachHero call', () => {
  const pages = fs.readdirSync(root).filter(dir => {
    const file = path.join(root, dir, 'index.html');
    return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('AlmHero.attachHero({');
  });
  assert.equal(pages.length, 19);
  assert.deepEqual(cases.map(c => c.app).sort(), pages.sort());
});
for (const c of cases) test(`${c.app}: static ${c.broken ? 'BROKEN' : 'OK'} classification`, () => {
  const r = contract(c);
  assert.equal(isDeepStrictEqual(r.actual, r.expected), !c.broken, c.broken || 'Row values must retain canonical semantics');
  if (c.broken) console.log(`${c.app}: ${r.actual.length}/${r.expected.length} rows; first actual ${JSON.stringify(r.actual[0])}, expected ${JSON.stringify(r.expected[0])}`);
});
