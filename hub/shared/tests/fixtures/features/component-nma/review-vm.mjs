// Sandbox fallback: execute the unchanged page engine and shared text core in-process.
// The small DOM models tables, entry controls and events; Playwright remains the layout/live-R gate.
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../../../../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const html = read('component-nma/index.html');
const heterogeneous = JSON.parse(read('component-nma/tests/fixtures/cnma-validation-oracle.json')).cases.heterogeneous;
const engine = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('var Z975'));
function environment() {
  const nodes = {};
  function node() {
    return { value: '', children: [], listeners: {}, disabled: false,
      get textContent() { return (this.text || '') + this.children.map(n => n.textContent).join(''); },
      set textContent(value) { this.text = value; this.children = []; },
      setAttribute() {}, appendChild(n) { this.children.push(n); n.parent = this; return n; },
      replaceChildren(...children) { this.text = ''; this.children = []; children.forEach(n => this.appendChild(n)); },
      remove() { this.parent.children = this.parent.children.filter(n => n !== this); },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      dispatchEvent(e) { for (const fn of this.listeners[e.type] || []) fn(e); },
      click() { if (!this.disabled) this.dispatchEvent({ type: 'click' }); },
      querySelectorAll(selector) { return this.children.flatMap(n => [n, ...n.querySelectorAll('*')]).filter(n => selector === '*' || n.tagName === selector); },
      get innerHTML() { return this.html || ''; },
      set innerHTML(value) {
        this.html = value;
        this.rows = [...value.matchAll(/<tr>(.*?)<\/tr>/g)].map(m => ({ cells: [...m[1].matchAll(/<td>(.*?)<\/td>/g)].map(c => ({ textContent: c[1].replace(/<[^>]*>/g, '') })) }));
      }
    };
  }
  const document = { getElementById(id) { return nodes[id] ||= node(); },
    querySelectorAll(selector) { const id = selector.match(/^#([^ ]+) tr$/)?.[1]; return nodes[id]?.rows || []; },
    createElement(tag) { return Object.assign(node(), { tagName: tag, ownerDocument: document }); }
  };
  document.getElementById('src').value = html.match(/<textarea id="src"[^>]*>([\s\S]*?)<\/textarea>/)[1];
  const modules = {};
  const ctx = { document, console, Event, AlmFeaturesState: {},
    AlmFeatures: { register() {}, registerModule(k, m) { modules[k] = m; }, verifiedCurrent() { return false; } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const source of [engine, read('shared/alm-entry.js'), read('shared/alm-entry-ui.js'), read('shared/alm-text.js'), read('component-nma/alm-features.js'), read('hub/shared/tests/fixtures/features/component-nma/review-cases.js')]) vm.runInContext(source, ctx);
  return { ctx, modules, document };
}
let passed = 0, failed = 0;
const names = Object.keys(environment().ctx.AlmReviewCases);
for (const name of names) {
  try { const { ctx } = environment(); ctx.AlmReviewCases[name](heterogeneous); console.log('PASS ' + name); passed++; }
  catch (e) { console.log('FAIL ' + name + ': ' + e.message); failed++; }
}
try {
  const { ctx, modules, document } = environment(), panel = document.createElement('section');
  const ui = modules.entry.render(panel, { block: ctx.AlmComponentFeatures.entry });
  const button = panel.querySelectorAll('button').find(n => n.textContent === 'Extract paper text with source confirmation');
  if (!button.disabled || !panel.children.some(n => n.textContent.includes('Source confirmation is not available for contrast tables'))) throw Error('Unsupported confirmation remains enabled or unexplained');
  const paste = panel.querySelectorAll('textarea')[0];
  const text = 'study\tt1\tt2\tyi\tsei\none\ta\tcontrol\t-.3\t.1\ntwo\tb\tcontrol\t.2\t.1';
  paste.value = text;
  button.click();
  if (panel.querySelectorAll('textarea')[0] !== paste || paste.value !== text) throw Error('Confirmation destroyed the pasted table');
  ui.parse();
  if (panel.querySelectorAll('button').find(n => n.textContent === 'Use these rows').disabled) throw Error('Table preview must remain usable');
  console.log('PASS ENTRY: unsupported confirmation is disabled and explained'); passed++;
} catch (e) { console.log('FAIL ENTRY: ' + e.message); failed++; }
if (process.argv.includes('--snapshot') && !failed) {
  const { ctx } = environment(), s = ctx.AlmComponentFeatures.text;
  const out = ctx.AlmText.render(s.templates, s.results(), { app: 'component-nma', build: { version: 'vtest', shortSha: 'test' }, entryLog: [], verify: null });
  const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
  const path = 'hub/shared/tests/__snapshots__/text-component-nma.json', snapshot = JSON.parse(read(path));
  for (const key of ['plain', 'methods', 'results']) snapshot[key] = norm(out[key]);
  snapshot.flags = out.flags.map(f => f.text);
  snapshot.references = out.cites.map(c => c.full);
  fs.writeFileSync(new URL(path, root), JSON.stringify(snapshot, null, 2) + '\n');
}
console.log(`REVIEW_VM ${passed}/${passed + failed}`);
if (failed) process.exitCode = 1;
