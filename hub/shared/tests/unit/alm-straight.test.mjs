// node:test — F6 Straight path (shared/alm-straight.js engine + shared/alm-straight-ui.js on a minimal fake DOM).
//   - every rule: PLANTED ctx (must fire) and CONTROL ctx (must not), incl. boundary values (k = 9 vs 10, I² = 0 with
//     k = 4 vs 5, CI touching vs excluding the null, p = 0.05 vs 0.049, |rho| 0.6 vs above);
//   - missing ctx never throws: every rule reports {fired:false, reason:'not applicable'};
//   - citation table: >= 1 Handbook entry per rule (frozen exemption list), every evidence DOI matches the DOI pattern
//     and is in VERIFIED_DOIS (copied from STRAIGHT_PATH_RULES_v1.md) — planted unknown DOI fails the gate;
//   - no-digit-literal lint on message templates (THRESHOLDS references excluded) — planted literal fails the gate;
//   - placements per app as in the rule list; UI panel/notice (Why? toggle, DOI links, dismiss) and the extension tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../../../../shared/alm-features.js');
const S = require('../../../../shared/alm-straight.js');
const UI = require('../../../../shared/alm-straight-ui.js');

// Copied from STRAIGHT_PATH_RULES_v1.md (each DOI checked twice there). A DOI not in this list fails.
const VERIFIED_DOIS = Object.freeze([
  '10.7326/M13-2886', '10.1136/bmj.290.6461.17', '10.1186/1471-2288-14-25',
  '10.1136/bmj.39343.408449.80',
  '10.1136/bmj.326.7387.475', '10.1136/bmjebm-2019-111257',
  '10.1136/bmj.326.7385.397', '10.1136/bmj.325.7370.925',
  '10.1186/1471-2288-11-27',
  '10.1503/cmaj.060410',
  '10.1136/bmj.b1147', '10.1093/ije/dys222',
  '10.1111/j.1467-985X.2008.00593.x',
]);
const DOI_RE = /^10\.\d{4,9}\/\S+$/;
// Rules allowed to ship without a Handbook entry (explicitly marked handbookExempt in the table).
const HANDBOOK_EXEMPT = Object.freeze(['SP-PIT-WITHINCOR']);
const PLACEMENTS = Object.freeze({
  'SP-REC-SMALLK': ['proportion-ma', 'correlation-ma'],
  'SP-PIT-I2ZERO': ['proportion-ma', 'correlation-ma'],
  'SP-PIT-NONSIG': ['correlation-ma', 'multivariate-ma'],
  'SP-PIT-CLUSTER': ['proportion-ma'],
  'SP-REC-DTA-SROC': ['dta-sroc'],
  'SP-PIT-FUNNELSMALLK': ['dta-sroc'],
  'SP-PIT-NMACONSIST': ['nma-inconsistency'],
  'SP-PIT-WITHINCOR': ['multivariate-ma'],
  'SP-UNC-SMALLK': ['dta-sroc', 'proportion-ma', 'nma-inconsistency', 'correlation-ma', 'multivariate-ma'],
  'SP-UNC-WIDEPI': ['proportion-ma', 'correlation-ma'],
});

let checks = 0;
const eq = (a, b, m) => { checks++; assert.deepEqual(a, b, m); };
const ok = (c, m) => { checks++; assert.ok(c, m); };
const rule = id => S.RULES.find(r => r.id === id);

const est = (o = {}) => ({ label: 'pooled', lo: 0.1, hi: 0.5, piLo: -0.1, piHi: 0.7, nullValue: 0, ...o });
const pair = (o = {}) => ({ analysisType: 'pairwise', k: 7, randomEffects: true, estimator: 'PM', hksj: false, i2: 30, estimates: [est()], provenance: [], ...o });

// For EVERY rule: planted ctx (must fire) and control ctx (must not fire).
const CASES = {
  'SP-REC-SMALLK': {
    planted: [pair({ k: 9, estimator: 'DL', hksj: true }), pair({ k: 9, estimator: 'PM', hksj: false }), pair({ k: 2, estimator: 'REML', hksj: false })],
    control: [pair({ k: 10, estimator: 'DL', hksj: false }), pair({ k: 9, estimator: 'PM', hksj: true }), pair({ k: 5, estimator: 'FE', randomEffects: false })],
  },
  'SP-PIT-I2ZERO': {
    planted: [pair({ k: 4, i2: 0 }), pair({ k: 2, i2: 0.04 })],
    control: [pair({ k: 5, i2: 0 }), pair({ k: 4, i2: 0.05 }), pair({ k: 4, i2: 12 })],
  },
  'SP-PIT-NONSIG': {
    planted: [pair({ estimates: [est({ lo: -0.1, hi: 0.3 })] }), pair({ estimates: [est({ lo: -0.4, hi: 0 })] }),
      { analysisType: 'multivariate', k: 5, estimates: [est({ label: 'pooled PD' }), est({ label: 'pooled AL', lo: -0.5, hi: 0.02 })] }],
    control: [pair({ estimates: [est({ lo: 0.001, hi: 0.3 })] }), pair({ estimates: [est({ lo: -0.4, hi: -0.0001 })] }),
      pair({ estimates: [est({ nullValue: null, lo: -1, hi: 1 })] })],
  },
  'SP-PIT-CLUSTER': {
    planted: [pair({ provenance: [{ label: 'Smith 2019', flags: [{ code: 'CLUSTER_NOT_ADJUSTED' }] }, { label: 'Lee 2020', flags: [] }] })],
    control: [pair({ provenance: [] }), pair({ provenance: [{ label: 'Smith 2019', flags: [{ code: 'CLUSTER_ANALYSIS_REPORTED' }] }] })],
  },
  'SP-REC-DTA-SROC': {
    planted: [{ k: 3, poolingModel: 'separate' }, { k: 7, poolingModel: 'moses' }, { k: 7, poolingModel: 'bivariate', thresholdVaries: true, thresholdRho: 0.71 },
      { k: 7, poolingModel: 'bivariate', thresholdRho: -0.61 }],
    control: [{ k: 7, poolingModel: 'bivariate', thresholdVaries: false, thresholdRho: 0.2 }, { k: 7, poolingModel: 'bivariate', thresholdRho: 0.6 },
      { k: 7, poolingModel: 'bivariate' }],
  },
  'SP-PIT-FUNNELSMALLK': {
    planted: [{ k: 9, smallStudyTest: { name: "Deeks' test", shown: true, p: 0.4 } }, { k: 4, smallStudyTest: { name: "Deeks' test", shown: true } }],
    control: [{ k: 10, smallStudyTest: { name: "Deeks' test", shown: true, p: 0.4 } }, { k: 7, smallStudyTest: { name: "Deeks' test", shown: false, p: null } }],
  },
  'SP-PIT-NMACONSIST': {
    planted: [{ inconsistencyTests: [{ label: 'design-by-treatment test', p: 0.05 }] }, { inconsistencyTests: [{ label: 'node-split A:B', p: 0.001 }, { label: 'node-split A:C', p: 0.6 }] }],
    control: [{ inconsistencyTests: [{ label: 'design-by-treatment test', p: 0.049 }, { label: 'node-split A:B', p: 0.001 }] }],
  },
  'SP-PIT-WITHINCOR': {
    planted: [{ withinCorrelation: 'assumed', assumedCorrelation: 0.5 }, { withinCorrelation: 'assumed' }],
    control: [{ withinCorrelation: 'reported' }],
  },
  'SP-UNC-SMALLK': {
    planted: [pair({ k: 4 }), { analysisType: 'network', minPerComparison: 4, k: 11 }, { analysisType: 'multivariate', k: 9 }],
    control: [pair({ k: 5 }), { analysisType: 'network', minPerComparison: 5, k: 11 }, { analysisType: 'multivariate', k: 10 }],
  },
  'SP-UNC-WIDEPI': {
    planted: [pair({ k: 3 }), pair({ k: 12, estimates: [est({ lo: -0.5, hi: -0.1, piLo: -0.9, piHi: 0 })] })],
    control: [pair({ k: 3, estimates: [est({ piLo: 0.05, piHi: 0.6 })] }), pair({ k: 3, estimates: [est({ lo: -0.1, hi: 0.5 })] }),
      pair({ k: 3, estimates: [est({ lo: 0, hi: 0.5, piLo: -0.2 })] })],
  },
};

test('rule table: exactly the 8 rules + 2 uncertainty statements of STRAIGHT_PATH_RULES_v1, placed per app', () => {
  eq(S.RULES.map(r => r.id).sort(), Object.keys(PLACEMENTS).sort());
  for (const r of S.RULES) {
    eq(r.apps, PLACEMENTS[r.id], r.id + ' placement');
    eq(r.version, 1, r.id + ' version');
    ok(['recommend', 'pitfall', 'uncertainty'].includes(r.part), r.id + ' part');
    eq(r.part, r.id.startsWith('SP-REC-') ? 'recommend' : r.id.startsWith('SP-PIT-') ? 'pitfall' : 'uncertainty', r.id + ' part matches id');
    ok(typeof r.trigger === 'function' && typeof r.message === 'function', r.id + ' functions');
  }
  const perApp = app => S.RULES.filter(r => r.apps.includes(app));
  const count = (app, part) => perApp(app).filter(r => (part === 'uncertainty') === (r.part === 'uncertainty')).length;
  // "P3 = 2 (+UNC), P9 = 3 (+2 UNC), P16 = 1 (+UNC), P17 = 3 (+2 UNC), P18 = 2 incl. #8 (+UNC)"
  eq([count('dta-sroc'), count('dta-sroc', 'uncertainty')], [2, 1]);
  eq([count('proportion-ma'), count('proportion-ma', 'uncertainty')], [3, 2]);
  eq([count('nma-inconsistency'), count('nma-inconsistency', 'uncertainty')], [1, 1]);
  eq([count('correlation-ma'), count('correlation-ma', 'uncertainty')], [3, 2]);
  eq([count('multivariate-ma'), count('multivariate-ma', 'uncertainty')], [2, 1]);
  for (const [name, t] of Object.entries(S.THRESHOLDS)) ok(typeof t.value === 'number' && typeof t.source === 'string' && t.source.length > 10, 'threshold ' + name + ' has value + source');
});

test('every rule has a planted case that fires and a control that does not', () => {
  eq(Object.keys(CASES).sort(), S.RULES.map(r => r.id).sort(), 'a case for every rule');
  for (const r of S.RULES) {
    for (const [i, c] of CASES[r.id].planted.entries()) {
      const out = S.check(r, c);
      ok(out.fired === true, `${r.id} planted #${i} must fire: ${JSON.stringify(out)}`);
      ok(typeof out.message === 'string' && out.message.length > 20 && !/undefined|NaN|null|\[object/.test(out.message), `${r.id} planted #${i} message: ${out.message}`);
    }
    for (const [i, c] of CASES[r.id].control.entries()) {
      const out = S.check(r, c);
      ok(out.fired === false, `${r.id} control #${i} must not fire: ${JSON.stringify(out)}`);
    }
  }
});

test('boundaries: k = 9 vs 10, I² = 0 with k = 4 vs 5, CI touching vs excluding the null, p = 0.05 vs 0.049', () => {
  const fires = (id, c) => S.check(rule(id), c).fired;
  eq([fires('SP-REC-SMALLK', pair({ k: 9, estimator: 'DL' })), fires('SP-REC-SMALLK', pair({ k: 10, estimator: 'DL' }))], [true, false]);
  eq([fires('SP-PIT-I2ZERO', pair({ k: 4, i2: 0 })), fires('SP-PIT-I2ZERO', pair({ k: 5, i2: 0 }))], [true, false]);
  eq([fires('SP-PIT-NONSIG', pair({ estimates: [est({ lo: 0, hi: 0.4 })] })), fires('SP-PIT-NONSIG', pair({ estimates: [est({ lo: 1e-9, hi: 0.4 })] }))], [true, false]);
  eq([fires('SP-PIT-FUNNELSMALLK', { k: 9, smallStudyTest: { shown: true } }), fires('SP-PIT-FUNNELSMALLK', { k: 10, smallStudyTest: { shown: true } })], [true, false]);
  eq([fires('SP-PIT-NMACONSIST', { inconsistencyTests: [{ label: 'x', p: 0.05 }] }), fires('SP-PIT-NMACONSIST', { inconsistencyTests: [{ label: 'x', p: 0.049 }] })], [true, false]);
  eq([fires('SP-UNC-SMALLK', pair({ k: 4 })), fires('SP-UNC-SMALLK', pair({ k: 5 }))], [true, false]);
  eq([fires('SP-UNC-SMALLK', { analysisType: 'multivariate', k: 9 }), fires('SP-UNC-SMALLK', { analysisType: 'multivariate', k: 10 })], [true, false]);
  eq([fires('SP-UNC-SMALLK', { analysisType: 'network', minPerComparison: 4 }), fires('SP-UNC-SMALLK', { analysisType: 'network', minPerComparison: 5 })], [true, false]);
  // PI touching the null counts as including it; CI touching the null means the CI does not exclude it.
  eq([fires('SP-UNC-WIDEPI', pair({ k: 3, estimates: [est({ piLo: 0 })] })), fires('SP-UNC-WIDEPI', pair({ k: 3, estimates: [est({ lo: 0 })] }))], [true, false]);
  eq(S.check(rule('SP-UNC-WIDEPI'), pair({ k: 2 })).reason, 'not applicable', 'PI needs k >= 3');
  eq([fires('SP-REC-DTA-SROC', { poolingModel: 'bivariate', thresholdRho: 0.6 }), fires('SP-REC-DTA-SROC', { poolingModel: 'bivariate', thresholdRho: 0.6001 })], [false, true]);
});

test('messages compose numbers from facts: the planted values appear in the text', () => {
  ok(S.check(rule('SP-REC-SMALLK'), pair({ k: 7, estimator: 'DL' })).message.includes('k = 7'), 'k in SMALLK');
  ok(S.check(rule('SP-REC-SMALLK'), pair({ k: 7, estimator: 'DL' })).message.includes('DerSimonian–Laird'), 'estimator named');
  ok(S.check(rule('SP-PIT-I2ZERO'), pair({ k: 3, i2: 0 })).message.startsWith('I² = 0.0% with only 3 studies'), 'I2ZERO facts');
  ok(S.check(rule('SP-PIT-NONSIG'), pair({ estimates: [est({ label: 'pooled r', lo: -0.125, hi: 0.3 })] })).message.includes('pooled r (-0.125 to 0.3'), 'NONSIG CI');
  ok(S.check(rule('SP-PIT-CLUSTER'), CASES['SP-PIT-CLUSTER'].planted[0]).message.includes('1 row comes') && S.check(rule('SP-PIT-CLUSTER'), CASES['SP-PIT-CLUSTER'].planted[0]).message.includes('Smith 2019'), 'cluster count + label');
  ok(S.check(rule('SP-PIT-WITHINCOR'), { withinCorrelation: 'assumed', assumedCorrelation: 0.35 }).message.includes('ρw = 0.35'), 'assumed value shown');
  ok(S.check(rule('SP-PIT-NMACONSIST'), CASES['SP-PIT-NMACONSIST'].planted[1]).message.startsWith('1 of 2 inconsistency tests'), 'n of N');
  ok(S.check(rule('SP-UNC-SMALLK'), { analysisType: 'network', minPerComparison: 1 }).message.includes('only 1 study'), 'network singular');
  ok(S.check(rule('SP-UNC-WIDEPI'), pair({ k: 3 })).message.includes('-0.1 to 0.7'), 'PI bounds');
  // Changing a fact changes the message (no number is baked into the template).
  const a = S.check(rule('SP-UNC-SMALLK'), pair({ k: 3 })).message, b = S.check(rule('SP-UNC-SMALLK'), pair({ k: 4 })).message;
  ok(a !== b && a.includes('With 3 studies') && b.includes('With 4 studies'), 'k flows from facts');
});

test('missing or broken ctx never throws: rules report not applicable', () => {
  const apps = ['dta-sroc', 'proportion-ma', 'nma-inconsistency', 'correlation-ma', 'multivariate-ma'];
  for (const app of apps) {
    for (const ctx of [undefined, null, {}, 42, 'x', { k: NaN }, { estimates: 'nope', provenance: 'nope', inconsistencyTests: {} }]) {
      let out;
      assert.doesNotThrow(() => { out = S.evaluate(app, ctx); }, app + ' ' + JSON.stringify(ctx));
      checks++;
      eq([out.recommend.length, out.pitfalls.length, out.uncertainty.length], [0, 0, 0], app + ' nothing fires on ' + JSON.stringify(ctx));
      ok(out.checked.length === S.RULES.filter(r => r.apps.includes(app)).length && out.checked.every(c => c.fired === false && c.reason === 'not applicable'), app + ' all not applicable');
    }
  }
  for (const r of S.RULES) eq(S.check(r, {}).reason, 'not applicable', r.id + ' on {}');
  // A trigger that throws is contained.
  const boom = { id: 'X', version: 1, apps: ['a'], part: 'pitfall', requires: [], trigger() { throw new Error('boom'); }, message() { return ''; }, handbook: [], evidence: [] };
  eq(S.check(boom, {}).reason, 'not applicable');
  // Proportion: no "no effect" value -> the prediction-interval statement is not applicable (not silently "not fired").
  eq(S.check(rule('SP-UNC-WIDEPI'), pair({ estimates: [est({ nullValue: null })] })).reason, 'not applicable');
});

test('evaluate: groups fired advice by part with id@version, handbook and evidence; unknown app -> nothing checked', () => {
  const out = S.evaluate('correlation-ma', pair({ k: 4, i2: 0, estimator: 'DL', estimates: [est({ lo: -0.2, hi: 0.4 })] }));
  eq(out.recommend.map(x => x.id), ['SP-REC-SMALLK@1']);
  eq(out.pitfalls.map(x => x.id), ['SP-PIT-I2ZERO@1', 'SP-PIT-NONSIG@1']);
  eq(out.uncertainty.map(x => x.id), ['SP-UNC-SMALLK@1']);
  eq(out.checked.map(c => c.id), ['SP-REC-SMALLK@1', 'SP-PIT-I2ZERO@1', 'SP-PIT-NONSIG@1', 'SP-UNC-SMALLK@1', 'SP-UNC-WIDEPI@1']);
  ok(out.recommend[0].handbook.length === 2 && out.recommend[0].evidence[0].doi === '10.7326/M13-2886', 'handbook + evidence carried');
  eq(S.fired(out), ['SP-REC-SMALLK@1', 'SP-PIT-I2ZERO@1', 'SP-PIT-NONSIG@1', 'SP-UNC-SMALLK@1']);
  eq(S.evaluate('no-such-app', pair()).checked, []);
  // Rules placed in other apps never fire here (CLUSTER is app 9 only).
  const c = S.evaluate('correlation-ma', pair({ provenance: CASES['SP-PIT-CLUSTER'].planted[0].provenance }));
  ok(!S.fired(c).includes('SP-PIT-CLUSTER@1'), 'placement respected');
});

// ---- citation table -------------------------------------------------------------------------------
function citationProblems(r, verified = VERIFIED_DOIS, exempt = HANDBOOK_EXEMPT) {
  const p = [];
  if (!Array.isArray(r.handbook) || (!r.handbook.length && !(exempt.includes(r.id) && typeof r.handbookExempt === 'string'))) p.push(r.id + ': no handbook entry');
  for (const h of r.handbook || []) if (!h.label || !/^https:\/\//.test(h.url)) p.push(r.id + ': bad handbook entry ' + JSON.stringify(h));
  for (const e of r.evidence || []) {
    if (!['named', 'survey', 'methods'].includes(e.kind)) p.push(r.id + ': bad evidence kind ' + e.kind);
    if (!DOI_RE.test(e.doi)) p.push(r.id + ': DOI pattern ' + e.doi);
    if (!verified.includes(e.doi)) p.push(r.id + ': DOI not in VERIFIED_DOIS ' + e.doi);
    if (!e.citation) p.push(r.id + ': citation missing');
  }
  if (r.part !== 'uncertainty' && !(r.evidence || []).length) p.push(r.id + ': a rule needs documented evidence');
  return p;
}

test('citation table: handbook entries, DOI pattern, every DOI in VERIFIED_DOIS; planted unknown DOI fails', () => {
  for (const r of S.RULES) eq(citationProblems(r), [], r.id);
  eq(S.RULES.filter(r => !r.handbook.length).map(r => r.id), HANDBOOK_EXEMPT.slice(), 'only the marked exemption lacks a Handbook entry');
  const used = new Set(S.RULES.flatMap(r => r.evidence.map(e => e.doi)));
  eq([...used].sort(), VERIFIED_DOIS.slice().sort(), 'every verified DOI is used and nothing else');
  for (const d of VERIFIED_DOIS) ok(DOI_RE.test(d), 'frozen DOI matches pattern ' + d);
  // Rule 8 ships with the methods citation and the visible "no published example" note.
  const w = rule('SP-PIT-WITHINCOR');
  eq(w.evidence.map(e => [e.kind, e.note]), [['methods', 'No published example of this error in a named meta-analysis was found.']]);
  // Handbook sections as given in the rule list.
  const secs = id => rule(id).handbook.map(h => h.label);
  eq(secs('SP-REC-SMALLK'), ['Cochrane Handbook v6.5 §10.10.4.4', 'Cochrane Handbook v6.5 §10.10.4.5']);
  eq(secs('SP-PIT-NONSIG'), ['Cochrane Handbook v6.5 §15.3.2', 'Cochrane Handbook v6.5 §15.6.4']);
  eq(secs('SP-PIT-CLUSTER'), ['Cochrane Handbook v6.5 §23.1.1', 'Cochrane Handbook v6.5 §23.1.4']);
  eq(secs('SP-PIT-FUNNELSMALLK'), ['Cochrane Handbook v6.5 §13.3.4.4']);
  eq(secs('SP-PIT-NMACONSIST'), ['Cochrane Handbook v6.5 §11.4.4.2']);
  eq(secs('SP-UNC-WIDEPI'), ['Cochrane Handbook v6.5 §10.10.4.3']);
  ok(rule('SP-REC-DTA-SROC').handbook[0].url === 'https://doi.org/10.1002/9781119756194.ch10', 'DTA Handbook ch.10');
  // PLANTED defects: the gate must fail.
  const bad = { ...rule('SP-PIT-I2ZERO'), evidence: [{ kind: 'survey', citation: 'Invented 2020', doi: '10.1234/not-verified' }] };
  ok(citationProblems(bad).some(m => m.includes('not in VERIFIED_DOIS')), 'unknown DOI fails');
  const badPattern = { ...rule('SP-PIT-I2ZERO'), evidence: [{ kind: 'survey', citation: 'x', doi: 'doi:10.1136/bmj.39343.408449.80' }] };
  ok(citationProblems(badPattern).some(m => m.includes('DOI pattern')), 'DOI with prefix fails the pattern');
  ok(citationProblems({ ...rule('SP-PIT-I2ZERO'), handbook: [] }).some(m => m.includes('no handbook')), 'missing handbook fails');
});

// ---- no-digit-literal lint --------------------------------------------------------------------------
function digitLiterals(fn) { return fn.toString().replace(/\bT\('[A-Z_]+'\)/g, '').match(/\d/g) || []; }

test('lint: message templates contain no digit literals (thresholds come from THRESHOLDS); planted literal fails', () => {
  for (const r of S.RULES) eq(digitLiterals(r.message), [], r.id + ' message template');
  for (const name of Object.keys(S.THRESHOLDS)) ok(!/\d/.test(name), 'threshold name without digits: ' + name);
  ok(digitLiterals(function (f) { return 'k = ' + f.k + ' is below 10'; }).length > 0, 'planted digit literal is caught');
  ok(digitLiterals(function (f) { return 'k = ' + f.k + ' is below ' + T('SMALL_K'); }).length === 0, 'THRESHOLDS reference allowed');
});
function T() { return 0; } // only referenced by the lint fixture above

// ---- UI on a minimal fake DOM -------------------------------------------------------------------------
class Node {
  constructor(tag, doc, text) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.attrs = {}; this.parentNode = null; this.hidden = false; this.listeners = {}; this._text = text || ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(n) { if (n.parentNode) n.remove(); n.parentNode = this; this.children.push(n); return n; }
  insertBefore(n, ref) { if (n.parentNode) n.remove(); n.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, n); return n; }
  remove() { if (this.parentNode) { const c = this.parentNode.children; c.splice(c.indexOf(this), 1); this.parentNode = null; } }
  replaceChildren() { this.children.slice().forEach(c => c.remove()); }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  click() { (this.listeners.click || []).forEach(fn => fn({ preventDefault() {} })); }
  set textContent(v) { this.replaceChildren(); this._text = String(v); }
  get textContent() { return this.tagName === '#text' ? this._text : this._text + this.children.map(c => c.textContent).join(''); }
}
function fakeDoc() {
  const doc = { createElement: t => new Node(t, doc), createTextNode: t => new Node('#text', doc, t) };
  return doc;
}
const all = n => [n, ...n.children.flatMap(all)];

test('UI panel: parts, Why? toggles Handbook + DOI links (rel=noopener), rules checked; textContent only', () => {
  const doc = fakeDoc(), root = new Node('div', doc);
  let ctx = pair({ k: 4, i2: 0, estimator: 'DL', estimates: [est({ lo: -0.2, hi: 0.4 })] });
  const h = UI.mount(root, { app: 'correlation-ma', ctx: () => ctx });
  const nodes = all(root);
  eq(nodes.filter(n => n.tagName === 'h3').map(n => n.textContent), ['Recommended analysis', 'Pitfalls', 'Uncertainty']);
  const items = nodes.filter(n => n.attrs['data-rule'] && n.tagName === 'li' && n.attrs.class === 'alm-sp-item');
  eq(items.map(n => n.attrs['data-rule']), ['SP-REC-SMALLK@1', 'SP-PIT-I2ZERO@1', 'SP-PIT-NONSIG@1', 'SP-UNC-SMALLK@1']);
  const btn = all(items[0]).find(n => n.tagName === 'button'), box = all(items[0]).find(n => n.attrs.class === 'alm-sp-detail');
  eq([btn.textContent, btn.attrs['aria-expanded'], box.hidden, btn.attrs['aria-controls'] === box.id], ['Why?', 'false', true, true]);
  btn.click();
  eq([btn.attrs['aria-expanded'], box.hidden], ['true', false]);
  const links = all(box).filter(n => n.tagName === 'a');
  ok(links.some(a => a.attrs.href === 'https://doi.org/10.7326/M13-2886' && a.attrs.rel === 'noopener'), 'DOI link with rel=noopener');
  ok(links.some(a => a.attrs.href.startsWith('https://training.cochrane.org/handbook/') && a.textContent === 'Cochrane Handbook v6.5 §10.10.4.4'), 'Handbook link');
  ok(nodes.some(n => n.tagName === 'summary' && n.textContent === 'Rules checked (5)'), 'rules checked');
  ok(UI.last['correlation-ma'].checked.length === 5, 'last result exposed');
  ctx = pair({ k: 30, i2: 50, estimates: [est({ piLo: 0.02 })] });
  h.refresh();
  eq(all(root).filter(n => n.attrs.class === 'alm-sp-none').length, 3, 'nothing flagged after the change');
});

test('UI notice: hidden when nothing fires, advisory list when rules fire, dismissible until the advice changes', () => {
  const doc = fakeDoc(), parent = new Node('section', doc), anchor = new Node('div', doc);
  parent.appendChild(anchor);
  let ctx = pair({ k: 30, i2: 50, estimator: 'REML', estimates: [est({ piLo: 0.02 })] });
  const n = UI.notice({ app: 'correlation-ma', ctx: () => ctx, anchor });
  ok(parent.children[0] === n.element, 'inserted before the anchor (above the results)');
  n.refresh();
  eq([n.element.hidden, n.element.attrs.role], [true, 'note'], 'nothing fires -> hidden');
  ctx = pair({ k: 6, estimator: 'DL', estimates: [est({ piLo: 0.02 })] });   // PLANTED: DL with k < 10
  n.refresh();
  eq(n.element.hidden, false, 'planted rule shows the notice');
  eq(n.element.attrs['data-fired'], 'SP-REC-SMALLK@1');
  ok(/Recommendation: With k = 6 studies/.test(n.element.textContent), 'plain words, labelled by text');
  const dismiss = all(n.element).find(x => x.tagName === 'button' && x.textContent === 'Dismiss');
  dismiss.click();
  eq(n.element.hidden, true, 'dismissed');
  n.refresh();
  eq(n.element.hidden, true, 'same advice stays dismissed');
  ctx = pair({ k: 4, estimator: 'DL', estimates: [est({ piLo: 0.02 })] });
  n.refresh();
  eq(n.element.hidden, false, 'new advice shows again');
  eq(UI.notice({ app: 'x', ctx: () => ({}), anchor: new Node('div', doc) }), null, 'detached anchor -> no notice, no throw');
});

test('feature panel: "Straight path" is an extension tab after Report text; core tab/block lists unchanged', () => {
  eq(F.tabs, ['entry', 'text', 'verify', 'share'], 'core tabs unchanged');
  eq(F.blocks, ['paper', 'title', 'entry', 'text', 'verify', 'share'], 'core blocks unchanged');
  ok(F.moduleFor('straight') === UI.tabModule, 'module registered');
  const block = { ctx: () => ({}) };
  F.register('straight-app', { straight: block });
  ok(F.get('straight-app').straight === block, 'straight block kept by register()');
  assert.throws(() => F.registerModule('bogus', { render() {} }), /unknown tab/); checks++;
  assert.throws(() => F.registerModule('Bad Key', { render() {}, extension: { label: 'x' } }), /invalid extension tab/); checks++;
});

test('checks counted', () => { ok(checks > 150, 'checks: ' + checks); console.log('STRAIGHT unit checks ' + checks); });
