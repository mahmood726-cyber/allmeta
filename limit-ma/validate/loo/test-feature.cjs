const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {load} = require('./replay.cjs');
const options = {disabled: process.argv.includes('--disabled'), page: process.env.LIMIT_MA_PAGE};
const tests = [];
const test = (name, run) => tests.push({name, run});
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
function setup() {
  const env = load(options);
  assert.ok(env.window.AlmLimitLoo, 'leave-one-out feature must be loaded');
  return {...env, rows: env.window.AlmLimitEngine.parse(env.nodes.src.value)};
}
test('built-in deletion rows agree with main page replay for all four fields', () => {
  const {window: w, rows} = setup(), reference = load();
  const before = JSON.stringify(rows), result = w.AlmLimitLoo.compute(rows);
  assert.equal(JSON.stringify(rows), before); assert.equal(result.rows.length, 10);
  result.rows.forEach((r, i) => {
    reference.window.__almLimitValidationRun(rows.filter((_, j) => j !== i).map(r => `${r.te},${r.se}`).join('\n'), true);
    const expected = reference.window._almLastLimit();
    assert.equal(r.status, 'ok'); assert.equal(r.study, rows[i].label);
    for (const f of ['limit_est','limit_se','re_est']) close(r[f], expected[f]);
    close(r.tau2, expected.tau2_dl);
    close(r.change, r.limit_est - result.full_limit_est);
    close(r.ci_low, r.limit_est - 1.959963984540054 * r.limit_se);
    close(r.ci_high, r.limit_est + 1.959963984540054 * r.limit_se);
  });
});
test('real REML refusal has exact reason and null numbers', () => {
  const {window: w} = setup();
  const c = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus.json'))).find(c => c.id === 'dat.egger2001::001');
  const result = w.AlmLimitLoo.compute(c.te.map((te, i) => ({te, se: c.se[i]}))), r = result.rows[4];
  assert.equal(r.status, 'refused');
  assert.equal(r.reason, "Fisher scoring algorithm did not converge. See 'help(rma)' for possible remedies.");
  for (const f of ['limit_est','limit_se','re_est','tau2','change','ci_low','ci_high']) assert.equal(r[f], null);
});
test('singular deletion refused while other deletions succeed', () => {
  const {window: w} = setup();
  const result = w.AlmLimitLoo.compute([.1,.2,.3,.4].map((te, i) => ({te, se: i === 0 ? .1 : .2})));
  assert.equal(result.rows[0].status, 'refused'); assert.match(result.rows[0].reason, /variation/);
  assert.equal(result.rows.slice(1).filter(r => r.status === 'ok').length, 3);
});
test('domain boundaries reject three and 201 studies', () => {
  const {window: w, rows} = setup();
  assert.throws(() => w.AlmLimitLoo.compute(rows.slice(0,3)), /4–200/);
  assert.throws(() => w.AlmLimitLoo.compute(Array.from({length:201}, (_, i) => rows[i % rows.length])), /4–200/);
  assert.equal(w.AlmLimitLoo.compute(rows.slice(0,4)).rows.length, 4);
});
test('CSV preserves numeric signs and guards malicious labels', () => {
  const {window: w, rows} = setup();
  ['=SUM(A1)', '+1', '-formula', '@formula', '\tformula', '\rformula', '   =1', '<img src=x>'].forEach((label, i) => rows[i].label = label);
  const result = w.AlmLimitLoo.compute(rows), csv = w.AlmLimitLoo.csv(result);
  assert.ok(csv.startsWith('study,dropped,limit_est,change,limit_se,re_est,tau2,ci_low,ci_high,status,reason\r\n'));
  for (let i=0; i<7; i++) assert.ok(csv.includes('"\'' + rows[i].label + '"'));
  assert.ok(csv.includes('"<img src=x>"')); assert.ok(csv.includes(String(result.rows[0].change)));
});
test('UI calculation populates table, plot and JSON export', async () => {
  const {window: w, nodes} = setup();
  assert.equal(w._almLastLimit().leave_one_out, undefined);
  await nodes['loo-run'].click();
  const result = w.alm.exportOptions.getResults().leave_one_out;
  assert.equal(result.rows.length, 10); assert.match(nodes['loo-status'].textContent, /10\/10/);
  assert.equal((nodes['loo-body'].innerHTML.match(/<tr /g) || []).length, 10);
  assert.equal((nodes['loo-plot'].innerHTML.match(/<circle /g) || []).length, 10);
  assert.equal(nodes['loo-plot'].attrs.hidden, undefined);
  assert.ok(!nodes['loo-plot'].innerHTML.includes('NaN')); assert.equal(nodes['loo-csv'].disabled, false);
});
test('rendered labels are escaped and refusals visible', async () => {
  const {nodes} = setup(); nodes.src.value = '.1,.1,<img src=x onerror=alert(1)>\n.2,.2,B\n.3,.2,C\n.4,.2,D';
  await nodes['loo-run'].click();
  assert.match(nodes['loo-body'].innerHTML, /refused: Limit meta-analysis requires variation/);
  assert.match(nodes['loo-body'].innerHTML, /&lt;img/); assert.ok(!nodes['loo-body'].innerHTML.includes('<img'));
  assert.match(nodes['loo-plot'].innerHTML, />refused</);
});
test('input invalidation clears rows and JSON', async () => {
  const {nodes, window: w} = setup(); await nodes['loo-run'].click();
  nodes.src.value += '\n.2,.4,new'; await nodes.src.input();
  assert.equal(nodes['loo-body'].innerHTML, ''); assert.equal(nodes['loo-plot'].attrs.hidden, '');
  assert.equal(w._almLastLimit().leave_one_out, undefined); assert.equal(nodes['loo-csv'].disabled, true);
});
test('rerunning main analysis invalidates old deletion results', async () => {
  const {nodes, window: w} = setup(); await nodes['loo-run'].click(); await nodes['btn-run'].click();
  assert.equal(w._almLastLimit().leave_one_out, undefined); assert.equal(nodes['loo-body'].innerHTML, '');
});
test('validation snapshot restores completed deletion results', async () => {
  const {nodes, window: w} = setup(); await nodes['loo-run'].click();
  const snap = w.__almLimitValidationSnapshot(), json = JSON.stringify(w._almLastLimit().leave_one_out);
  w.__almLimitValidationRun('.1,.2\n.2,.3\n.3,.4', true);
  w.__almLimitValidationRestore(snap);
  assert.equal(JSON.stringify(w._almLastLimit().leave_one_out), json);
  assert.equal((nodes['loo-body'].innerHTML.match(/<tr /g) || []).length, 10);
});
test('editing during asynchronous calculation cancels obsolete export', async () => {
  const {nodes, window: w} = setup();
  const pending = nodes['loo-run'].click(); nodes.src.value += '\n.2,.4,new'; await nodes.src.input(); await pending;
  assert.equal(w._almLastLimit().leave_one_out, undefined); assert.equal(nodes['loo-body'].innerHTML, '');
  assert.equal(nodes['loo-csv'].disabled, true); assert.equal(nodes['loo-run'].disabled, false);
});
test('independent validation preserves its lock on the calculation control', () => {
  const {nodes, window: w} = setup(); nodes['loo-run'].disabled = true;
  w.__almLimitValidationRun('.1,.2\n.2,.3\n.3,.4', true);
  assert.equal(nodes['loo-run'].disabled, true);
});
(async () => {
  let passed = 0;
  for (const {name, run} of tests) {
    try { await run(); passed++; console.log('PASS ' + name); }
    catch (e) { console.log('FAIL ' + name + '\n' + e.stack); }
  }
  console.log(`${passed}/${tests.length} feature checks passed`);
  if (passed !== tests.length) process.exitCode = 1;
})();
