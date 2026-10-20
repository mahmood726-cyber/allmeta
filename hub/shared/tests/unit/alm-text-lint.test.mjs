// No-digit-literal lint for F2 text templates (DESIGN.md "F2 In-app text" (4)).
// Every number in generated text must come from a T helper reading results(); a digit literal
// in a template (e.g. "95%" typed into a string) would print a number nobody audited.
// Scans every <app>/alm-features*.js: loads it in a vm sandbox with a stub AlmFeatures.register,
// collects text.templates, strips LEAF T helper calls (whose arguments are keys/digit counts),
// and fails on any remaining digit that is not part of an identifier.
// Planted fixtures prove the lint catches a "95%" literal and a digit hidden inside T.when(...).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const LEAF = ['num', 'est', 'int', 'pct', 'prop', 'ci', 'p', 'cite', 'rule', 'band', 'zero', 'shown', 'has', 'hasCtx', 'ctx'];
const LEAF_RE = new RegExp('\\bT\\.(?:' + LEAF.join('|') + ')\\s*\\(', 'g');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

function stripLeafCalls(src) {
  let out = '', i = 0;
  LEAF_RE.lastIndex = 0;
  let m;
  while ((m = LEAF_RE.exec(src))) {
    out += src.slice(i, m.index);
    let depth = 1, j = m.index + m[0].length, quote = null;
    for (; j < src.length && depth > 0; j++) {
      const c = src[j];
      if (quote) { if (c === '\\') j++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    out += 'T.__leaf__';
    i = j;
    LEAF_RE.lastIndex = j;
  }
  return out + src.slice(i);
}

// Digits not preceded by an identifier character (so r.i2, tau2 in identifiers, \u00b2 escapes are allowed).
function digitLiterals(fnSource) {
  const s = stripLeafCalls(stripComments(fnSource));
  const hits = [];
  const re = /(?<![\w$])\d+(?:\.\d+)?%?/g;
  let m;
  while ((m = re.exec(s))) hits.push(s.slice(Math.max(0, m.index - 25), m.index + m[0].length + 10).replace(/\s+/g, ' '));
  return hits;
}

function lintTemplates(templates) {
  const out = [];
  for (const [name, fn] of Object.entries(templates || {})) {
    if (typeof fn !== 'function') continue;
    for (const h of digitLiterals(fn.toString())) out.push(`${name}: …${h}…`);
  }
  return out;
}

function featureFiles() {
  const files = [];
  for (const d of fs.readdirSync(ROOT, { withFileTypes: true })) {
    // shared/ and hub/ hold the host modules, not per-app adapters.
    if (!d.isDirectory() || d.name.startsWith('.') || ['node_modules', 'shared', 'hub'].includes(d.name)) continue;
    let names = [];
    try { names = fs.readdirSync(path.join(ROOT, d.name)); } catch { continue; }
    for (const n of names) if (/^alm-features(?:-[\w-]+)?\.js$/.test(n)) files.push(path.join(ROOT, d.name, n));
  }
  return files.sort();
}

function loadSpecs(file) {
  const registered = [];
  const stub = new Proxy(function () {}, { get: (t, p) => (p === Symbol.toPrimitive ? () => '' : stub), apply: () => stub });
  const sandbox = { console, document: stub, navigator: {}, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.AlmFeatures = { register: (app, spec) => registered.push({ app, spec }), revision: () => undefined };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  const specs = registered.map(r => ({ app: r.app, text: r.spec && r.spec.text }));
  if (sandbox.AlmTextSpecs) for (const [app, t] of Object.entries(sandbox.AlmTextSpecs)) specs.push({ app, text: t });
  return specs.filter(s => s.text && s.text.templates);
}

test('no digit literals in any registered text template (every */alm-features*.js)', () => {
  const files = featureFiles();
  let nTemplates = 0, nFilesWithText = 0;
  const problems = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    const src = fs.readFileSync(f, 'utf8');
    let specs;
    try {
      specs = loadSpecs(f);
    } catch (e) {
      // A file that cannot be loaded cannot be linted; fail closed only if it carries templates.
      if (/templates/.test(src)) problems.push(`${rel}: could not be loaded for linting (${e.message})`);
      continue;
    }
    if (specs.length) nFilesWithText++;
    for (const s of specs) {
      nTemplates += Object.values(s.text.templates).filter(v => typeof v === 'function').length;
      for (const p of lintTemplates(s.text.templates)) problems.push(`${rel} [${s.app}] ${p}`);
    }
  }
  console.log(`TEXTLINT files=${files.length} withText=${nFilesWithText} templates=${nTemplates} digitLiterals=${problems.length}`);
  assert.ok(files.some(f => f.endsWith(path.join('proportion-ma', 'alm-features-text.js'))), 'proportion-ma/alm-features-text.js found');
  assert.ok(nTemplates >= 4, 'at least the four proportion-ma templates were linted');
  assert.deepEqual(problems, []);
});

test('PLANTED: a template with a "95%" literal is caught', () => {
  const planted = {
    plain: function (T) { return ['Pooled ', T.prop('poolP', 1), ' (95% CI ', T.ci('poolLo', 'poolHi', 1, 'prop'), ').']; },
  };
  const hits = lintTemplates(planted);
  console.log(`TEXTLINT planted-95% hits=${hits.length}`);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /95%/);
});

test('PLANTED: a digit hidden inside T.when(...) parts, or a bare numeric condition, is caught', () => {
  const planted = {
    results: function (T, r) { return [T.when(r.k >= 3, ['at least ', 'three']), T.when(true, ['k was ', '7 ']), T.num('tau2', 4)]; },
  };
  const hits = lintTemplates(planted);
  assert.equal(hits.length, 2, hits.join(' | '));
  // allowed: keys and digit counts inside leaf calls, identifiers with digits, unicode escapes
  const clean = { results: function (T, r) { return [T.num('tau2', 4), ' I\u00b2 ', T.pct('i2', 1), T.when(r.i2 > T.R.fewK, 'x')]; } };
  assert.deepEqual(lintTemplates(clean), []);
});
