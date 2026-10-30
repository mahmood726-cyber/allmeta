/* Pure text helpers: no fitting, DOM writes, defaults, or network access. */
(function (root) {
  'use strict';
  const refs = typeof module === 'object' && module.exports
    ? require('../../shared/method-refs.js') : root.alm && root.alm.methodRefs;
  const DRAFT = 'Auto-generated draft - check before use';
  const estimators = Object.freeze({FE: 'common-effect', DL: 'DerSimonian–Laird',
    PM: 'Paule–Mandel', REML: 'restricted maximum likelihood', ML: 'maximum likelihood',
    HE: 'Hedges', HS: 'Hunter–Schmidt', SJ: 'Sidik–Jonkman', EB: 'empirical Bayes'});
  const tests = Object.freeze({z: 'normal (Wald)', knha: 'Hartung–Knapp',
    adhoc: 'modified Hartung–Knapp with the variance factor floored at unity', t: 't-based'});
  const measures = Object.freeze({MD: 'mean difference', SMD: 'standardised mean difference',
    RR: 'risk ratio', OR: 'odds ratio', HR: 'hazard ratio', RD: 'risk difference',
    generic: 'effect on the supplied analysis scale'});
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function validate(spec) {
    if (!spec || !own(estimators, spec.estimator) || !own(tests, spec.test) ||
        !own(measures, spec.measure) || !['common', 'random'].includes(spec.model) ||
        (spec.model === 'common') !== (spec.estimator === 'FE'))
      throw new TypeError('Unsupported or inconsistent model specification');
    if (spec.model === 'common' && spec.test !== 'z')
      throw new TypeError('Only normal common-effect intervals are supported');
  }
  function lint(text) {
    const banned = /\b(proves?|proven|no (?:effect|heterogeneity|publication bias)|clinically significant|definitive|conclusive|guaranteed|publication.ready|statistically insignificant)\b/gi;
    return Array.from(String(text).matchAll(banned), m => m[0]);
  }
  function bibEscape(s) {
    return s.replace(/[\\{}%&#_$]/g, c => '\\' + c);
  }
  function methods(spec) {
    validate(spec);
    if (!refs) throw new Error('Load shared/method-refs.js first');
    const selected = refs.entries;
    const text = DRAFT + '\n' + (spec.model === 'common'
      ? 'A common-effect inverse-variance meta-analysis was specified.'
      : 'A random-effects inverse-variance meta-analysis was specified, with between-study variance estimated using ' + estimators[spec.estimator] + '.') +
      ' The effect measure was ' + measures[spec.measure] + '. Pooled confidence intervals used the ' + tests[spec.test] + ' method.';
    const vancouver = selected.map((r, i) => (i + 1) + '. ' + r.vancouver + (r.doi ? ' doi:' + r.doi : '')).join('\n');
    const bibtex = selected.map(r => '@article{' + r.id + ',\n' +
      Object.entries({author: r.authors.join(' and '), title: r.title, journal: r.journal,
        year: r.year, volume: r.volume, number: r.issue, pages: r.pages, ...(r.doi ? {doi: r.doi} : {})})
        .map(([k, v]) => '  ' + k + ' = {' + bibEscape(v) + '}').join(',\n') + '\n}').join('\n\n');
    const ris = selected.map(r => ['TY  - JOUR', ...r.authors.map(a => 'AU  - ' + a),
      'TI  - ' + r.title, 'JO  - ' + r.journal, 'PY  - ' + r.year, 'VL  - ' + r.volume,
      'IS  - ' + r.issue, 'SP  - ' + r.pages.split('-')[0], 'EP  - ' + r.pages.split('-')[1],
      ...(r.doi ? ['DO  - ' + r.doi] : []), 'ER  - '].join('\n')).join('\n\n');
    return {text, vancouver, bibtex, ris, pendingReferences: selected.filter(r => !r.doi).map(r => r.id)};
  }
  const labels = Object.freeze({k: 'Studies', estimate: 'Pooled estimate', lower: 'Confidence interval lower bound',
    upper: 'Confidence interval upper bound', p: 'P value', i2: 'I-squared', tau2: 'Between-study variance'});
  const numeric = /^[<>≤≥]?\s*[+−-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+−-]?\d+)?%?$/;
  function displayedEntries(displayed) {
    if (!displayed || typeof displayed !== 'object' || Array.isArray(displayed)) throw new TypeError('Displayed values required');
    const entries = Object.entries(displayed);
    if (!entries.length) throw new TypeError('Displayed values required');
    for (const [key, value] of entries) {
      if (!own(labels, key) || !value || typeof value.text !== 'string' || !numeric.test(value.text) ||
          typeof value.source !== 'string' || !value.source.trim()) throw new TypeError('Invalid displayed value or missing provenance: ' + key);
    }
    return entries;
  }
  // Counts and numeric result tokens must be copied exactly, including rounding.
  // I-squared is spelt out so the symbol's subscript is not a result token.
  const tokens = text => String(text).match(/[+−-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+−-]?\d+)?%?/g) || [];
  function assertProvenance(text, displayed) {
    const allowed = new Set(displayedEntries(displayed).flatMap(([, v]) => tokens(v.text)));
    const invented = tokens(text).filter(n => !allowed.has(n));
    if (invented.length) throw new Error('Undisplayed number: ' + invented.join(', '));
    if (lint(text).length) throw new Error('Banned interpretation phrase');
    return true;
  }
  function interpret(spec, displayed) {
    validate(spec);
    const entries = displayedEntries(displayed);
    const lines = [DRAFT, ...entries.map(([key, v]) => labels[key] + ': ' + v.text + '.')];
    if (displayed.k) {
      const k = Number(displayed.k.text);
      if (!Number.isSafeInteger(k) || k < 2) throw new TypeError('Study count must be an integer of at least two');
      if (k < 10) lines.push('With few studies, heterogeneity estimates and interval coverage can be uncertain.');
    }
    if (displayed.i2) {
      const raw = displayed.i2.text;
      if (!/^\d+(?:\.\d+)?%?$/.test(raw)) throw new TypeError('I-squared must be a displayed percentage');
      const value = Number(raw.replace('%', ''));
      if (value > 100) throw new TypeError('I-squared outside percentage range');
      // Cochrane Handbook section 10.10.2 rough, deliberately overlapping bands.
      const bands = [[0, 40, 'might not be important'], [30, 60, 'may represent moderate heterogeneity'],
        [50, 90, 'may represent substantial heterogeneity'], [75, 100, 'may represent considerable heterogeneity']];
      lines.push('The displayed I-squared falls in overlapping Cochrane guide bands: ' +
        bands.filter(([lo, hi]) => value >= lo && value <= hi).map(([, , label]) => label).join('; ') +
        '. These rough bands depend on the direction and magnitude of effects and the strength of evidence; they are not diagnostic cut-offs.');
    }
    lines.push('Statistical results alone do not establish clinical importance or causality.');
    const text = lines.join('\n');
    assertProvenance(text, displayed);
    return {text, provenance: entries.map(([key, v]) => ({key, text: v.text, source: v.source}))};
  }
  const api = Object.freeze({methods, interpret, lint, assertProvenance});
  root.alm = root.alm || {};
  root.alm.reportText = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
