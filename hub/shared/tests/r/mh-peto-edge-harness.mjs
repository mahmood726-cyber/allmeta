import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const tolerance = 1e-6; // Absolute, including CIs and statistics; no iterative exception.
export const input = JSON.parse(readFileSync(new URL('./mh-peto-edge-input.json', import.meta.url), 'utf8'));
export function reference() {
  return JSON.parse(readFileSync(new URL('./mh-peto-edge-reference.json', import.meta.url), 'utf8'));
}
export function loadEngine(mutation) {
  const html = readFileSync(new URL('../../../../mh-peto/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('// ---- engine (unchanged from pre-retrofit) ----');
  const end = html.indexOf('// ---- axis state');
  assert.ok(start >= 0 && end > start, 'The real page engine markers must exist');
  let source = html.slice(start, end);
  if (mutation) {
    const [before, after] = mutation;
    assert.equal(source.split(before).length - 1, 1, 'Mutation must identify exactly one real engine expression');
    source = source.replace(before, after);
  }
  const context = vm.createContext({});
  const engine = vm.runInContext(`(function(){${source}\nreturn {analyse,leaveOneOut,perStudy};})()`, context);
  for (const file of ['ma-core.js', 'fragility.js']) {
    vm.runInContext(readFileSync(new URL(`../../../../shared/${file}`, import.meta.url), 'utf8'), context);
  }
  engine.dl = (rows, measure) => {
    const a = rows.map(r => r.e1), b = rows.map(r => r.n1-r.e1);
    const c = rows.map(r => r.e2), d = rows.map(r => r.n2-r.e2);
    const p = context.AlmFragility._pool(a,b,c,d,measure);
    const es = rows.map((_,i) => context.AlmFragility._escalc(a[i],b[i],c[i],d[i],measure)).filter(Boolean);
    // tau2 is internal to the DL dependency; only beta/CI are displayed by mh-peto.
    const tau2 = es.length ? context.AlmMaCore.tau2DL(es.map(e => e.yi), es.map(e => e.vi)) : null;
    return { beta:p ? p.mu : null, lo:p ? p.ciLo : null, hi:p ? p.ciHi : null, tau2 };
  };
  return engine;
}
export function near(actual, expected, label) {
  if (typeof expected === 'boolean') {
    assert.equal(actual,expected,label);
  } else if (expected === null) {
    assert.equal(actual, null, `${label}: app=${actual}, R=null`);
  } else {
    assert.ok(typeof expected === 'number' && Number.isFinite(expected), `${label}: invalid R evidence`);
    assert.ok(typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual-expected) <= tolerance,
      `${label}: app=${actual}, R=${expected}, absolute difference=${Math.abs(actual-expected)} (limit ${tolerance})`);
  }
}
const fitKeys = ['beta','se','z','p','lo','hi'];
const hetKeys = ['QE','QEp','I2','H2'];
// Groups retain quantity identities so an explicitly documented TODO need not hide other fields.
export function comparisons(engine, oracle) {
  const groups = [];
  function group(name, actual, expected, keys=Object.keys(expected)) {
    groups.push({name, checks:keys.map(key => ({key,actual:actual[key],expected:expected[key]}))});
  }
  for (const cfg of input.cases) for (const measure of ['OR','RR','RD']) {
    const id = `${cfg.id}|${measure}`, r = oracle.configurations[id];
    assert.ok(r, `Missing R configuration ${id}`);
    const a = engine.analyse(cfg.rows, measure);
    for (const method of measure === 'OR' ? ['mh','peto'] : ['mh']) {
      const fit = a[`${method}Fit`] || Object.fromEntries(fitKeys.map(k => [k,null]));
      group(`${id}|${method}.inference`, fit, r[method].values, fitKeys);
      group(`${id}|${method}.heterogeneity`, a.het[method], r[method].values, hetKeys);
      if (!r[method].error) group(`${id}|${method}.effective-count`, a.het[method], r[method].values, ['k','df']);
    }
    if (measure === 'OR') group(`${id}|association`, a.het.assoc, r.association.values);
    group(`${id}|meta.inference`, a.conv.metaDefault, r.meta.values);
    group(`${id}|iv.inference`, a.conv.iv, r.iv.values);
    const studies = engine.perStudy(cfg.rows,measure);
    assert.equal(studies.length,r.studies.length);
    group(`${id}|study.intervals`, Object.fromEntries(studies.flatMap((s,i) => ['est','lo','hi'].map(k => [`${i+1}.${k}`,s[k]]))),
      Object.fromEntries(r.studies.flatMap((s,i) => ['est','lo','hi'].map(k => [`${i+1}.${k}`,s[k]]))));
    group(`${id}|dl.baseline`,engine.dl(cfg.rows,measure),r.dl.values);
    const loo = engine.leaveOneOut(cfg.rows,measure);
    if (cfg.rows.length < 3) {
      assert.match(loo.refused,/at least 3 tables/);
      assert.equal(r.loo,undefined);
      continue;
    }
    assert.equal(loo.rows.length,cfg.rows.length);
    assert.equal(r.loo.length,cfg.rows.length);
    for (let i=0;i<cfg.rows.length;i++) for (const method of measure === 'OR' ? ['mh','peto'] : ['mh']) {
      const row = loo.rows[i], ref = r.loo[i][method];
      assert.equal(row.omit,i+1);
      assert.equal(row.label,cfg.rows[i].label);
      group(`${id}|omit${i+1}.${method}`,row[method],ref.values,
        [...fitKeys,...hetKeys,...(ref.error ? [] : ['k','df'])]);
      const fullP = r[method].values.p, omittedP = ref.values.p;
      const flip = fullP === null || omittedP === null ? null : (fullP < .05) !== (omittedP < .05);
      group(`${id}|omit${i+1}.${method}.flag`,{flip:row.flags[`${method}_flip`]},{flip});
    }
  }
  return groups;
}
export function checkGroup(group, excluded=[]) {
  const errors = [];
  for (const c of group.checks.filter(c => !excluded.includes(c.key))) {
    try { near(c.actual,c.expected,`${group.name}.${c.key}`); }
    catch(error) { errors.push(error.message); }
  }
  assert.deepEqual(errors,[],group.name);
}
