import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../../../', import.meta.url);
const html = fs.readFileSync(new URL('pubbias-tests/index.html', root), 'utf8');
const writer = fs.readFileSync(new URL('hub/shared/url-state.js', root), 'utf8');
const engine = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('    function pnorm('), html.indexOf('    // REML slope sign')), engine);
const rows = (effects) => effects.map((te, i) => ({te, se: [.1,.15,.2,.12,.3,.25][i]}));
function undefinedBegg(data) {
  const r = engine.beggMazumdar(data);
  assert.ok(Number.isNaN(r.tau));
  assert.ok(Number.isNaN(r.p));
}
test('Begg: equal nonzero effects are undefined in both row orders (defect)', () => {
  const data = rows(Array(6).fill(.2));
  undefinedBegg(data); undefinedBegg(data.reverse());
});
test('Begg: zero effects also need an undefined p-value (defect)', () => undefinedBegg(rows(Array(6).fill(0))));
test('Begg: numerically equal residuals are undefined (defect)', () => {
  undefinedBegg(rows([.2,.2+1e-15,.2,.2-1e-15,.2,.2]));
});
test('Begg: pb-tiny tied-variance reference remains unchanged (control)', () => {
  const r = engine.beggMazumdar([[.55,.08],[.48,.10],[.70,.15],[.60,.09],[.30,.07],[.75,.20],[.52,.08],[.65,.12],[.45,.17],[.58,.10]].map(([te,se])=>({te,se})));
  assert.ok(Math.abs(r.tau - .4319297483313) < 1e-9);
  assert.ok(Math.abs(r.p - .0866808449466936) < 1e-9);
});
function verdict(t) {
  const c = vm.createContext({tests:[t], body:{innerHTML:''}, fmt:String});
  vm.runInContext(html.slice(html.indexOf('      for (var ii = 0; ii < tests.length; ii++)'), html.indexOf('      // Egger-on-binary caveat')), c);
  return c.body.innerHTML;
}
test('Begg: undefined result has no significance verdict (defect)', () => {
  const s=verdict(engine.beggMazumdar(rows(Array(6).fill(0))));
  assert.match(s, /undefined/); assert.doesNotMatch(s, /no evidence|evidence of bias/);
});
test('Begg: defined significant and nonsignificant verdicts (control)', () => {
  assert.match(verdict({statistic:2,p:.01}), /evidence of bias/);
  assert.match(verdict({statistic:0,p:.5}), /no evidence/);
});
function sharing() {
  const note = {hidden:true};
  const c=vm.createContext({window:{location:{hash:''}},console:{warn(){}},
    btoa:s=>Buffer.from(s,'binary').toString('base64'), atob:s=>Buffer.from(s,'base64').toString('binary'),
    escape,unescape,encodeURIComponent,decodeURIComponent,
    document:{getElementById:()=>note},fmt_:'te-se'});
  vm.runInContext(writer,c);
  const block=html.split('// URL state')[1].split(/\r?\n    }/)[0];
  return {c,note,write(text){c.text=text;vm.runInContext(block,c);return c.window.alm.urlState.read();}};
}
test('Share: all 60 rows survive a URL round trip (defect)', () => {
  const s=Array.from({length:60},(_,i)=> (.2+i/1000).toFixed(4)+', 0.1701').join('\n');
  assert.equal(sharing().write(s).src,s);
});
test('Share: short data and format round trip (control)', () => {
  const h=sharing(), s='0.2, 0.1\n0.3, 0.2';
  assert.equal(h.write(s).src,s); assert.equal(h.write(s).format,'te-se'); assert.equal(h.note.hidden,true);
});
test('Share: oversized Unicode refuses link and clears stale data (defect)', () => {
  const h=sharing(); h.write('0.2, 0.1'); h.write('界'.repeat(2000));
  assert.equal(h.c.window.location.hash,''); assert.equal(h.note.hidden,false);
  assert.equal(h.write('0.3, 0.1').src,'0.3, 0.1'); assert.equal(h.note.hidden,true);
});
test('Share: suspended writes preserve hash and notice (control)', async () => {
  const h=sharing(); h.write('0.2, 0.1'); const hash=h.c.window.location.hash;
  for (const hidden of [true,false]) {
    h.note.hidden=hidden;
    await h.c.window.alm.urlState.withoutWrites(()=>h.write('x'.repeat(5000)));
    assert.equal(h.c.window.location.hash,hash); assert.equal(h.note.hidden,hidden);
  }
});

test('Begg: too few studies remain undefined (control)', () => undefinedBegg([{te:.2,se:.1}]));
test('Begg: numerical partial ties use the same groups for tau and p (defect)', () => {
  const data=[{te:.2,se:.1},{te:.2,se:.1},{te:.5,se:.2},{te:.7,se:.3},{te:-.2,se:.4}];
  const expected=engine.beggMazumdar(data);
  data[1].te+=1e-15;
  const actual=engine.beggMazumdar(data);
  assert.ok(Math.abs(actual.tau-expected.tau)<1e-12);
  assert.ok(Math.abs(actual.p-expected.p)<1e-12);
});
