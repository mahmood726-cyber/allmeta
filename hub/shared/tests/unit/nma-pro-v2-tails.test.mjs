import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const PAGE = new URL('../../../../nma-pro-v2/nma-pro-v8.0.html', import.meta.url);
// Evaluate only the shipped `const Stats = {...}` object literal of nma-pro-v8.0.html.
function stats() {
  const html = readFileSync(PAGE, 'utf8');
  const s = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(x => x.includes('const Stats='));
  const start = s.indexOf('const Stats=');
  let i = s.indexOf('{', start), d = 0;
  for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}') { d--; if (!d) break; } }
  const c = { Math };
  vm.createContext(c);
  vm.runInContext('const MainRNG={random:Math.random};' + s.slice(start, i + 1) + ';globalThis.Stats=Stats;', c);
  return c.Stats;
}
// R 4.6.0 reference grid (shared/tests/fixtures/upper-tail-grid.csv): dist;x;upper tail;params
const grid = readFileSync(new URL('../../../../shared/tests/fixtures/upper-tail-grid.csv', import.meta.url), 'utf8')
  .trim().split(/\r?\n/).map(l => { const [d, x, p, par] = l.split(';'); return { d, x: +x, p: +p, df: par ? +par.split(',')[0] : null }; });
const rel = (a, b) => Math.abs(a - b) / b;

test('nma-pro-v2: Stats.pchisq is a correct CDF where x/2 >= df/2 + 1 (continued-fraction branch)', () => {
  const S = stats();
  for (const g of grid.filter(g => g.d === 'chisq' && g.p >= 1e-4 && g.df <= 100)) {
    const up = 1 - S.pchisq(g.x, g.df);
    assert.ok(Math.abs(up - g.p) < 1e-9, `1 - pchisq(${g.x}, ${g.df}) = ${up}, R upper tail ${g.p}`);
  }
});

test('nma-pro-v2: upper-tail helpers match R lower.tail = FALSE down to 1e-300 (t only for |t| <= 1e150)', () => {
  const S = stats();
  for (const g of grid) {
    let v;
    if (g.d === 'chisq') v = S.pchisqU(g.x, g.df);
    else if (g.d === 'normal') v = S.pnormU(g.x);
    else if (g.d === 't') { if (g.x > 1e150) continue; v = S.ptU(g.x, g.df); } // t*t overflows beyond ~1e154 (documented limit)
    else continue;
    assert.ok(v > 0 && rel(v, g.p) < 1e-9, `${g.d}(${g.df}) at ${g.x}: ${v} vs R ${g.p}`);
  }
});

test('nma-pro-v2: no p-value in the page is formed as 1 - Stats.<cdf>(...)', () => {
  const html = readFileSync(PAGE, 'utf8');
  const hits = html.match(/(?<![\w.])1\s*-\s*Stats\.(pchisq|pnorm|pt)\s*\(/g) || [];
  assert.equal(hits.length, 0, `${hits.length} sites still compute an upper tail as 1 - CDF`);
});

test('nma-pro-v2: the inlined Web Worker Stats provides the pnormU its NMA code calls', () => {
  const html = readFileSync(PAGE, 'utf8');
  const a = html.indexOf('const WORKER_CODE=`'), b = html.indexOf('`;', a);
  const code = html.slice(a + 'const WORKER_CODE=`'.length, b);
  const line = code.split(/\r?\n/).find(l => l.startsWith('const Stats={'));
  const c = { Math }; vm.createContext(c);
  vm.runInContext(line + ';globalThis.Stats=Stats;', c);
  if (/Stats\.pnormU\(/.test(code)) assert.equal(typeof c.Stats.pnormU, 'function', 'worker calls Stats.pnormU but does not define it');
  for (const g of grid.filter(g => g.d === 'normal')) assert.ok(rel(c.Stats.pnormU(g.x), g.p) < 1e-9, `worker pnormU(${g.x}) = ${c.Stats.pnormU(g.x)} vs ${g.p}`);
  assert.ok(Math.abs(c.Stats.pnormU(-1.9599639845400536) - 0.975) < 1e-12);
  assert.equal(c.Stats.pnormU(0), 0.5);
});

test('nma-pro-v2: pchisqU stays exact at large df (the old CDF switched to Wilson-Hilferty above df = 100)', () => {
  const S = stats();
  // R 4.6.0 pchisq(x, df, lower.tail = FALSE), %.17g
  for (const [x, df, ref] of [[1e5, 1e5, 0.49940529189520672], [1000, 1000, 0.49405285382923969], [1200, 1000, 1.2255942330622908e-05], [1.1e5, 1e5, 2.5841772471796476e-104]]) {
    assert.ok(rel(S.pchisqU(x, df), ref) < 1e-9, `pchisqU(${x}, ${df}) = ${S.pchisqU(x, df)}, R ${ref}`);
  }
  assert.equal(S.pchisqU(Infinity, 3), 0);
  assert.ok(Number.isNaN(S.pchisqU(1, 0)) && Number.isNaN(S.pchisqU(1, -1)));
  assert.equal(S.pnormU(1e200), 0);
  assert.ok(Math.abs(S.ptU(1, Infinity) - 0.15865525393145705) < 1e-12);
});
