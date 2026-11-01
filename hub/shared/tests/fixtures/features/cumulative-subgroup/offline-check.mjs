// Supplemental in-process checks for restricted environments. Executes the unmodified
// app's statistical functions from index.html; does not claim DOM, axe, or R coverage.
// Run from any directory: node <this file> [--write-snapshot]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = new URL('../../../../../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, ROOT), 'utf8');
const html = read('cumulative-subgroup/index.html');
const source = html.slice(html.indexOf('    function parseStudies('), html.indexOf('    function escapeXml('));
assert.ok(source.startsWith('    function parseStudies(') && source.includes('function subgroup('));
const exampleLine = html.match(/const EXAMPLE = ("[^\n]+?");/)[1];
const example = JSON.parse(exampleLine);
const ctx = vm.createContext({ console });
ctx.window = ctx;
vm.runInContext(read('shared/ma-core.js'), ctx);
vm.runInContext('var Z975 = 1.959963984540054;\n' + source, ctx);
vm.runInContext(read('shared/alm-entry.js'), ctx);
vm.runInContext(read('shared/alm-text.js'), ctx);
vm.runInContext(read('shared/build-info.js'), ctx);
ctx.AlmFeatures = { register() {}, verifiedCurrent() { return false; } };
ctx.alm = { urlState: { withoutWrites(fn) { fn(); } } };
ctx.__almCumSubValidationRun = () => ctx.current;
ctx._almLastCumSub = () => ctx.current.summary;
vm.runInContext(read('cumulative-subgroup/alm-features.js'), ctx);
const spec = ctx.AlmCumSubFeatures;
const parsed = ctx.parseStudies(example), rows = parsed.studies;
const plain = v => JSON.parse(JSON.stringify(v));
const snapshots = { app: 'cumulative-subgroup', source: 'Built-in example; default title and axes; both views' };
for (const view of ['cumulative', 'subgroup']) {
  ctx.current = { parsed, summary: { view }, cum: ctx.cumulative(rows), sub: ctx.subgroup(rows) };
  const r = spec.text.results();
  const context = { app: 'cumulative-subgroup', build: ctx.AlmBuildInfo, entryLog: [], verify: null };
  const rendered = ctx.AlmText.render(spec.text.templates, r, context);
  const audit = ctx.AlmText.audit(rendered, r, { ctx: context });
  assert.equal(audit.ok, true, JSON.stringify(audit.failures));
  const norm = p => p.segments.map(s => s.type === 'ctx' && s.key.startsWith('build.') ? '<' + s.key + '>' : s.text).join('');
  snapshots[view] = { plain: norm(rendered.plain), methods: norm(rendered.methods), results: norm(rendered.results), flags: rendered.flags.map(norm), references: rendered.cites.map(c => c.full) };
  console.log(`OFFLINE TEXTAUDIT ${audit.passed}/${audit.checks} view=${view} DOM not exercised`);
  // Independent comparison of the result accessor against the app engine's returned pool.
  const p = view === 'cumulative' ? ctx.current.cum.series.at(-1) : ctx.current.sub.overall;
  for (const key of ['mu', 'lo', 'hi', 'tau2', 'piLo', 'piHi']) assert.equal(r[key], p[key]);
  // A changed source result must fail provenance checks against the already rendered text.
  const bad = ctx.AlmText.audit(rendered, { ...r, mu: r.mu + 0.1 }, { ctx: context });
  assert.equal(bad.ok, false);
  console.log(`OFFLINE TEXT PLANTED ${bad.passed}/${bad.checks} provenance=FAIL`);
}
const snapURL = new URL('hub/shared/tests/__snapshots__/text-cumulative-subgroup.json', ROOT);
if (process.argv.includes('--write-snapshot')) fs.writeFileSync(snapURL, JSON.stringify(snapshots, null, 2) + '\n');
assert.deepEqual(plain(snapshots), JSON.parse(fs.readFileSync(snapURL, 'utf8')));

// Optional native R supplement: reuse buildScript verbatim from the sole live adapter,
// plus the feature adapter's actual plot code. No displayed quantities are claimed here.
const rDir = process.argv.find(a => a.startsWith('--r-dir='))?.slice('--r-dir='.length);
if (rDir) {
  fs.mkdirSync(rDir, { recursive: true });
  const adapter = read('cumulative-subgroup/validate/adapter.js');
  vm.runInContext('const finite = Number.isFinite;\n' +
    adapter.slice(adapter.indexOf('function rnum('), adapter.indexOf('function currentState(')) +
    adapter.slice(adapter.indexOf('function buildScript('), adapter.indexOf('const adapter = {')), ctx);
  for (const view of ['cumulative', 'subgroup']) {
    const cum = ctx.cumulative(rows), sub = ctx.subgroup(rows);
    const pools = view === 'cumulative' ? cum.series : [...sub.groups, sub.overall];
    const members = view === 'cumulative' ? pools.map((_, j) => cum.sorted.slice(0, j + 1).map(r => rows.indexOf(r) + 1))
      : [...sub.groups.map(g => rows.flatMap((r, i) => (r.group || '(ungrouped)') === g.name ? [i + 1] : [])), rows.map((_, i) => i + 1)];
    const state = { view, yi: rows.map(r => r.est), sei: rows.map(r => r.se), year: rows.map(r => r.year),
      group: rows.map(r => r.group), groups: view === 'subgroup' ? sub.groups.map(g => g.name) : null,
      ta: pools.map(p => p.tau2), am: members.map(m => m.join(',')) };
    const checks = [];
    const add = (key, value, kind = 'rel') => checks.push({ key, value, kind });
    pools.forEach((p, i) => {
      const prefix = view === 'cumulative' ? 'step.' + (i + 1) : i === pools.length - 1 ? 'overall' : 'group.' + (i + 1);
      add(prefix + '.members', members[i].join(','), 'exact'); add(prefix + '.k', p.k, 'exact');
      for (const key of ['tau2', 'mu', 'se', 'lo', 'hi', 'Q', 'piLo', 'piHi']) add(prefix + '.' + key, p[key], key === 'tau2' ? 'tau2' : 'rel');
    });
    if (view === 'subgroup') {
      add('df_bw', sub.df_bw, 'exact'); add('Q_bw', sub.Q_bw); add('M_bw', sub.M_bw);
      add('pQ', sub.pQ, 'abs'); add('I2_bw_fraction', sub.I2_bw / 100, 'abs');
    }
    const literals = x => x === null ? 'NA_real_' : JSON.stringify(x);
    const comparison = checks.map(c => {
      const ref = `out[[${JSON.stringify(c.key)}]]`, val = literals(c.value);
      const expr = c.value === null ? `is.na(${ref})` : c.kind === 'exact' ? `${ref} == ${val}`
        : `abs(${ref} - (${val})) <= ${c.kind === 'tau2' ? '1e-6' : '1e-9'}${c.kind === 'abs' ? '' : ` * max(1,abs(${ref}))`}`;
      return `checks[[${JSON.stringify(c.key)}]] <- ${expr}`;
    }).join('\n');
    const plantedKey = view === 'cumulative' ? 'step.9.mu' : 'overall.mu';
    const script = ctx.buildScript(state) + '\nchecks <- list()\n' + comparison +
      `\nstopifnot(all(unlist(checks)))\ncat('NATIVE ${view} ',sum(unlist(checks)),'/',length(checks),'\\n',sep='')\n` +
      `out[['${plantedKey}']] <- out[['${plantedKey}']] + .01\n` + comparison +
      `\nstopifnot(identical(names(checks)[!unlist(checks)], '${plantedKey}'))\n` +
      `cat('NATIVE ${view} PLANTED ',sum(unlist(checks)),'/',length(checks),' ${plantedKey}=FAIL\\n',sep='')\n` +
      `pdf(${JSON.stringify(view + '-forest.pdf')}, width=8, height=6)\n` + spec.verify.plots[0].r(state) +
      `\ndev.off()\ncat('NATIVE ${view} forest=PASS\\n')\n`;
    fs.writeFileSync(path.join(rDir, view + '.R'), script);
  }
}

const z = 1.959963984540054;
const inputs = [
  ['study\testimate\tSE\tyear\tsubgroup', ...rows.map(r => [r.label, r.est, r.se, r.year, r.group].join('\t'))].join('\n'),
  ['study  estimate  year  subgroup', ...rows.map(r => `${r.label}  ${r.est} (${r.est - z * r.se} to ${r.est + z * r.se})  ${r.year}  ${r.group}`)].join('\n'),
  ['Study or Subgroup\tlog OR\tSE\tyear\tsubgroup', ...rows.map(r => [r.label, r.est, r.se, r.year, r.group].join('\t'))].join('\n')
];
function convert(source) {
  const table = ctx.AlmEntry.parseTable(source), detection = ctx.AlmEntry.detect(table, spec.entry.schema);
  (table.header || []).forEach((h, i) => {
    if (spec.entry.extras.includes(h)) { detection.mapping[i] = h; detection.questions = detection.questions.filter(q => q.id !== 'column:' + i); }
  });
  return ctx.AlmEntry.convert(table, detection, spec.entry.schema);
}
let n = 0;
for (const input of inputs) {
  const out = convert(input);
  assert.deepEqual(plain(out.flags.filter(f => f.blocking)), []);
  assert.deepEqual(plain(out.questions), []);
  const restored = out.records.map(r => ({ label: r.study, est: r.yi, se: r.sei, v: r.sei ** 2, year: Number(r.year), group: r.subgroup }));
  assert.deepEqual(plain(restored.map(r => [r.label, r.year, r.group])), plain(rows.map(r => [r.label, r.year, r.group])));
  for (const view of ['cumulative', 'subgroup']) {
    const pool = a => view === 'cumulative' ? ctx.cumulative(a).series.at(-1) : ctx.subgroup(a).overall;
    const a = pool(restored), b = pool(rows);
    assert.equal(a.k, b.k);
    assert.ok(Math.abs(a.mu - b.mu) / Math.abs(b.mu) <= 1e-9);
    n++;
  }
}
console.log(`OFFLINE ENTRYRT ${n}/6 (parser/converter + unchanged engine; browser apply not exercised)`);
const bad = convert('study\testimate\tyear\tsubgroup\nBad\t-0.2 (0.4 to -0.8)\t2020\tA');
assert.ok(bad.flags.some(f => f.blocking && f.code === 'ci-order'));
console.log('OFFLINE ENTRY PLANTED reversed CI=BLOCK');
