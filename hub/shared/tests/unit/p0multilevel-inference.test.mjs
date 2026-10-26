import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const base = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('multilevel-ma/index.html', base), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const sample = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1];
function app(input = sample, reml = true) {
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, {value: id === 'src' ? input : '', innerHTML: '', setAttribute(){}, addEventListener(){}}); return nodes.get(id); };
  const captures = {};
  const alm = {analysisLifecycle: f => f, csvUpload(){}, axisControls(){}, tooltips(){}, resetUndo(){},
    plotExport: x => captures.plot = x, resultsExport: x => captures.export = x,
    urlState: Object.assign(() => {}, {read: () => null, write(){}})};
  const ctx = vm.createContext({alm, document: {getElementById: node, readyState: 'complete'},
    GradePush: {attach: x => captures.grade = x}, MaPooled: {}});
  ctx.window = ctx;
  for (const path of ['shared/stats-qt.js', ...(reml ? ['shared/multilevel-reml.js'] : [])]) vm.runInContext(readFileSync(new URL(path, base), 'utf8'), ctx);
  vm.runInContext(scripts.find(s => s.includes('function fit(rows)')), ctx);
  vm.runInContext(scripts.find(s => s.includes('GradePush.attach')), ctx);
  return {ctx, node, captures, rows: ctx.__almMlmaParse(input), result: ctx._almLastMlma()};
}
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-10, a + ' != ' + b);
// Independent oracle: pool within each study, then combine study means with
// sampling variance 1/sum(1/D) plus the study random-intercept variance.
function oracle(rows, within, between) {
  const groups = new Map();
  for (const row of rows) { if (!groups.has(row.study)) groups.set(row.study, []); groups.get(row.study).push(row); }
  let info = 0, num = 0;
  for (const group of groups.values()) {
    const precision = group.reduce((s,r) => s + 1/(r.se*r.se + within),0);
    const mean = group.reduce((s,r) => s + r.te/(r.se*r.se + within),0)/precision;
    const w = 1/(1/precision + between); info += w; num += w*mean;
  }
  return {mu:num/info,se:Math.sqrt(1/info)};
}
test('P0-6 plant: MoM uncertainty accounts for repeated study effects', () => {
  const a = app(sample,false), r = a.result;
  const expected = oracle(a.rows,r.tau2_within,r.tau2_study);
  assert.ok(r.tau2_study > 0); close(r.mu,expected.mu); close(r.seMu,expected.se);
});
test('P0-6 control: one effect per study retains marginal precision inference', () => {
  const a = app('1,0.1,0.1\n2,0.5,0.12\n3,-0.3,0.15',false), r=a.result;
  const expected=oracle(a.rows,r.tau2_within,r.tau2_study); close(r.mu,expected.mu); close(r.seMu,expected.se);
});
test('P0-7 plant: recommended REML feeds exports, weights, pooled row, diamond and GRADE', () => {
  const a=app(), r=a.result, reml=a.ctx.__almReml();
  close(r.mu,reml.mu); close(r.seMu,reml.se); close(r.ci_lb_z,reml.ciLo); close(r.ci_ub_z,reml.ciHi);
  assert.equal(r.method,'REML'); assert.equal(a.captures.export.getResults(),r);
  assert.equal(a.captures.plot.getReceiptInput().results,r);
  assert.match(a.captures.plot.getReceiptInput().method,/REML/);
  const grade=a.captures.grade.getPooled(); close(grade.mu,reml.mu); close(grade.lo,reml.ciLo); close(grade.hi,reml.ciHi);
  assert.equal(grade.k,6); assert.equal(r.k,13); assert.equal(r.J,6);
  const body=a.node('body').innerHTML; assert.ok(body.includes(reml.mu.toFixed(3)+' ['+reml.ciLo.toFixed(3)+', '+reml.ciHi.toFixed(3)+']'));
  const sumByStudy=new Map(); for(const row of a.rows) sumByStudy.set(row.study,(sumByStudy.get(row.study)||0)+1/(row.se**2+reml.sigma2Within));
  const weights=a.rows.map(row=>1/(row.se**2+reml.sigma2Within)/(1+reml.sigma2Between*sumByStudy.get(row.study)));
  const sum=weights.reduce((s,w)=>s+w,0); const shown=[...body.matchAll(/<td>([0-9.]+)%<\/td>/g)].slice(0,-1).map(m=>Number(m[1]));
  assert.deepEqual(shown,Array.from(weights,w=>Number((100*w/sum).toFixed(1))));
  const lo=Math.min(0,...a.rows.map(r=>r.te-1.959963984540054*r.se),reml.ciLo), hi=Math.max(0,...a.rows.map(r=>r.te+1.959963984540054*r.se),reml.ciHi);
  const pad=(hi-lo)*0.1, X=v=>180+(v-lo+pad)/(hi-lo+2*pad)*390;
  const points=a.node('forest').innerHTML.match(/<polygon points="([^"]+)"/)[1].split(' ').map(p=>Number(p.split(',')[0]));
  close(points[0],X(reml.ciLo));close(points[1],X(reml.mu));close(points[2],X(reml.ciHi));
});
test('P0-7 control: unavailable REML retains explicitly labelled covariance-aware MoM', () => {
 const a=app(sample,false); assert.equal(a.ctx.__almReml(),null); assert.equal(a.result.method,'MoM');
 const g=a.captures.grade.getPooled(); close(g.mu,a.result.mu); assert.equal(g.k,a.result.J);
 assert.match(a.captures.plot.getReceiptInput().method,/MoM/);
});

test('P0-6 plant: supplementary MoM scale uses the full covariance quadratic form', () => {
  const a=app(sample,false), r=a.result;
  const groups=new Map(); for(const row of a.rows) { if(!groups.has(row.study)) groups.set(row.study,[]); groups.get(row.study).push(row); }
  let Q=0,info=0;
  for(const rows of groups.values()) {
    const precision=rows.reduce((s,x)=>s+1/(x.se*x.se+r.tau2_within),0);
    const mean=rows.reduce((s,x)=>s+x.te/(x.se*x.se+r.tau2_within),0)/precision;
    const weight=1/(1/precision+r.tau2_study);info+=weight;
    Q+=rows.reduce((s,x)=>s+(x.te-mean)**2/(x.se*x.se+r.tau2_within),0)+weight*(mean-r.mu)**2;
  }
  close(r.seMuHK,Math.sqrt(Math.max(1,Q/(r.J-1))/info));
});
test('P0-6 control: zero study variance preserves independent-effect precision', () => {
  const a=app('1,0.2,0.1\n1,0.2,0.12\n2,0.2,0.13\n3,0.2,0.15',false), r=a.result;
  close(r.tau2_study,0);close(r.mu,0.2);close(r.seMu,Math.sqrt(1/a.rows.reduce((s,x)=>s+1/(x.se*x.se),0)));
});
test('P0-7 control: singleton studies retain their study count and REML intervals exclude MoM scaling', () => {
  const a=app('1,0.1,0.1\n2,0.5,0.12\n3,-0.3,0.15');
  assert.equal(a.captures.grade.getPooled().k,3);assert.equal(a.result.k,3);
  for(const key of ['seMuHK','ci_lb_hk','ci_ub_hk','pi_lb','pi_ub']) assert.equal(a.result[key],null);
});

test('review plant: insufficient input clears every previous rendered result', () => {
  for (const input of ['', '1,0.1,0.1\n2,0.5,0.12']) {
    const a = app();
    assert.ok(a.node('forest').innerHTML.includes('<polygon'));
    a.node('src').value = input;
    a.ctx.__almMlmaRun();
    assert.equal(a.ctx._almLastMlma(), null);
    assert.equal(a.ctx.__almReml(), null);
    assert.equal(a.captures.export.getResults(), null);
    assert.equal(a.captures.plot.getReceiptInput(), null);
    assert.equal(a.captures.grade.getPooled(), null);
    assert.equal(a.node('body').innerHTML, '');
    assert.equal(a.node('forest').innerHTML, '');
    assert.ok(!a.node('summary').innerHTML.includes('<table'));
  }
});
test('review control: valid input after refusal restores the current fit and plot', () => {
  const a = app('');
  const input = '1,0.1,0.1\n2,0.5,0.12\n3,-0.3,0.15';
  a.node('src').value = input;
  a.ctx.__almMlmaRun();
  const expected = app(input).result, actual = a.ctx._almLastMlma();
  close(actual.mu, expected.mu); close(actual.seMu, expected.seMu);
  assert.equal(actual.method, 'REML');
  assert.equal(a.captures.export.getResults(), actual);
  assert.equal(a.captures.plot.getReceiptInput().results, actual);
  close(a.captures.grade.getPooled().mu, actual.mu);
  assert.ok(a.node('summary').innerHTML.includes('<table'));
  assert.ok(a.node('body').innerHTML.includes('Pooled (REML)'));
  assert.ok(a.node('forest').innerHTML.includes('<polygon'));
});
