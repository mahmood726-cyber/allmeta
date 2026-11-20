// shared/fragility.js serves two papers with two different, separately validated conventions:
//  - the fragility page (paper 33) follows fragility::frag.ma defaults: double-zero studies kept (drop00 = FALSE,
//    +1/2), candidates scanned control arms first then treatment arms, a single study refused;
//  - the MH/Peto page (paper 10, validated at allmeta 7433ef7 / 1cb3f84) reports a DL fragility index whose stored
//    oracle (mh-peto/validate/corpus/fragility-reference.json) drops double-zero studies and scans study by study.
// Requirement: the MH/Peto page keeps reproducing its stored oracle exactly, and the default stays frag.ma.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
function engine() {
  const ctx = { console, Math }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of ['shared/ma-core.js', 'shared/fragility.js']) vm.runInContext(read(f), ctx, { filename: f });
  return ctx.AlmFragility;
}
const F = engine();
const LEGACY = 'mh-peto-v1';
const same = (a, b) => (a == null || b == null) ? (a ?? null) === (b ?? null)
  : Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) / Math.max(1, Math.abs(b)) <= 1e-9;

test('the MH/Peto page asks for its validated convention', () => {
  const html = read('mh-peto/index.html');
  const calls = [...html.matchAll(/AlmFragility\.fragility\(([\s\S]*?)\);/g)].map(m => m[1]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], new RegExp(`convention:\\s*'${LEGACY}'`));
});

test('the fragility page uses the frag.ma default (no convention override)', () => {
  assert.doesNotMatch(read('fragility/index.html'), /convention\s*:/);
});

test('an unknown convention is refused, not silently defaulted', () => {
  const s = [{ e1: 2, n1: 50, e0: 15, n0: 50 }, { e1: 3, n1: 60, e0: 12, n0: 60 }];
  assert.throws(() => F.fragility(s, { measure: 'OR', convention: 'frag.mx' }), /convention/);
  assert.throws(() => F.fragility(s, { measure: 'OR', convention: null }), /convention/);
});

test('mh-peto convention reproduces the stored paper-10 fragility oracle on the whole corpus', () => {
  const corpus = JSON.parse(read('mh-peto/validate/corpus/corpus.json'));
  const fr = new Map(JSON.parse(read('mh-peto/validate/corpus/fragility-reference.json')).map(r => [r.id, r]));
  let checks = 0; const bad = [];
  for (const cfg of corpus) {
    if (cfg.rows.length < 2) continue;   // single-row inputs are refused by the page before fragility is checked
    const st = cfg.rows.map(r => ({ e1: r.ai, n1: r.ai + r.bi, e0: r.ci, n0: r.ci + r.di }));
    for (const m of ['OR', 'RR', 'RD']) {
      const id = cfg.id + '|' + m, rf = fr.get(id), f = F.fragility(st, { measure: m, convention: LEGACY });
      for (const [q, a, b] of [['FI', f.FI, rf.FI], ['FQ', f.FQ, rf.FQ], ['beta', f.pooled.est, rf.beta],
        ['lo', f.pooled.lo, rf.lo], ['hi', f.pooled.hi, rf.hi]]) { checks++; if (!same(a, b)) bad.push(id + ' ' + q); }
    }
  }
  assert.equal(checks, 3780);          // 252 configurations x 3 measures x 5 quantities, as in the paper's Table 1
  assert.deepEqual(bad.slice(0, 10), []);
});

test('mh-peto convention keeps the pre-frag.ma behaviours (drop00, study-by-study order, k = 1 not refused)', () => {
  // dat.hahn2001 (3 double-zero trials): the stored oracle gives OR FI 10; frag.ma gives 16.
  const corpus = JSON.parse(read('mh-peto/validate/corpus/corpus.json'));
  const cfg = corpus.find(c => c.id === 'dat.hahn2001|binary|all');
  const st = cfg.rows.map(r => ({ e1: r.ai, n1: r.ai + r.bi, e0: r.ci, n0: r.ci + r.di }));
  assert.equal(F.fragility(st, { measure: 'OR', convention: LEGACY }).FI, 10);
  assert.equal(F.fragility(st, { measure: 'OR' }).FI, 16);
  const one = [{ e1: 2, n1: 50, e0: 15, n0: 50 }];
  assert.equal(F.fragility(one, { measure: 'OR' }).FI, null);
  assert.equal(F.fragility(one, { measure: 'OR', convention: LEGACY }).FI, 5);
  // all tables double-zero: nothing to pool under drop00 (no estimate), frag.ma pools OR = 1 with the 1/2 correction
  const dz = [{ e1: 0, n1: 10, e0: 0, n0: 10 }, { e1: 0, n1: 20, e0: 0, n0: 20 }];
  assert.equal(F.fragility(dz, { measure: 'OR', convention: LEGACY }).pooled.est, null);
  assert.equal(F.fragility(dz, { measure: 'OR' }).pooled.est, 0);
});
