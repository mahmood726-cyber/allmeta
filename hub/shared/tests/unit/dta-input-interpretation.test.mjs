import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../../../../dta-sroc/index.html', import.meta.url), 'utf8');
const plus = readFileSync(new URL('../../../../dta-sroc/plus-ui.js', import.meta.url), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('    const COUNT_FIELDS'), html.indexOf('    // Per-study points')), ctx);
const parse = (s, mode = '') => JSON.parse(JSON.stringify(ctx.parseStudies(s, mode)));
function threshold(rho) {
  const c = vm.createContext({a: {rho}, parts: [], extras: [], statCard: (k,v) => v, fmt: String});
  const lines = html.split('\n').filter(s => s.includes('if (a.rho != null) parts.push') || (s.includes('if (a.rho != null &&') && s.includes('extras.push')));
  assert.equal(lines.length, 2);
  vm.runInContext(lines.join('\n'), c);
  return {card:c.parts.join(''), note:c.extras.join('')};
}
function extras() {
  const elements = new Map();
  const document = {getElementById(id) {
    if (!elements.has(id)) elements.set(id, {value:'', textContent:'', innerHTML:'', addEventListener(){}, replaceChildren(){}});
    return elements.get(id);
  }};
  const c = vm.createContext({document});
  vm.runInContext(plus, c);
  for (const [key,value] of Object.entries({at:'0', prevalence:'0.1', method:'reml', correction:'all'})) document.getElementById('plus-'+key).value=value;
  return {ui:c.AlmDTAPlusUI, document};
}
test('P0-1: negative threshold correlation does not warn', () => {
  const r=threshold(-0.75); assert.ok(!r.card.includes('⚠')); assert.equal(r.note,'');
});
test('P0-1 control: positive correlation warns, boundary and undefined do not', () => {
  assert.ok(threshold(0.75).card.includes('⚠')); assert.match(threshold(0.75).note,/threshold effect/);
  for (const rho of [0.6, 0, null]) { assert.ok(!threshold(rho).card.includes('⚠')); assert.equal(threshold(rho).note,''); }
});
test('P0-24: extras interprets TP,FP,FN,TN,x like main input', () => {
  const {ui,document}=extras(); document.getElementById('plus-data').value='85,10,15,140,2';
  const row=ui.input().rows[0]; assert.equal(row.FP,10); assert.equal(row.FN,15);
  assert.match(document.getElementById('alm-plus').innerHTML,/TP,FP,FN,TN,x/);
});
test('P0-24 control: reference loading round-trips named counts and covariate', () => {
  const {ui}=extras(); const s={rows:[{TP:85,FP:10,FN:15,TN:140,x:2}],method:'ml',correction:'none',at:'2',prevalence:'0.2'};
  ui.set(s); assert.deepEqual(JSON.parse(JSON.stringify(ui.input().rows)),s.rows);
});
test('U-DTA-PARSE: extra fields cannot shift counts into labels', () => {
  for (const bad of ['Ahmed 2015,45,6,5,94,150','A,1,000,2,3,4','A,80,5,12,20,88','A,80,12,20,88,','A,80,12,20,88,extra']) {
    const r=parse('Good,80,12,20,88\n'+bad); assert.equal(r.studies.length,0,bad); assert.match(r.warnings.join(' '),/Analysis blocked/);
  }
  assert.equal(parse('A,80,12,20,88,3,4','last').studies.length,0);
});
test('U-DTA-PARSE control: canonical counts, headers, tabs, zero cells and covariates', () => {
  const r=parse('# comment\nstudy,TP,FP,FN,TN\nAhmed 2015,45,6,5,94\nB\t0\t12\t20\t88');
  assert.equal(r.warnings.length,0); assert.deepEqual(r.studies[0],{label:'Ahmed 2015',tp:45,fp:6,fn:5,tn:94,cov:null}); assert.equal(r.studies.length,2);
  assert.equal(parse('A,80,12,20,88,group A','last').studies[0].cov,'group A');
  for (const bad of ['A,80,12,20','A,80,,20,88','A,-1,12,20,88','A,0,12,0,88']) assert.equal(parse(bad).studies.length,0);
});

test('U-DTA-PARSE: quoted labels preserve commas and escaped quotes without shifting counts', () => {
  const r=parse('"Ahmed, 2015",45,6,5,94\n"Study ""A""",80,12,20,88');
  assert.equal(r.warnings.length,0); assert.equal(r.studies[0].label,'Ahmed, 2015'); assert.equal(r.studies[0].tp,45); assert.equal(r.studies[1].label,'Study "A"');
  for (const bad of ['"A,80,12,20,88','"A"junk,80,12,20,88','A"B,80,12,20,88']) assert.equal(parse(bad).studies.length,0);
});
test('U-DTA-PARSE: upload label serialization round-trips punctuation', () => {
  for (const label of ['Study, Alpha','Ahmed, 2015','Study "A"','Plain']) {
    const encoded=ctx.formatStudyLabel(label);
    assert.equal(parse(encoded+',80,12,20,88').studies[0].label,label);
  }
});
