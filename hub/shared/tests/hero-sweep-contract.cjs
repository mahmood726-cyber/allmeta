const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const D = require('../../../shared/canonical-datasets.js');
const H = require('../../../shared/hero-examples.js');
// Parser citations and precise static proofs are in the lane's SWEEP.md.
const cases = [
  {app:'bayesian-ma', result:'#svg-host svg', kind:'effect'},
  {app:'bma-tau-priors', result:'#per-model tr', run:true, kind:'variance', broken:'Parser reads variance; BMA adapter emits SE.'},
  {app:'copas', result:'#body tr', run:true, kind:'effect', broken:'Numeric label years enter the effect/SE fields; only three BCG studies survive.'},
  {app:'cross-design', result:'#results tbody tr', run:true, kind:'variance', broken:'Parser reads variance; cross-design adapter emits SE.'},
  {app:'cross-network', result:'#results tbody tr', run:true, kind:'network'},
  {app:'cumulative-subgroup', result:'#svg-host svg', kind:'effect'},
  {app:'forest-plot', result:'#svg-host svg', kind:'effect'},
  {app:'funnel-plot', result:'#svg-host svg', kind:'effect'},
  {app:'gosh', result:'#plot circle', kind:'effect'},
  {app:'heterogeneity', result:'#svg-host svg', kind:'effect'},
  {app:'influence', result:'#body tr', run:true, kind:'effect', broken:'Parser reads effect first; forest emits label first (fixed on another branch).'},
  {app:'limit-ma', result:'#body tr', kind:'effect'},
  {app:'meta-regression', result:'#svg-host svg', run:true, kind:'effect', broken:'Parser requires four columns including moderator; forest emits three.'},
  {app:'personalised-te', result:'#subgroups tbody tr', run:true, kind:'personalised'},
  {app:'pet-peese', result:'#res-body tr', run:true, kind:'effect', broken:'Parser reads effect first; forest emits label first.'},
  {app:'pubbias-tests', result:'#body tr', run:true, kind:'effect', broken:'Numeric label years enter the effect/SE fields; only three BCG studies survive.'},
  {app:'rare-events-glmm', result:'#compare tbody tr', run:true, kind:'glmm'},
  {app:'sequential-ma', result:'#plot-host circle', run:true, kind:'sequential'},
  {app:'tsa', result:'#svg-host svg', kind:'effect'},
];
const writers = { forest:'toForestPlotText', bma:'toForestPlotText', 'effect-se-label':'toEffectSeLabelText',
  'cross-design':'toCrossDesignText', 'cross-network':'toCrossNetworkText', personalised:'toPersonalisedTeText',
  glmm:'toGlmmTextarea', sequential:'toSequentialMaText' };
function contract(c, suppliedText) {
  const html = fs.readFileSync(path.join(root, c.app, 'index.html'), 'utf8');
  const attachment = html.match(/AlmHero\.attachHero\(\{[\s\S]*?\n      \}\);/)[0];
  const adapter = attachment.match(/adapter: "([^"]+)"/)[1];
  const dataset = D.get(H.MANIFESTS[adapter][0].key);
  const text = suppliedText === undefined ? D[writers[adapter]](dataset) : suppliedText;
  // Exact source extraction by declaration indentation; no rewritten parsing rules.
  const declaration = html.match(/^([ \t]*)function (parseStudies|parseTESE|parseTable|parse)\(text\) \{[\s\S]*?^\1\}/m)[0].trim();
  const parsed = vm.runInNewContext(`(${declaration})`)(text);
  const rows = parsed.studies || parsed;
  let actual, expected;
  if (c.kind === 'effect') {
    actual = rows.map(r => [r.est ?? r.te ?? r.yi, r.se]);
    expected = dataset.effect_se.map(r => [r.yi, Number(Math.sqrt(r.vi).toFixed(4))]);
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
