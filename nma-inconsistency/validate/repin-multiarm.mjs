// Re-derive the browser replay contract (corpus/reference.json, MANIFEST.json,
// adapter.js CONTRACT) after multi-arm support, WITHOUT a browser:
//   node nma-inconsistency/validate/repin-multiarm.mjs [--write]
// (from the repository root; needs git for the pre-change page text.)
//
// What changes, and where each new expectation comes from:
//  * the 15 configurations pinned with the old refusal "Multi-arm studies are
//    unsupported: ..." become accepted results:
//      - numeric: netmeta values from validate/multiarm-oracle.json (FE model
//        for `estimates`, the case's model for everything else); kDirect, k
//        and the study/multi-arm counts (multiArm) from the node engine and
//        the parsed input;
//      - display (table, global result, plot): the node engine's render
//        strings, converted to the adapter's canonical tree;
//      - reason removed.
//  * pageText: the header paragraph, input hint and footer subtrees, parsed
//    from the current index.html.
//  * check count: recomputed with the adapter's own counting rule.
// Guards (the script refuses to write unless all hold):
//  * the HTML-to-tree converter reproduces the stored browser-derived display
//    trees for every non-bus configuration whose engine output is unchanged,
//    and the stored page-text subtrees from the pre-change index.html;
//  * the counting rule reproduces the stored check count on the old reference;
//  * every R numeric reference of the superseded cases agrees with the page
//    (1e-9 relative, PM 1e-6; p 1e-9 absolute -- the adapter's tolerances);
//  * nothing else in reference.json changes.
// The adapter's browser run itself is NOT executed here.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const WRITE = process.argv.includes('--write');
const PRE_CHANGE = '72fe82d3';   // main before multi-arm support
const MULTIARM_REFUSAL = 'Multi-arm studies are unsupported: correlated contrasts require study covariance.';
const dir = new URL('./', import.meta.url);
const read = p => readFileSync(new URL(p, dir), 'utf8');
const refRaw = read('corpus/reference.json'), ref = JSON.parse(refRaw);
if (JSON.stringify(ref) + '\n' !== refRaw) throw Error('reference.json does not round-trip');
const corpus = JSON.parse(read('corpus/corpus.json'));
const oracle = JSON.parse(read('multiarm-oracle.json'));
const manRaw = read('MANIFEST.json'), man = JSON.parse(manRaw);
const adapterSrc = read('adapter.js');
if (!adapterSrc.includes('const CONTRACT = ' + JSON.stringify(man) + '; // generated')) throw Error('MANIFEST.json and adapter CONTRACT disagree');

// ---- node engine with recorded attributes ---------------------------------
function engineFrom(html) {
  const els = new Map();
  for (const id of ['src', 'f-model', 'btn-run', 'ns-body', 'ns-plot', 'dbt']) {
    let inner = ''; const attrs = {};
    els.set(id, { value: id === 'f-model' ? 'FE' : '', attrs,
      get innerHTML() { return inner; }, set innerHTML(v) { inner = String(v); },
      get textContent() { return inner; }, set textContent(v) { inner = String(v); },
      setAttribute(k, v) { attrs[k] = String(v); }, addEventListener() {} });
  }
  const c = { document: { getElementById: id => els.get(id) } }; c.window = c;
  vm.createContext(c);
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function fitNMA('));
  vm.runInContext(script, c);
  return { c, els };
}
const indexNow = readFileSync(new URL('../index.html', dir), 'utf8');
const indexOld = execFileSync('git', ['show', `${PRE_CHANGE}:nma-inconsistency/index.html`], { encoding: 'utf8', maxBuffer: 64 << 20 });
const now = engineFrom(indexNow), old = engineFrom(indexOld);

// ---- HTML fragment -> adapter canonical tree --------------------------------
const normal = s => s.replace(/\s+/g, ' ').trim();
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  : (ENT[e] ?? (() => { throw Error('Unknown entity ' + m); })()));
const VOID = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'wbr']);
function parseFragment(html) {
  const root = { tag: '#root', attrs: [], kids: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  let m, pos = 0;
  while ((m = re.exec(html))) {
    if (m.index !== pos) throw Error('Unparsed HTML at ' + pos + ': ' + html.slice(pos, pos + 40));
    pos = re.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    const top = stack[stack.length - 1];
    if (m[1]) { if (top.tag !== m[1].toLowerCase()) throw Error('Mismatched </' + m[1] + '>'); stack.pop(); }
    else if (m[2]) {
      const attrs = [...m[3].matchAll(/([^\s=>\/]+)(?:\s*=\s*"([^"]*)")?/g)].map(a => [a[1].toLowerCase(), decode(a[2] ?? '')]);
      const el = { tag: m[2].toLowerCase(), attrs, kids: [] };
      top.kids.push(el);
      if (!m[4] && !VOID.has(el.tag)) stack.push(el);
    } else top.kids.push(decode(m[5]));
  }
  if (pos !== html.length || stack.length !== 1) throw Error('Unbalanced HTML fragment');
  return root.kids;
}
function canon(node) {           // adapter tree(): attributes sorted, data-alm-* dropped
  if (typeof node === 'string') return normal(node) || null;
  return [node.tag, node.attrs.filter(a => !a[0].startsWith('data-alm-')).sort((a, b) => a[0].localeCompare(b[0])),
    node.kids.map(canon).filter(x => x !== null)];
}
function textTree(node) {        // adapter pageText(): aria-label/title only
  if (typeof node === 'string') return normal(node) || null;
  const get = k => { const a = node.attrs.find(x => x[0] === k); return a ? a[1] : null; };
  return [node.tag, [get('aria-label'), get('title')], node.kids.map(textTree).filter(x => x !== null)];
}
function displayOf(eng, wrappers) {
  return ['ns-body', 'dbt', 'ns-plot'].map((id, j) => {
    const w = wrappers[j];
    const attrs = w[1].map(a => a[0] === 'viewbox' || a[0] === 'viewBox' ? [a[0], eng.els.get(id).attrs.viewBox ?? a[1]] : a);
    return [w[0], attrs, parseFragment(eng.els.get(id).innerHTML).map(canon).filter(x => x !== null)];
  });
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function run(eng, item) {
  eng.els.get('f-model').value = item.model;
  eng.c.__almIncoLoad('A,B,.2,.1\nB,C,.3,.2\nA,C,.6,.15');   // adapter execute(): seed, then load
  eng.c.__almIncoLoad(item.text);
  return JSON.parse(JSON.stringify(eng.c._almLastInco()));
}

// ---- guard 1: converter reproduces stored browser display trees -------------
let displayChecked = 0;
const superseded = [];
corpus.forEach((item, i) => {
  const r = ref.cases[i];
  if (item.bus) return;
  if (r.reason === MULTIARM_REFUSAL) { superseded.push(i); return; }
  const a = run(now, item), b = run(old, item);
  if (!eq(a, b)) throw Error('engine output changed for ' + item.key);
  const d = displayOf(now, r.display);
  if (!eq(d, r.display)) throw Error('converter does not reproduce stored display for ' + item.key + '\n' + JSON.stringify(d).slice(0, 400) + '\n' + JSON.stringify(r.display).slice(0, 400));
  displayChecked++;
});
if (superseded.length !== 15) throw Error('expected 15 superseded configurations, found ' + superseded.length);

// ---- guard 2: page-text subtrees -------------------------------------------
function staticParts(html) {
  const body = html.slice(html.indexOf('<body'));
  const grab = re => { const m = body.match(re); if (!m) throw Error('fragment not found: ' + re); return m[0]; };
  return {
    header: grab(/<header\b[\s\S]*?<\/header>/),
    hint: grab(/<span class="hint" id="src-hint">[\s\S]*?<\/span>/),
    footer: grab(/<footer\b[\s\S]*?<\/footer>/),
  };
}
const tt = h => textTree(parseFragment(h)[0]);
const P = ref.pageText;
const headerAt = P.findIndex(n => n[0] === 'header'), footerAt = P.findIndex(n => n[0] === 'footer'), mainAt = P.findIndex(n => n[0] === 'main');
const hintPath = (() => {   // main > section[0] > label[0] > span[1]
  const sec = P[mainAt][2].findIndex(n => n[0] === 'section'); const lab = P[mainAt][2][sec][2].findIndex(n => n[0] === 'label');
  return [sec, lab, 1];
})();
const getHint = p => p[mainAt][2][hintPath[0]][2][hintPath[1]][2][hintPath[2]];
const oldParts = staticParts(indexOld), newParts = staticParts(indexNow);
if (!eq(tt(oldParts.header), P[headerAt])) throw Error('header converter mismatch');
if (!eq(tt(oldParts.footer), P[footerAt])) throw Error('footer converter mismatch\n' + JSON.stringify(tt(oldParts.footer)).slice(0, 300));
if (!eq(tt(oldParts.hint), getHint(P))) throw Error('hint converter mismatch');
const newPage = JSON.parse(JSON.stringify(P));
newPage[headerAt] = tt(newParts.header);
newPage[footerAt] = tt(newParts.footer);
newPage[mainAt][2][hintPath[0]][2][hintPath[1]][2][hintPath[2]] = tt(newParts.hint);

// ---- guard 3: the adapter's counting rule -----------------------------------
function leaves(x, prefix = '', out = []) {
  if (x === null || typeof x !== 'object') out.push({ key: prefix, value: x });
  else for (const [k, v] of Object.entries(x)) leaves(v, prefix ? prefix + '.' + k : k, out);
  return out;
}
function referenceState(r) {
  if (r.status === 'refused') return { status: r.status, reason: r.reason };
  const out = {};
  for (const k of ['model', 'trts', 'Q', 'df', 'tau2', 'Qrandom', 'estimates', 'estimatesRandom', 'dbt']) out[k] = r[k];
  out.nodeSplit = r.nodeSplit.map(({ kDirect, ...s }) => s).sort((a, b) => a.comparison.localeCompare(b.comparison));
  return out;
}
function countChecks(cases) {
  let n = 0;
  cases.forEach((r, i) => {
    if (r.numeric) { const L = leaves(referenceState(r.numeric)); n += L.length + L.filter(x => /(^|\.)p$/.test(x.key)).length + 1; }
    n += 1 + (corpus[i].inputReference ? corpus[i].inputReference.length * 4 : 0) + 3 + 3 + (r.reason ? 1 : 0);
  });
  return n;
}
if (countChecks(ref.cases) !== man.checks) throw Error(`counting rule gives ${countChecks(ref.cases)}, contract has ${man.checks}`);

// ---- new expectations for the superseded configurations --------------------
function multiArmOf(rows) {
  const t = new Map();
  for (const r of rows) { if (!t.has(r.study)) t.set(r.study, new Set()); t.get(r.study).add(r.A).add(r.B); }
  return { studies: t.size, multiArm: [...t.values()].filter(x => x.size > 2).length };
}
const next = JSON.parse(JSON.stringify(ref));
next.pageText = newPage;
let numericChecks = 0, maxRel = 0;
for (const i of superseded) {
  const item = corpus[i], r = next.cases[i];
  const ds = oracle.datasets.find(d => d.name === item.key.replace(/::(FE|DL|PM)$/, ''));
  const o = ds.models[item.model], oFE = ds.models.FE;
  if (o.status !== 'ok') throw Error('oracle refused ' + item.key);
  const state = run(now, item);
  if (state.status === 'refused') throw Error('page refuses ' + item.key + ': ' + state.reason);
  const kDirect = new Map(now.c.nodeSplit(now.c.parse(item.text), undefined, state.tau2).map(s => [s.comparison, s.kDirect]));
  const numeric = {
    key: item.key, status: 'ok', trts: o.trts, Q: o.Q, df: o.df, tau2: o.tau2, Qrandom: o.Qrandom,
    estimates: oFE.estimates, estimatesRandom: o.estimates,
    nodeSplit: o.nodeSplit.map(s => ({ comparison: s.comparison, direct: { mean: s.direct, se: s.directSe }, indirect: { mean: s.indirect, se: s.indirectSe },
      diff: s.diff, seDiff: s.seDiff, z: s.z, p: s.p, kDirect: kDirect.get(s.comparison) })),
    dbt: { Q: o.dbt.Q, df: o.dbt.df, p: o.dbt.p ?? null },
    split_exclusions: [], k: now.c.parse(item.text).length, model: item.model, warnings: [], seconds: 0,
    // input description carried for the plus panel's sentence checks (normalizeFit)
    multiArm: multiArmOf(now.c.parse(item.text)),
    source: `validate/multiarm-oracle.json (R ${oracle.versions.R}, netmeta ${oracle.versions.netmeta})`,
  };
  if (numeric.nodeSplit.some(s => s.kDirect === undefined)) throw Error('kDirect missing for ' + item.key);
  // adapter tolerances against the page state
  const exp = new Map(leaves(referenceState(numeric)).map(x => [x.key, x.value]));
  const sorted = { ...state, nodeSplit: [...state.nodeSplit].sort((a, b) => a.comparison.localeCompare(b.comparison)) };
  const act = new Map(leaves(sorted).map(x => [x.key, x.value]));
  for (const [k, v] of exp) {
    const a = act.get(k);
    if (typeof v === 'number' && !/^(df|trts\.)|\.df$/.test(k)) {
      const isP = /(^|\.)p$/.test(k), tol = isP ? 1e-9 : item.model === 'PM' && !k.startsWith('estimates.') && k !== 'Q' ? 1e-6 : 1e-9;
      const d = Math.abs(a - v) / (isP ? 1 : Math.max(1, Math.abs(v)));
      if (!(d <= tol)) throw Error(`${item.key} ${k}: page ${a}, netmeta ${v}`);
      maxRel = Math.max(maxRel, d);
    } else if (!eq(a, v)) throw Error(`${item.key} ${k}: page ${JSON.stringify(a)}, expected ${JSON.stringify(v)}`);
    numericChecks++;
  }
  r.numeric = numeric;
  delete r.reason;
  r.display = displayOf(now, r.display);
}
// nothing else may change
next.cases.forEach((r, i) => { if (!superseded.includes(i) && !eq(r, ref.cases[i])) throw Error('unexpected change ' + r.key); });
const checks = countChecks(next.cases);
const out = JSON.stringify(next) + '\n';
const sha = createHash('sha256').update(out).digest('hex'), bytes = Buffer.byteLength(out);
console.log(JSON.stringify({ displayTreesReproduced: displayChecked, pageTextSubtreesReproduced: 3, superseded: superseded.map(i => corpus[i].key),
  numericLeavesChecked: numericChecks, maxRelDiff: maxRel, checksBefore: man.checks, checksAfter: checks, sha256: sha, bytes, written: WRITE }, null, 1));
if (WRITE) {
  writeFileSync(new URL('corpus/reference.json', dir), out);
  const f = man.files.find(x => x.path === 'validate/corpus/reference.json'); f.sha256 = sha; f.bytes = bytes;
  man.pageText = newPage; man.checks = checks;
  const nl = manRaw.endsWith('\r\n') ? '\r\n' : '\n';
  writeFileSync(new URL('MANIFEST.json', dir), JSON.stringify(man) + nl);
  const src2 = adapterSrc.replace(/^const CONTRACT = .*; \/\/ generated by build-fixtures.cjs(\r?)$/m, (_, cr) => 'const CONTRACT = ' + JSON.stringify(man) + '; // generated by build-fixtures.cjs' + cr);
  if (src2 === adapterSrc) throw Error('CONTRACT line not replaced');
  writeFileSync(new URL('adapter.js', dir), src2);
}
