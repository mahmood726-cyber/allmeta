// Negative controls for multi-arm support. Run from the repository root:
//   node nma-inconsistency/tests/multiarm-negative.mjs
// 1. Malformed multi-arm input is refused (inconsistent effects beyond
//    netmeta's tol.multiarm, an omitted contrast, a duplicated comparison, a
//    negative arm variance), and the acceptance boundary is netmeta's: the
//    absolute projection residual |TE - B ginv(B) TE| <= 0.001, no SE check.
// 2. The parity comparator can fail: a planted 1e-3 change to one accepted
//    contrast, and the pre-change engine that treats a multi-arm study's
//    contrasts as independent, both produce mismatches against netmeta.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { harness, engine } from './numerics-harness.mjs';
import { compareFit, TOL } from './multiarm-parity.mjs';

const oracle = JSON.parse(readFileSync(new URL('../validate/multiarm-oracle.json', import.meta.url), 'utf8'));
const ds = name => oracle.datasets.find(d => d.name === name);
const h = harness();
const E = engine(h.c);
let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; console.log('ok   ' + msg); }

const syn = ds('synthetic-3arm-4arm');
const lines = syn.text.split('\n');
const fields = l => l.split(',');
const study = l => fields(l)[4];
const s04 = lines.filter(l => study(l) === '"S04"');      // the 4-arm study
const s01 = lines.filter(l => study(l) === '"S01"');      // a 3-arm study
assert.equal(s04.length, 6); assert.equal(s01.length, 3);
const withLine = (old, neu) => lines.map(l => l === old ? neu : l).join('\n');
const setField = (l, i, v) => { const f = fields(l); f[i] = String(v); return f.join(','); };
function refusal(text) {
  h.elements.get('f-model').value = 'FE';
  h.c.__almIncoLoad(text);
  const st = h.c._almLastInco();
  return st && st.status === 'refused' ? st.reason : null;
}

// --- 1. refusals -----------------------------------------------------------
ok(refusal(syn.text) === null, 'unperturbed synthetic network is accepted');
let r = refusal(withLine(s04[2], setField(s04[2], 2, Number(fields(s04[2])[2]) + 0.05)));
ok(/S04.*internally inconsistent/.test(r || ''), `planted +0.05 on one 4-arm contrast is refused: ${r}`);
// One 3-arm contrast moved by d leaves a projection residual of d * (1 - 2/3) = d/3.
r = refusal(withLine(s01[0], setField(s01[0], 2, Number(fields(s01[0])[2]) + 0.0029)));
ok(r === null, `+0.0029 on one 3-arm contrast (residual 0.00097 <= 0.001) is accepted, as by netmeta: ${r}`);
r = refusal(withLine(s01[0], setField(s01[0], 2, Number(fields(s01[0])[2]) + 0.0031)));
ok(/S01.*internally inconsistent/.test(r || ''), `+0.0031 on one 3-arm contrast (residual 0.00103 > 0.001) is refused: ${r}`);
// 4 arms: residual d * (1 - 2/4) = d/2.
r = refusal(withLine(s04[2], setField(s04[2], 2, Number(fields(s04[2])[2]) + 0.0019)));
ok(r === null, `+0.0019 on one 4-arm contrast (residual 0.00095) is accepted: ${r}`);
r = refusal(withLine(s04[2], setField(s04[2], 2, Number(fields(s04[2])[2]) + 0.0021)));
ok(/S04.*internally inconsistent/.test(r || ''), `+0.0021 on one 4-arm contrast (residual 0.00105) is refused: ${r}`);
r = refusal(lines.filter(l => l !== s04[5]).join('\n'));
ok(/S04.*4 treatments but 5 contrasts.*6 pairwise/.test(r || ''), `dropping one 4-arm contrast is refused: ${r}`);
r = refusal(lines.filter(l => l !== s01[1]).join('\n'));
ok(/S01.*3 treatments but 2 contrasts/.test(r || ''), `dropping one 3-arm contrast is refused: ${r}`);
{
  const f = fields(s04[0]);
  const flipped = [f[1], f[0], String(-Number(f[2])), f[3], f[4]].join(',');
  r = refusal(withLine(s04[1], flipped));
  ok(/S04.*same comparison more than once/.test(r || ''), `a duplicated comparison inside a multi-arm study is refused: ${r}`);
}
r = refusal(withLine(s04[3], setField(s04[3], 3, Number(fields(s04[3])[3]) * 1.01)));
ok(r === null, `a 4-arm SE off by 1% is accepted (netmeta does not check SE consistency by default): ${r}`);
{
  // 3-arm study whose SEs imply a negative arm variance: var(AB) >> var(AC) + var(BC)
  const t = s01.map((l, i) => setField(l, 3, i === 0 ? 2 : 0.1));
  r = refusal(lines.map(l => (s01.includes(l) ? t[s01.indexOf(l)] : l)).join('\n'));
  ok(/S01.*negative arm variance/.test(r || ''), `SEs implying a negative arm variance are refused: ${r}`);
}
ok(refusal('A,B,.2,.1,s1\nA,B,.3,.2,s1\nA,C,.5,.15,s2') === 'Repeated study IDs are unsupported: enter one independent contrast per study.',
  'a repeated two-treatment study keeps the existing refusal');
ok(E.inputIssue(h.c.parse(syn.text)) === null, 'engine inputIssue accepts the complete consistent network');
// Rounded and planted networks: the page's verdict must equal netmeta's (oracle).
for (const name of ['synthetic-rounded-3dp', 'synthetic-rounded-2dp', 'smokingcessation-rounded-2dp', 'synthetic-planted-0.01']) {
  const d = ds(name);
  ok(d, `oracle has ${name}`);
  for (const model of ['FE', 'DL', 'PM']) {
    const nm = d.models[model];
    h.elements.get('f-model').value = model;
    h.c.__almIncoLoad(d.text);
    const st = h.c._almLastInco();
    ok((st.status === 'refused') === (nm.status !== 'ok'),
      `${name} ${model}: netmeta ${nm.status === 'ok' ? 'accepts' : 'refuses'} (max projection residual ${d.maxMultiarmResidual.toPrecision(3)}), page ${st.status === 'refused' ? 'refuses: ' + st.reason : 'accepts'}`);
  }
}
ok(ds('synthetic-planted-0.01').models.FE.status !== 'ok' && /tol\.multiarm|inconsistent/i.test(ds('synthetic-planted-0.01').models.FE.netmetaError),
  'netmeta refuses the planted +0.01 for inconsistent treatment estimates');
ok(ds('synthetic-rounded-3dp').models.FE.status === 'ok', 'netmeta accepts the 3-decimal rounded network');

// --- 2. the parity comparator can fail ---------------------------------------
{
  // a two-arm contrast moved by 1e-3: accepted, but no longer netmeta's data
  const two = lines.find(l => study(l) === '"S05"');
  const text = withLine(two, setField(two, 2, Number(fields(two)[2]) + 1e-3));
  for (const model of ['FE', 'DL', 'PM']) {
    h.elements.get('f-model').value = model;
    h.c.__almIncoLoad(text);
    const st = JSON.parse(JSON.stringify(h.c._almLastInco()));
    ok(st.status !== 'refused', `planted 1e-3 on two-arm S05 is accepted (${model})`);
    const bad = compareFit(st, syn.models[model], {}, `[planted ${model}]`);
    ok(bad.length > 0, `parity fails on the planted value (${model}): ${bad.length} mismatches, e.g. ${bad[0]}`);
  }
}
{
  // the pre-change engine (independent contrasts), gate bypassed
  const original = JSON.parse(readFileSync(new URL('./fixtures/p16-original-source.json', import.meta.url), 'utf8'));
  const O = engine(harness(original).c);
  for (const name of ['synthetic-3arm-4arm', 'smokingcessation-OR', 'Woods2010-OR']) {
    const d = ds(name), rows = h.c.parse(d.text);
    for (const model of ['FE', 'DL']) {
      const tau2 = O.estimateTau2(rows, model);
      const est = fit => Object.fromEntries(fit.trts.map((t, i) => [t, i === 0 ? { est: 0, se: 0 } : { est: fit.beta[i - 1], se: Math.sqrt(fit.cov[i - 1][i - 1]) }]));
      const f0 = O.fitNMA(rows), f1 = O.fitNMA(rows, undefined, tau2), g = O.dbt(rows, tau2);
      const st = { trts: f0.trts, Q: f0.Q, df: f0.df, tau2, Qrandom: f1.Q, estimates: est(f0), estimatesRandom: est(f1),
        nodeSplit: O.nodeSplit(rows, undefined, tau2), dbt: { Q: g.Q, df: g.df, p: Number.isFinite(g.p) ? g.p : null } };
      const bad = compareFit(st, d.models[model], {}, `[independent-contrast ${name} ${model}]`);
      ok(bad.length > 0, `pre-change independent-contrast engine fails parity on ${name} ${model}: ${bad.length} mismatches, e.g. ${bad[0]}`);
    }
  }
}
console.log(`multiarm negative controls: ${passed} passed (parity tolerance ${TOL})`);
