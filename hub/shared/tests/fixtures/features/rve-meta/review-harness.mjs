// Runs the real engine and adapters with only the input DOM stubbed. No browser or R parity claim.
import fs from 'node:fs';
import vm from 'node:vm';

export const root = new URL('../../../../../../', import.meta.url);
export function load(interceptOnly = false) {
  const read = path => fs.readFileSync(new URL(path, root), 'utf8');
  const html = read('rve-meta/index.html');
  let src = JSON.parse(/var SMALL_EXAMPLE = ("[^\r\n]*");/.exec(html)[1]);
  if (interceptOnly) src = src.split('\n').map(line => line.split(',').slice(0, 3).join(',')).join('\n');
  const nodes = {
    src: { value: src }, 'f-rho': { value: '0.8' },
    'f-names': { value: interceptOnly ? '' : 'intervention, dose_weeks' },
    'f-centre': { checked: false }, 'coef-body': {}
  };
  const context = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  context.window = context;
  for (const path of ['shared/build-info.js', 'shared/stats-qt.js', 'shared/rve.js', 'shared/alm-text.js', 'shared/alm-verify-r.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  const rows = src.split('\n').map(line => {
    const [cluster, yi, vi, ...mods] = line.trim().split(/\s*,\s*/);
    return { cluster, yi: +yi, vi: +vi, X: [1, ...mods.map(Number)] };
  });
  const fit = context.AlmRVE.fitCORR(rows, { rho: 0.8 });
  const summary = context.AlmRVE.summary(fit);
  const inputs = { rows: rows.map(r => ({ cluster: r.cluster, yi: r.yi, vi: r.vi, x: r.X.slice(1) })),
    predictor_names: interceptOnly ? [] : ['intervention', 'dose_weeks'], centred: false };
  context.__almLastRVE = () => ({ fit, summary, inputs });
  context.document = { getElementById: id => nodes[id], querySelector: () => ({}), addEventListener() {} };
  context.MutationObserver = class { observe() {} };
  context.AlmValidate = { adapters: {} };
  context.AlmFeatures = { register() {}, verifiedCurrent: () => false };
  for (const path of ['rve-meta/alm-live.js', 'rve-meta/alm-features.js']) {
    vm.runInContext(read(path), context, { filename: path });
  }
  return context;
}

export function report(context, df) {
  const spec = context.AlmRVEFeatures.text, r = spec.results();
  if (df !== undefined) r.coefficientKeys.forEach(c => { r[c.prefix + 'df'] = df; });
  const rendered = context.AlmText.render(spec.templates, r, { app: 'rve-meta', build: context.AlmBuildInfo, entryLog: [], verify: null });
  return { r, rendered, audit: context.AlmText.audit(rendered, r) };
}

export function script(context) {
  const block = context.AlmRVEFeatures.verify, adapter = block.adapter(), state = adapter.currentState();
  return context.AlmVerifyR.downloadScript('rve-meta', adapter.buildScript(state), block.plots, state);
}
