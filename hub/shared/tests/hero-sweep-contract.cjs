const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const D = require('../../../shared/canonical-datasets.js');
const H = require('../../../shared/hero-examples.js');
// Parser citations and precise static proofs are in the lane's SWEEP.md.
const cases = [
  {app:'bayesian-ma', result:'#svg-host svg', kind:'effect'},
  {app:'bma-tau-priors', result:'#per-model tr', run:true, kind:'variance'},
  {app:'copas', result:'#body tr', run:true, kind:'effect', deps:['CC', 'num']},
  {app:'cross-design', result:'#results tbody tr', run:true, kind:'variance'},
  {app:'cross-network', result:'#results tbody tr', run:true, kind:'network'},
  {app:'cumulative-subgroup', result:'#svg-host svg', kind:'effect'},
  {app:'forest-plot', result:'#svg-host svg', kind:'effect'},
  {app:'funnel-plot', result:'#svg-host svg', kind:'effect'},
  {app:'gosh', result:'#plot circle', kind:'effect'},
  {app:'heterogeneity', result:'#svg-host svg', kind:'effect'},
  {app:'influence', result:'#body tr', run:true, kind:'effect', deps:['NUM'], se:'full'},
  {app:'limit-ma', result:'#body tr', kind:'effect'},
  {app:'meta-regression', result:'#svg-host svg', run:true, kind:'moderator'},
  {app:'personalised-te', result:'#subgroups tbody tr', run:true, kind:'personalised'},
  {app:'pet-peese', result:'#res-body tr', run:true, kind:'effect'},
  {app:'pubbias-tests', result:'#body tr', run:true, kind:'effect', deps:['parseLines'], se:'full'},
  {app:'rare-events-glmm', result:'#compare tbody tr', run:true, kind:'glmm'},
  {app:'sequential-ma', result:'#plot-host circle', run:true, kind:'sequential'},
  {app:'tsa', result:'#svg-host svg', kind:'effect'},
];
const writers = { forest:'toForestPlotText', bma:'toLabelEffectVarianceText', 'effect-se-label':'toEffectSeLabelText',
  'cross-design':'toCrossDesignText', 'meta-regression':'toMetaRegressionText', 'cross-network':'toCrossNetworkText', personalised:'toPersonalisedTeText',
  glmm:'toGlmmTextarea', sequential:'toSequentialMaText' };
// Page-scope declarations a parser calls, extracted verbatim by name: a function by its
// declaration indentation, or a one-line var/const/let. Parsers that acquired such helpers
// (influence da156d18: NUM; pubbias-tests 4960fa05: parseLines; copas dc2d373b: num) could
// not run when extracted alone and died with ReferenceError before any classification.
function declaration(html, name) {
  const fn = html.match(new RegExp(`^([ \\t]*)function ${name}\\([^)]*\\) \\{[\\s\\S]*?^\\1\\}`, 'm'));
  if (fn) return fn[0].trim();
  const v = html.match(new RegExp(`^[ \\t]*(?:var|const|let) ${name} = [^\\n]*;\\r?$`, 'm'));
  if (!v) throw new Error(`${name}: declaration not found`);
  return v[0].trim();
}
// Run the page's own attachHero call (adapter AND onAfterLoad) and return what it leaves in
// the textarea, as hero-effect-se-label.test.cjs does: pages that rewrite the adapter text in
// onAfterLoad (influence, pubbias-tests) are measured on what the user actually gets.
function heroText(attachment, key) {
  let change;
  const elements = {};
  const textarea = { value: '', dispatchEvent() {} };
  const mount = { innerHTML: '', addEventListener(name, fn) { change = fn; } };
  const context = vm.createContext({
    Event: class { constructor(type) { this.type = type; } },
    document: {
      querySelector: sel => (sel === '#alm-hero-mount' ? mount : textarea),
      getElementById: id => (id === 'src' || id === 'f-data' ? textarea
        : elements[id] || (elements[id] = { value: '', click() {}, dispatchEvent() {} })),
    },
  });
  for (const file of ['shared/canonical-datasets.js', 'shared/hero-examples.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  vm.runInContext(attachment, context);
  change({ target: { closest: () => ({ value: key }) } });
  return textarea.value;
}
function contract(c, suppliedText) {
  const html = fs.readFileSync(path.join(root, c.app, 'index.html'), 'utf8');
  const attachment = html.match(/AlmHero\.attachHero\(\{[\s\S]*?\n      \}\);/)[0];
  const adapter = attachment.match(/adapter: "([^"]+)"/)[1];
  const key = H.MANIFESTS[adapter][0].key;
  const dataset = D.get(key);
  const text = suppliedText === undefined ? heroText(attachment, key) : suppliedText;
  // Exact source extraction by declaration indentation; no rewritten parsing rules.
  const parser = html.match(/^([ \t]*)function (parseStudies|parseTESE|parseTable|parse)\(text\) \{[\s\S]*?^\1\}/m)[0].trim();
  const name = parser.match(/^function (\w+)/)[1];
  const deps = (c.deps || []).map(d => declaration(html, d));
  const parsed = vm.runInNewContext([...deps, parser, name].join('\n'),
    { window: { AlmCopasCore: require('../../../shared/copas-core.js') } })(text);
  const rows = parsed.studies || parsed.rows || parsed;
  let actual, expected;
  if (c.kind === 'effect') {
    actual = rows.map(r => [r.est ?? r.te ?? r.yi, r.se]);
    // SE exactly as the page writes it: the shared adapters round to 4 dp; influence and
    // pubbias-tests rewrite it at full precision in onAfterLoad.
    expected = dataset.effect_se.map(r => [r.yi, c.se === 'full' ? Math.sqrt(r.vi) : Number(Math.sqrt(r.vi).toFixed(4))]);
  } else if (c.kind === 'moderator') {
    // meta-regression reads "label, estimate, SE, moderator"; BCG's moderator is latitude.
    actual = rows.map(r => [r.est, r.se, r.x]);
    expected = dataset.effect_se.map(r => [r.yi, Number(Math.sqrt(r.vi).toFixed(4)), r.latitude]);
  } else if (c.kind === 'variance') {
    actual = rows.map(r => [r.yi, r.vi]); expected = dataset.effect_se.map(r => [r.yi, r.vi]);
  } else if (c.kind === 'network') {
    actual = rows.map(r => [r.contrast, r.yi, r.vi, r.design]);
    expected = dataset.effect_se.map(r => ['BCG_vs_placebo', r.yi, r.vi, r.design]);
  } else if (c.kind === 'personalised') {
    actual = rows.map(r => [r.study, r.subgroup, r.yi, r.vi]);
    expected = dataset.rows.map(r => [r.study, r.subgroup, r.yi, r.vi]);
  } else if (c.kind === 'glmm') {
    actual = rows.map(r => [r.label, r.events_T, r.n_T, r.events_C, r.n_C]);
    expected = dataset.binary_2x2.map(r => [r.label, r.events_T, r.n_T, r.events_C, r.n_C]);
  } else {
    actual = rows.map(r => [r.y_cum, r.se_cum, r.n_cum]);
    expected = dataset.looks_ysn.map(r => [r.y_cum, r.se_cum, r.n_cum]);
  }
  return {adapter, actual:JSON.parse(JSON.stringify(actual)), expected, text};
}
module.exports = {cases, contract, root};
