/* The same regression assertions run in a real page and the no-child-process VM harness. */
(function (global) {
  function check(ok, message) { if (!ok) throw new Error(message); }
  function spec() { return global.AlmComponentFeatures; }
  function render() {
    var s = spec().text, r = s.results(), ctx = { app: 'component-nma', entryLog: [], verify: null };
    var text = global.AlmText.render(s.templates, r, ctx);
    return { r: r, text: text, audit: global.AlmText.audit(text, r, { ctx: ctx, dom: s.dom() }) };
  }
  function load(src) { global.__almCnmaLoad(src); }
  var cases = {
    'CI PLANTED: every displayed endpoint has an independent DOM gate': function () {
      ['comp-body', 'int-body'].forEach(function (id) {
        Array.from(document.querySelectorAll('#' + id + ' tr')).forEach(function (row, i) {
          var cell = row.cells[row.cells.length - 1], original = cell.textContent;
          ['lo', 'hi'].forEach(function (side, j) {
            var bounds = original.slice(1, -1).split(',').map(Number);
            bounds[j] += .01;
            cell.textContent = '[' + bounds.map(function (x) { return x.toFixed(3); }).join(', ') + ']';
            var a = render().audit, key = 'dom:' + (id === 'comp-body' ? 'c' : 'i') + i + '_' + side;
            check(!a.ok && a.failures.some(function (f) { return f.check === key; }), 'Missing independent gate: ' + key);
            cell.textContent = original;
          });
        });
      });
      check(render().audit.ok, 'Restored display must pass');
    },
    'CI: genuine negative zero endpoint retains its sign': function () {
      load('a | control | -.1 | .051021\nb | control | .2 | .1');
      check(document.querySelectorAll('#comp-body tr')[0].cells[3].textContent.includes('-0.000'), 'Fixture must display a small negative endpoint');
      var out = render();
      check(out.r.c0_hi < 0 && out.r.c0_hi > -.0005, 'Endpoint must retain the unrounded negative value');
      check(out.audit.ok, JSON.stringify(out.audit.failures));
      check(out.text.results.text.includes('−0.000'), 'Prose must preserve the negative sign');
    },
    'PROVENANCE: conversion counts stay attached to their input across edits and share': function () {
      var records = [{ study: 'one', t1: 'a', t2: 'control', yi: -.3, sei: .1 }, { study: 'two', t1: 'b', t2: 'control', yi: .2, sei: .1 }];
      spec().entry.apply(records);
      global.AlmFeaturesState.entryLog = [{ method: 'SE from CI' }, { method: 'SE from CI' }];
      global.AlmFeaturesState.provenance = [{ label: 'Old report', confirmed: true }];
      check(spec().text.results().entryCI === 2, 'Current conversions must be retained');
      var saved = spec().share.get();
      load('a | control | -.7 | .2\nb | control | .5 | .1\na+b | control | -.1 | .2');
      var r = spec().text.results();
      check(r.entryCI === 0 && r.entryP === 0 && r.entryMidpoint === 0 && !r.hasProvenance, 'Stale conversion/provenance claims must be suppressed');
      check(spec().share.get().entryLog.length === 0, 'Share must not rebind stale conversions');
      spec().share.set(saved);
      check(spec().text.results().entryCI === 2, 'Share restore must bind the saved conversion log');
    },
    'FLAGS: sparse residual information, imprecision and zero variance are explained': function () {
      load('a | control | .01 | 1\nb | control | .02 | 1\nc | control | -.01 | 1\na+b | control | .03 | 1');
      var out = render(), notes = out.text.flags.map(function (f) { return f.text; }).join('\n');
      check(notes.includes('residual degrees of freedom') && notes.includes('imprecise'), 'Missing sparse residual-information caveat');
      check(notes.includes('both directions'), 'Missing per-component imprecision caveat');
      check(notes.includes('does not show') && notes.includes('homogeneous'), 'Missing zero-variance caveat');
      check(notes.includes('DerSimonian') && notes.includes('10'), 'Missing small-sample DL caveat');
      check(out.audit.ok, JSON.stringify(out.audit.failures));
      load('a | control | .01 | 1\nb | control | .02 | 1');
      notes = render().text.flags.map(function (f) { return f.text; }).join('\n');
      check(!notes.includes('does not show'), 'Unestimable variance must not be described as zero');
    },
    'STATE: reading verification and text never fits edited inputs': function () {
      var before = global._almLastCnma(), oldTable = document.querySelectorAll('#comp-body tr')[0].cells[1].textContent;
      document.getElementById('src').value = 'a | control | -.7 | .2\nb | control | .5 | .1';
      var error = '';
      try { spec().verify.adapter().currentState(); } catch (e) { error = e.message; }
      check(error.includes('press Fit first'), 'Stale verification must request an explicit Fit');
      check(global._almLastCnma() === before, 'currentState must not replace the fitted result');
      check(document.querySelectorAll('#comp-body tr')[0].cells[1].textContent === oldTable, 'currentState must not mutate the display');
      error = '';
      try { spec().text.results(); } catch (e) { error = e.message; }
      check(error.includes('press Fit first'), 'Text must explain unfitted input');
      document.getElementById('btn-run').click();
      var fitted = global._almLastCnma();
      spec().verify.adapter().currentState();
      check(global._almLastCnma() === fitted && render().audit.ok, 'Reading a fresh result must be side-effect free');
    },
    'VERIFY: reserved control component is refused explicitly and atomically': function () {
      var original = document.getElementById('src').value, result = global._almLastCnma(), error = '';
      var src = 'control+drug | control | -.3 | .1\ndrug | control | -.2 | .1\ncontrol+drug | drug | -.1 | .2';
      try { spec().share.set({ src: src }); } catch (e) { error = e.message; }
      check(/component.*control|control.*component/i.test(error), 'Feature input must explain reserved control component');
      check(document.getElementById('src').value === original && global._almLastCnma() === result, 'Rejected input must be atomic');
      load(src); error = '';
      try { spec().verify.adapter().currentState(); } catch (e) { error = e.message; }
      check(/component.*control|control.*component/i.test(error), 'Direct engine input must explain unsupported R translation');
    },
    'LABELS: numeric names identify the correct table and explain substitution': function () {
      load('drug 10 mg | control | -.3 | .1\nexercise 3x/week | control | -.2 | .1');
      var out = render(), prose = out.text.results.text;
      check(prose.includes('component table row 1') && prose.includes('intervention table row 1'), 'Ambiguous row references');
      check(out.text.flags.some(function (f) { return /labels.*digits/i.test(f.text); }), 'Missing label-substitution explanation');
      check(out.audit.ok, JSON.stringify(out.audit.failures));
    },
    'VERIFY: heterogeneous R oracle covers nonzero variance and every endpoint': function (ref) {
      load(ref.text);
      var adapter = spec().verify.adapter(), s = adapter.currentState(), values = adapter.appValues(s);
      check(s.result.tau2 > 0 && ref.tau2 > 0, 'Fixture must exercise random-effects weights');
      check(values.length === 23, 'Heterogeneous verification needs 23 quantities including endpoints, got ' + values.length);
      ['tau2', 'Q', 'df'].forEach(function (key) {
        check(Math.abs(s.result[key] - ref[key]) / Math.max(1, Math.abs(ref[key])) <= 1e-9, 'R oracle mismatch: ' + key);
      });
      ['components', 'combinations'].forEach(function (group) {
        Object.keys(ref[group]).sort().forEach(function (name, i) {
          var o = ref[group][name], expected = { est: o.est, se: o.se, lo: o.est - 1.959963984540054 * o.se, hi: o.est + 1.959963984540054 * o.se };
          Object.keys(expected).forEach(function (q) {
            var key = group + '_' + i + '_' + q, got = values.find(function (v) { return v.key === key; });
            check(got && Math.abs(got.value - expected[q]) / Math.max(1, Math.abs(expected[q])) <= 1e-9, 'R oracle mismatch: ' + key);
          });
        });
      });
    },
    'METHODS: optional sentences do not leave trailing whitespace': function () {
      var methods = render().text.methods.text;
      check(methods === methods.trim(), 'Default Methods has trailing whitespace');
      spec().entry.apply([{ study: 'one', t1: 'a', t2: 'control', yi: -.3, sei: .1 }, { study: 'two', t1: 'b', t2: 'control', yi: .2, sei: .1 }]);
      global.AlmFeaturesState.entryLog = [{ method: 'SE from CI' }, { method: 'SE from p' }, { method: 'CI midpoint' }];
      methods = render().text.methods.text;
      check(methods === methods.trim() && !methods.includes('  '), 'Optional Methods spacing must be clean');
    },
    'VERIFY: R checks all component and intervention confidence limits': function () {
      var adapter = spec().verify.adapter(), state = adapter.currentState(), values = adapter.appValues(state), script = adapter.buildScript(state);
      check(values.length === 39, 'Expected 39 quantities including all 18 confidence endpoints, got ' + values.length);
      ['lower.Comp', 'upper.Comp', 'lower.Comb', 'upper.Comb'].forEach(function (field) {
        check(script.includes('dc$' + field + '.random'), 'Missing independent R endpoint: ' + field);
      });
      values.forEach(function (v) { check(adapter.compare.kind[v.key] === 'rel', 'Endpoint tolerance must remain relative'); });
    }
  };
  global.AlmReviewCases = cases;
  if (typeof module !== 'undefined') module.exports = cases;
})(typeof window !== 'undefined' ? window : globalThis);
