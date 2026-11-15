// Lane gemtc: local-install's R recipe, run block by block in R 4.6.0 (gemtc 1.1-2, metafor,
// netmeta, mada, meta/metasens, robvis 0.3.1, IPDfromKM 0.1.10, renv 1.3.1).
// Defects found by execution:
//  1. The gemtc block passed the netmeta frame straight in: mtc.network(data.re = d).
//     d has treat1/treat2/TE/seTE/studlab; data.re must be one row per ARM with columns
//     study, treatment, diff, std.err (diff = arm minus baseline, NA for the baseline arm;
//     gemtc 1.1-2 man/mtc.network.Rd). R: "undefined columns selected".
//  2. mtc.run(..., n.chain = 3): mtc.run has no n.chain argument (it belongs to mtc.model).
//     R: "unused argument (n.chain = 3)".
//  3. The 3-level block used d (by then the DTA frame, no yi/vi): "Cannot find the
//     object/variable ('yi')". It now uses metafor's dat.konstantopoulos2011.
//  4. The robvis block read a CSV the reader does not have; the K-M block used `curve`
//     (base R's function) and `risk`, neither defined. Both now use the packages' example data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('local-install/index.html', ROOT), 'utf8');
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const block = start => {
  const i = html.indexOf(start);
  assert.ok(i > 0, 'block not found: ' + start);
  return unesc(html.slice(i, html.indexOf('</pre>', i)));
};

test('local-install gemtc: data.re is an arm-level frame with study/treatment/diff/std.err', () => {
  const g = block('<pre>library(gemtc)');
  assert.doesNotMatch(g, /mtc\.network\(data\.re = d\)/, 'd is the netmeta (treat1/treat2/TE/seTE) frame');
  const frame = g.match(/(\w+) <- data\.frame\(([\s\S]*?)\)\)\s*\n/);
  assert.ok(frame, 'a data.frame is built for data.re');
  const cols = [...('\n' + frame[2]).matchAll(/\n\s*([A-Za-z.]+)\s*=/g)].map(m => m[1]); // one column per line
  assert.deepEqual(cols, ['study', 'treatment', 'diff', 'std.err']);
  assert.match(g, new RegExp(`mtc\\.network\\(data\\.re = ${frame[1]}\\)`));
  // one row per arm: baseline (treat2) with diff NA, then treat1 carrying netmeta's TE/seTE
  assert.match(g, /study\s*= rep\(d\$studlab, each = 2\)/);
  assert.match(g, /treatment = c\(rbind\(d\$treat2, d\$treat1\)\)/);
  assert.match(g, /diff\s*= c\(rbind\(NA, d\$TE\)\)/);
  assert.match(g, /std\.err\s*= c\(rbind\(NA, d\$seTE\)\)/);
});

test('local-install gemtc: n.chain goes to mtc.model, not mtc.run; seeds are fixed', () => {
  const g = block('<pre>library(gemtc)');
  const run = g.match(/mtc\.run\(([^)]*)\)/)[1];
  assert.doesNotMatch(run, /n\.chain/, 'mtc.run(model, sampler, n.adapt, n.iter, thin, n.burnin)');
  assert.match(g, /mtc\.model\([\s\S]*?n\.chain = 3\)/);
  assert.match(g, /set\.seed\(/);
  assert.match(g, /\.RNG\.seed/);
});

test('local-install: the 3-level, robvis and K-M blocks define the data they use', () => {
  const ml = block('Multi-level (3-level) MA');
  assert.match(ml, /d3 <- dat\.konstantopoulos2011/);
  assert.match(ml, /rma\.mv\(yi, V = vi, random = ~ 1 \| district\/school, data = d3/);
  const rb = block('<pre>library(robvis)');
  assert.match(rb, /^rob <- data_rob2/m);
  const km = block('<pre>library(IPDfromKM)');
  assert.match(km, /^curve <- Radiationdata\$radio/m);
  assert.doesNotMatch(km, /risk\$/);
  assert.match(km, /head\(ipd\$IPD\)/);
});
