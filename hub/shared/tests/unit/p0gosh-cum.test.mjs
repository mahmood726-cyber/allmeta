import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../../../../' + p, import.meta.url), 'utf8');
const gosh = read('gosh/index.html'), cum = read('cumulative-subgroup/index.html');
function extract(source, name, context = {}) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' must exist');
  let end = source.indexOf('{', start), depth = 1;
  while (depth && ++end < source.length) { if(source[end] === '{') depth++; if(source[end] === '}') depth--; }
  return vm.runInNewContext('(' + source.slice(start, end + 1) + ')', context);
}
test('P0-29 full-data I2: heterogeneous plant and identical-effect control', () => {
  const calc = extract(gosh, 'fullDataI2');
  const rows = [0, 0, 3].map(te => ({te, se:1}));
  assert.ok(Math.abs(calc(rows) - 100*4/6) < 1e-12);
  assert.notEqual(calc(rows), 0, 'singleton-heavy subset median is not full-data I2');
  assert.equal(calc([0,0,0].map(te => ({te,se:1}))), 0);
  assert.ok(gosh.includes('median I² across subsets (not the full-data I²)')); 
});
test('P0-33 interpretation rejects homogeneous-evidence plant', () => {
  const valid = s => s.includes('subsets share an estimate') && s.includes('does not establish that heterogeneity is absent') && !s.includes('homogeneous evidence');
  assert.equal(valid(gosh), true);
  assert.equal(valid(gosh.replace('does not establish that heterogeneity is absent', 'homogeneous evidence')), false);
});
test('P0-30 fixed-effect Q differs from RE residual Q, agrees when tau2 is zero', () => {
  const sums = extract(cum, 'weightedSums');
  const rows = [0,0,3].map(est => ({est,v:1}));
  assert.equal(sums(rows,0).Q, 6);
  assert.equal(sums(rows,2).Q, 2);
  assert.notEqual(sums(rows,2).Q, sums(rows,0).Q, 'planted RE weights cannot stand for Cochran Q');
  assert.equal(sums([0,0,0].map(est => ({est,v:1})),0).Q, 0);
  assert.ok(cum.includes('Q (random-effects weights)'));
  assert.ok(cum.includes("Cochran’s Q (fixed-effect weights)"));
});
test('missing-year note names every missing study, complete-year control is empty', () => {
  const note = extract(cum, 'missingYearNote');
  const rows = [{label:'A < B',year:null},{label:'B',year:2020},{label:'C',year:null}];
  assert.equal(note(rows), 'Missing year for: A < B, C. Cumulative analysis uses input order for all studies. Add a year for every study to order chronologically.');
  assert.notEqual(note(rows), '', 'silent fallback plant must be rejected');
  assert.equal(note(rows.map(s => ({...s,year:2020}))), '');
});

test('GOSH exact display guard accepts the corrected card and rejects old label/full-data plants', () => {
  const source=read('gosh/validate/adapter.js');
  const label='median I² across subsets (not the full-data I²)';
  const pair=(k,v)=>[{className:'k',textContent:k},{className:'v',textContent:v}];
  const full={children:pair('Full-data I²','66.7%')};
  const cards=[['Subsets computed','7'],['Median estimate','0.000'],[label,'0.0%']].map(([k,v],i)=>({children:[...pair(k,v),...(i===2?[full]:[])],querySelector:s=>s==='.full-data'?(i===2?full:null):{textContent:k}}));
  const doc={querySelectorAll:()=>cards,querySelector:()=>({parentElement:{children:[{tagName:'H2',textContent:'Summary'},{tagName:'H2',textContent:'GOSH scatter'}]}})};
  const display=extract(source,'display',{document:doc});
  const s={n_subsets:7,median_est:0,median_i2:0,studies:[0,0,3].map(te=>({te,se:1}))};
  assert.equal(display(s),true);
  cards[2].children[0].textContent='Median I²';assert.equal(display(s),false);
  cards[2].children[0].textContent=label;full.children[1].textContent='0.0%';assert.equal(display(s),false);
  full.children[1].textContent='66.666666667%';assert.equal(display(s),false);
  full.children[1].textContent='66.7%';cards.push(cards[0]);assert.equal(display(s),false);
});
test('missing-year banner guard rejects silent fallback and accepts complete-year absence', () => {
  const source=read('cumulative-subgroup/validate/adapter.js');
  const message='Missing year for: A. Cumulative analysis uses input order for all studies. Add a year for every study to order chronologically.';
  let result={view:'cumulative',series:[{label:'A',year:null},{label:'B',year:2020}]};
  const el={className:'warn-banner is-visible',childNodes:[{tagName:'STRONG',textContent:'Notes',children:[]},{tagName:'UL',childNodes:[{tagName:'LI',children:[],textContent:message}]}],checkVisibility(){return this.className.includes('is-visible');}};
  const check=extract(source,'bannerOk',{document:{getElementById:()=>el},window:{_almLastCumSub:()=>result}});
  assert.equal(check([]),true);
  el.className='warn-banner';el.innerHTML='';el.childNodes=[];assert.equal(check([]),false);
  result.series[0].year=2010;assert.equal(check([]),true);
  result.view='subgroup';result.series[0].year=null;assert.equal(check([]),true);
});

test('R1 renderer precision: one decimal I2 and two decimals for both Q cards', () => {
  const i2 = gosh.match(/fullDataI2\(rows\)\.toFixed\((\d+)\)/);
  assert.ok(i2);
  const formatI2 = value => value.toFixed(Number(i2[1])) + '%';
  assert.equal(formatI2(100*4/6), '66.7%');
  assert.notEqual(formatI2(100*4/6), '66.666666667%');
  for (const expression of ['fmt(final.Q,', 'fmt(weightedSums(parsed.studies, 0).Q,']) {
    const digits = Number(cum.slice(cum.indexOf(expression) + expression.length).match(/^\d+/)[0]);
    assert.equal((6).toFixed(digits), '6.00');
    assert.notEqual((6).toFixed(digits), '6.000000000');
  }
});
test('R1 cumulative adapter expects two decimal Q displays', () => {
  const source = read('cumulative-subgroup/validate/adapter.js');
  const fmt = extract(source, 'fmt');
  const fixedQText = extract(source, 'fixedQText', {fmt});
  const cardsExpected = extract(source, 'cardsExpected', {fmt, fixedQText, pooledText:()=>''});
  const expected = cardsExpected('cumulative', {parsed:{studies:[0,0,3].map(est=>({est,v:1}))},summary:{},cum:{series:[{tau2:2,Q:2}]}});
  assert.equal(expected[3][1], '2.00');
  assert.equal(expected[4][1], '6.00');
  assert.notEqual(expected[3][1], '2.000000000');
  assert.notEqual(expected[4][1], '6.000000000');
});
