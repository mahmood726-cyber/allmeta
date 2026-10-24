import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
export const apps = 'proportion-ma dta-sroc nma heterogeneity pubbias-tests multilevel-ma meta-regression mh-peto influence limit-ma gosh cumulative-subgroup rve-meta nma-inconsistency correlation-ma multivariate-ma component-nma dose-response-ma'.split(' ');
const raw = read('hub/shared/glossary.json');
const glossary = JSON.parse(raw);

// Inspect the JSON token stream before parsing can silently discard duplicate keys.
function uniqueKeys(json) {
  const stack = [];
  const tokens = json.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?|true|false|null/g);
  tokens.forEach((token, i) => {
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ':') {
      const key = JSON.parse(token), keys = stack.at(-1);
      assert.ok(!keys.has(key), `duplicate key: ${key}`); keys.add(key);
    }
  });
}
function validText(g) {
  for (const [key, entry] of Object.entries(g)) {
    if (key === '_meta') continue;
    assert.equal(typeof entry.short, 'string', key);
    const text = entry.short + (entry.long ? ' — ' + entry.long : '');
    assert.ok(text.trim().length && [...text].length <= 280, `${key}: ${text.length} chars`);
  }
}
function knownKeys(keys, g) {
  keys.forEach(key => assert.ok(Object.hasOwn(g, key), `missing glossary key: ${key}`));
}
test('every English entry has nonempty text of at most 280 characters; no duplicate JSON keys', () => {
  uniqueKeys(raw); validText(glossary);
});
test('PLANTED defects: duplicate keys, missing/empty/long definitions; valid controls', () => {
  uniqueKeys('{"a":{"short":"ok"},"b":{"short":"ok"}}');
  assert.throws(() => uniqueKeys('{"a":{},"a":{}}'), /duplicate/);
  assert.throws(() => uniqueKeys('{"a":{"short":"x","short":"y"}}'), /duplicate/);
  validText({ a: { short: 'x'.repeat(280) } });
  for (const entry of [{}, { short: '' }, { short: 'x'.repeat(281) }]) assert.throws(() => validText({ a: entry }));
  knownKeys(['CI'], glossary);
  assert.throws(() => knownKeys(['planted-missing-key'], glossary), /missing glossary key/);
});
for (const app of apps) test(`${app}: all registered aliases and authored marks have definitions`, () => {
  let options;
  vm.runInNewContext(read(`${app}/alm-glossary.js`), {
    window: { alm: { tooltips: opts => { options = opts; } } },
    document: { createElement: () => ({}), head: { append() {} } }
  });
  assert.ok(Object.keys(options.terms).length >= 10);
  knownKeys(Object.values(options.terms), glossary);
  assert.equal(options.terms['I²'], 'I2');
  assert.equal(options.terms['τ²'], 'tau2');
  assert.ok(!Object.keys(options.terms).some(key => key.includes('?')), 'display aliases preserve Unicode');
  assert.equal(options.terms['μ'], 'Mean');
  if (app === 'rve-meta') {
    assert.equal(options.terms['k'], 'EffectCount');
    assert.equal(options.terms['p ='], 'CoefficientCount');
    assert.equal(options.terms['p'], 'PValue');
  }
  const html = read(`${app}/index.html`);
  const marks = [...html.replaceAll('\\"', '"').matchAll(/data-gloss=["']([^"']+)["']/g)].map(m => m[1]);
  knownKeys(marks, glossary);
  assert.match(html, /<script[^>]+src="alm-glossary\.js"/);
  assert.ok(html.indexOf('hub/shared/tooltips.js') < html.indexOf('src="alm-glossary.js"'));
  const broken = { ...glossary }; delete broken[Object.values(options.terms)[0]];
  assert.throws(() => knownKeys(Object.values(options.terms), broken), /missing glossary key/);
});

function load() {
  const window = {};
  vm.runInNewContext(read('hub/shared/tooltips.js'), { window });
  return window.alm.tooltips;
}
test('per-key translation fallback retains translated entries and English-only entries', () => {
  const T = load();
  for (const lang of ['ar', 'es', 'zh']) {
    const translated = JSON.parse(read(`hub/shared/glossary.${lang}.json`));
    const merged = T.mergeGlossaries(glossary, translated);
    assert.deepEqual(merged.CR2, glossary.CR2);
    assert.deepEqual(merged.CI, translated.CI);
  }
  const g = { a: { short: 'English' }, b: { short: 'Only English' } };
  const t = { a: { short: 'Translated' }, b: { short: '' } };
  assert.equal(T.mergeGlossaries(g, t).b.short, 'Only English');
  const gate = merge => assert.equal(merge(g, t).b.short, 'Only English');
  gate(T.mergeGlossaries);
  assert.throws(() => gate((en, locale) => ({ ...en, ...locale })));
});
test('longest aliases win, punctuation is literal, words are bounded, case matters for symbols', () => {
  const T = load();
  const terms = { 'I²': 'I2', 'Q': 'Q', 'Fisher z': 'FisherZ', 'LR+': 'LRpos', 'p': 'PValue', 'P': 'Proportion' };
  const match = s => Array.from(s.matchAll(T.buildMatcher(terms)), m => m[0]);
  assert.deepEqual(match('I² Q Fisher z LR+ p P'), Object.keys(terms));
  assert.deepEqual(match('QI² Qtest Fisher zoo LRplus proportion'), []);
  const gate = make => assert.equal([...('Qtest').matchAll(make({ Q: 'Q' }))].length, 0);
  gate(T.buildMatcher); assert.throws(() => gate(() => /Q/g));
});

test('English definitions retain mathematical symbols and Handbook section signs', () => {
  assert.match(glossary.FisherZ.long, /n−3/);
  assert.match(glossary.Tau.long, /τ²/);
  assert.match(glossary.Q.long, /§10\.10\.2/);
  assert.ok(!raw.includes('?'), 'no encoding replacement question marks in definitions');
});

// Small DOM surface for the actual asynchronous loader, without a browser or
// a third-party DOM dependency. DOM interaction is covered by Playwright.
function runtime(fetcher, source = read('hub/shared/tooltips.js')) {
  const nodes = [];
  class Element {
    constructor() { this.attrs = {}; this.style = {}; this.dataset = {}; this.isConnected = true; this.children = []; }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
    append(...els) { this.children.push(...els); nodes.push(...els); }
    addEventListener() {}
  }
  const mark = new Element(); mark.textContent = 'CR2'; mark.setAttribute('data-gloss', 'CR2');
  const document = {
    head: new Element(), body: new Element(), documentElement: new Element(),
    createElement: () => new Element(),
    getElementById: id => nodes.find(n => n.id === id),
    querySelector: s => s === '.alm-lang-switch' ? {} : null,
    querySelectorAll: s => s === '[data-gloss]' ? [mark] : [],
    addEventListener() {}
  };
  const window = { addEventListener() {} };
  vm.runInNewContext(source, { window, document, fetch: fetcher, console,
    MutationObserver: class { disconnect() {} observe() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    queueMicrotask, setTimeout, clearTimeout });
  return { T: window.alm.tooltips, tip: () => nodes.find(n => n.id === mark.dataset.almTip) };
}
test('actual loader: missing key and missing locale file both fall back; present translation retains direction/disclaimer', async () => {
  const g = { CR2: { short: 'English CR2' } };
  const r = runtime(async url => ({ ok: !url.includes('.zh.'), json: async () => url.includes('.ar.')
    ? { CR2: { short: 'Arabic CR2' }, _meta: { disclaimer: 'Translation notice' } }
    : url.includes('.es.') ? { CI: { short: 'Spanish CI' } } : g }));
  await r.T({ src: 'glossary.json' });
  assert.equal(r.tip().textContent, 'English CR2');
  await r.T.setLang('es'); assert.equal(r.tip().textContent, 'English CR2'); assert.equal(r.tip().lang, 'en');
  await r.T.setLang('ar'); assert.equal(r.tip().textContent, 'Arabic CR2'); assert.equal(r.tip().dir, 'rtl');
  assert.equal(r.tip().children.at(-1).textContent, 'Translation notice');
  await r.T.setLang('zh'); assert.equal(r.tip().textContent, 'English CR2'); assert.equal(r.tip().dir, 'ltr');
});
test('PLANTED loader defect: replacing merged entries with locale alone loses English-only definitions', async () => {
  const source = read('hub/shared/tooltips.js');
  const marker = 'glossary = mergeGlossaries(english, translated);';
  assert.equal(source.split(marker).length, 2);
  async function gate(code) {
    const r = runtime(async url => ({ ok: true, json: async () => url.includes('.es.') ? {} : { CR2: { short: 'English CR2' } } }), code);
    await r.T({ src: 'glossary.json' }); await r.T.setLang('es');
    assert.equal(r.tip().textContent, 'English CR2');
  }
  await gate(source);
  await assert.rejects(() => gate(source.replace(marker, 'glossary = translated;')));
});
test('late locale response cannot overwrite a newer language selection (control + planted race)', async () => {
  const source = read('hub/shared/tooltips.js');
  async function gate(code) {
    let release;
    const r = runtime(async url => {
      if (url.includes('.es.')) await new Promise(resolve => { release = resolve; });
      return { ok: true, json: async () => ({ CR2: { short: url.includes('.es.') ? 'Spanish' : url.includes('.ar.') ? 'Arabic' : 'English' } }) };
    }, code);
    await r.T({ src: 'glossary.json' });
    const old = r.T.setLang('es'); await r.T.setLang('ar'); release(); await old;
    assert.equal(r.tip().textContent, 'Arabic');
  }
  await gate(source);
  assert.equal(source.split('if (version !== generation) return;').length, 2);
  await assert.rejects(() => gate(source.replace('if (version !== generation) return;', '')));
});
