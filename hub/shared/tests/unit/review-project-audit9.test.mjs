// Lane audit9: review-project "Pooled result - live recompute" reproduced in R (metafor 5.2.1).
//  On dat.bcg (log RR, k=13) and a homogeneous k=6 set, every live number (estimate, CI, tau2,
//  I2, Q, t_{k-1} PI for FE/DL/PM/REML, with and without Knapp-Hartung), the HKSJ Q-floor card,
//  Egger (intercept -2.11, SE 1.51, p 0.189 = regtest(model="lm")) and the precision-effect
//  correlation match R. Defects:
//  1. Multiverse card: the per-spec "95% CI" column is theta +/- 1.96*SE for every spec, so
//     the "+HK" rows show a Wald interval, not their Hartung-Knapp t_{k-1} interval.
//     BCG DL+HK showed 0.344 to 0.698; its HK interval (metafor test="adhoc") is 0.330 to 0.726.
//  2. The live label says "+ Knapp-Hartung" but the page always floors the HK variance factor
//     at 1 (knhaFloor:true): its CI equals metafor test="adhoc", not test="knha"
//     (homogeneous k=6 REML: adhoc -0.314 to -0.0851 shown; knha would be -0.240 to -0.159).
//  3. The section heading is passed through esc(), so it shows a literal "&mdash;".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../../../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');
const html = read('review-project/index.html');

// Pull named function declarations out of the page's inline script.
function grab(name) {
  const i = html.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' not found');
  let depth = 0, j = html.indexOf('{', i);
  for (let p = j; p < html.length; p++) {
    if (html[p] === '{') depth++;
    else if (html[p] === '}' && --depth === 0) return html.slice(i, p + 1);
  }
  throw new Error('unbalanced ' + name);
}

function ctx() {
  const c = { console, Math, JSON, isFinite, String, Number, Array, Object };
  c.window = c; c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(read('shared/ma-core.js'), c);
  vm.runInContext(read('shared/experimental-ma.js'), c);
  vm.runInContext(['esc', 'fnum', 'methodLabel', 'multiverseCard'].map(grab).join('\n'), c);
  return c;
}

// dat.bcg, escalc("RR"): yi = log RR, se = sqrt(vi) (written by R, scratch R/gen.R)
const BCG = [
  [-0.889311333920205, 0.570600354892951],
  [-1.58538865720143, 0.441113501718258],
  [-1.34807314829969, 0.644490469571091],
  [-1.44155119002131, 0.141456819921302],
  [-0.217547322211296, 0.226296646395016],
  [-0.786115585818864, 0.0831000508778951],
  [-1.62089822359839, 0.472247019654243],
  [0.0119523335238405, 0.0629410779842364],
  [-0.469417648738149, 0.237558856840255],
  [-1.37134480347278, 0.270231000466321],
  [-0.339358828338391, 0.111410116109623],
  [0.445913400571379, 0.729729981020482],
  [-0.0173139482168798, 0.267216503390016],
].map(([est, se], i) => ({ label: 'S' + i, est, se }));

test('review-project multiverse: a +HK spec shows its Hartung-Knapp interval (R test="adhoc")', () => {
  const c = ctx();
  const card = c.multiverseCard(BCG, 'ratio');
  const row = lab => (card.match(new RegExp('<tr><td>' + lab.replace('+', '\\+') + '</td><td>([^<]+)</td><td>([^<]+)</td>')) || []).slice(1);
  assert.deepEqual(row('DL'), ['0.490', '0.345 to 0.695']);        // Wald spec (control)
  assert.deepEqual(row('DL+HK'), ['0.490', '0.330 to 0.726']);     // metafor DL adhoc
  assert.deepEqual(row('REML+HK'), ['0.489', '0.330 to 0.726']);   // metafor REML adhoc
});

test('review-project: the Knapp-Hartung label says the variance factor is floored', () => {
  const c = ctx();
  assert.equal(c.methodLabel('FE', false), 'fixed-effect');
  assert.match(c.methodLabel('REML', true), /Knapp–Hartung/);
  assert.match(c.methodLabel('REML', true), /floor/i);
});

test('review-project: no wrapPrev title carries an HTML entity that esc() would double-escape', () => {
  const titles = [...html.matchAll(/wrapPrev\("([^"]*)"/g)].map(m => m[1]);
  assert.ok(titles.length > 3);
  for (const t of titles) assert.doesNotMatch(t, /&[a-z]+;|&#\d+;/, t);
});
