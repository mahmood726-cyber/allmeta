// Dependency-free parser regression: node hub/shared/tests/csv-upload-kinds.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = process.argv[2] || path.join(__dirname, '..', 'csv-upload.js');
const context = { window: {} };
let src = fs.readFileSync(source, 'utf8');
if (process.env.V181_MUTANT === 'csv') {
  const mutant = src.replace('claim(hs, columns[ci], true);', 'claim(hs, columns[ci]);');
  assert.notEqual(mutant, src, 'CSV mutation target must exist');
  src = mutant;
}
vm.runInNewContext(src, context);
const parse = context.window.alm.csvUpload.parse;
let checks = 0;
function check(name, fn) {
  try { fn(); checks++; console.log('PASS ' + name); }
  catch (error) { console.error('FAIL ' + name); throw error; }
}
const column = name => [{ name, type: 'float' }];
for (const header of ['se', 'SE', 'sei', 'stderr', 'standard error', 'Std. Error']) {
  check(header + ' explicitly squared for variance', () => {
    const r = parse(header + '\n0.2', column('vi'));
    assert.ok(Math.abs(r.rows[0].vi - 0.04) < 1e-12, JSON.stringify(r));
    assert.match(r.warnings.join('\n'), /convert.*SE.*\^2/i);
  });
  check(header + ' stays SE when SE declared', () => {
    const r = parse(header + '\n0.2', column('sei'));
    assert.equal(r.rows[0].sei, 0.2);
  });
}
for (const header of ['vi', 'var', 'variance']) {
  check(header + ' variance alias', () => assert.equal(parse(header + '\n0.04', column('vi')).rows[0].vi, 0.04));
  for (const target of ['se', 'sd']) check(header + ' cannot become ' + target, () => {
    assert.equal(parse(header + '\n0.04', column(target)).rows[0][target], undefined);
  });
}
for (const target of ['se', 'sei', 'vi', 'variance']) check('sd cannot become ' + target, () => {
  assert.equal(parse('sd\n0.2', column(target)).rows[0][target], undefined);
});
check('SE cannot become SD', () => assert.equal(parse('se\n0.2', column('sd')).rows[0].sd, undefined));
check('unknown short headers cannot become uncertainty columns', () => {
  assert.equal(parse('xx\n0.2', column('vi')).rows[0].vi, undefined);
});
check('exact/case-insensitive claims precede fuzzy claims', () => {
  const r = parse('sd,SE,VI\n4,0.2,0.09', [{ name: 'se', type: 'float' }, { name: 'vi', type: 'float' }]);
  assert.equal(r.rows[0].se, 0.2);
  assert.equal(r.rows[0].vi, 0.09);
});
check('ordinary typo retains a named warning', () => {
  const r = parse('esitmate\n0.2', column('estimate'));
  assert.equal(r.rows[0].estimate, 0.2);
  assert.match(r.warnings.join('\n'), /esitmate.*estimate/i);
});
for (const value of ['-0.2', '', 'abc', '1e200']) check('invalid SE conversion refuses ' + JSON.stringify(value), () => {
  const r = parse('se,other\n' + value + ',x', column('vi'));
  assert.ok(r.errors && r.errors.length, JSON.stringify(r));
  assert.equal(r.rows.length, 0);
});
console.log(checks + ' parser checks passed');
