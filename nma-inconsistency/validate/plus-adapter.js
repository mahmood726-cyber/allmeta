/* Plus-panel replay: leave-one-study-out inconsistency and FE/DL/PM comparison.
 * Executes the shipped parser, engine and plus core on the pinned corpus and
 * compares with native-R references (R 4.6.0, netmeta 3.7-0, metafor 5.2-1).
 * R values enter only through the same pure summary functions the panel uses
 * (normalizeFit/summarizeDrop/looFinish/compareFits), so every derived count,
 * flip and sentence is checked against its R-derived counterpart.
 */
(function () {
  'use strict';
  const P = window.AlmIncoPlusCore, manifest = window.AlmIncoPlusManifest;
  if (!P || !manifest) return;
  const E = { inputIssue: window.inputIssue, estimateTau2: window.estimateTau2, fitNMA: window.fitNMA, nodeSplit: window.nodeSplit, dbt: window.dbt };
  const quote = v => '"' + String(v).replace(/"/g, '""') + '"';
  const textOf = rows => rows.map(r => [r.A, r.B, r.te, r.se, r.study].map(quote).join(',')).join('\n');

  async function verified(loaded) {
    const out = [];
    for (const f of manifest.files) {
      const raw = loaded[f.path];
      if (!(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) throw Error('Original pinned bytes required: ' + f.path);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map(n => n.toString(16).padStart(2, '0')).join('');
      if (hash !== f.sha256) throw Error('SHA-256 mismatch; refused: ' + f.path);
      out.push(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)));
    }
    return out;
  }
  function leaves(x, prefix, out) {
    out = out || [];
    if (x === null || typeof x !== 'object') out.push([prefix, x]);
    else if (Array.isArray(x) && !x.length) out.push([prefix, '[]']);
    else for (const [k, v] of Object.entries(x)) leaves(v, prefix ? prefix + '.' + k : k, out);
    return out;
  }
  const COUNT = /(^|\.)(df|k|kDirect|index|nSplits|nInconsistent|nDisagree)$/;
  const PVAL = /(^|\.)p$|(^|\.)splitP\.[^.]+$|(^|\.)p\.(FE|DL|PM)$/;
  // R reference -> the same canonical summaries the panel shows.
  function refLoo(c, x) {
    const base = P.normalizeFit(x.full);
    const drops = x.drops.map((d, i) => P.summarizeDrop(base, P.normalizeFit(d.fit), d.drop, i));
    return P.looFinish({ model: c.model, rows: c.rows, base, n: drops.length }, drops);
  }
  let running = false;
  async function replay(loaded, progress) {
    if (running) throw Error('Replay already running');
    running = true;
    try {
      const [corpus, reference, estimators, v1corpus, v1reference] = await verified(loaded);
      if (!Array.isArray(corpus) || corpus.length !== manifest.configurations || !reference || !Array.isArray(reference.cases) || reference.cases.length !== corpus.length ||
          !corpus.every((c, i) => c.key === reference.cases[i].key && reference.cases[i].drops.length === c.rows.length) ||
          !Array.isArray(estimators) || estimators.length !== manifest.estimator_triples ||
          !Array.isArray(v1corpus) || !v1reference || !Array.isArray(v1reference.cases) || v1reference.cases.length !== v1corpus.length) throw Error('Plus evidence cardinality or keys differ');
      let checks = 0, passed = 0; const failed = [], maxima = {}, boundary = [], groups = { loo: 0, estimators: 0, text: 0, graph: 0 };
      function check(id, quantity, app, ref, kind, tol, group) {
        let diff;
        if (kind === 'exact') diff = JSON.stringify(app) === JSON.stringify(ref) ? 0 : Infinity;
        else diff = app === null && ref === null ? 0 : typeof app === 'number' && typeof ref === 'number' && Number.isFinite(app) && Number.isFinite(ref) ?
          Math.abs(app - ref) / (kind === 'rel' ? Math.max(1, Math.abs(ref)) : 1) : Infinity;
        const pass = diff <= tol; checks++; groups[group]++;
        if (pass) passed++; else if (failed.length < 1000) failed.push({ id, quantity, app, ref, diff, tol });
        const g = quantity.replace(/\.\d+(?=\.|$)/g, '.#').replace(/splitP\.[^.]+/, 'splitP.#');
        maxima[g] = Math.max(maxima[g] || 0, diff);
      }
      function compareTree(id, app, ref, model, group) {
        const a = new Map(leaves(app, '')), r = leaves(ref, '');
        check(id, 'membership', [...a.keys()].sort(), r.map(x => x[0]).sort(), 'exact', 0, group);
        for (const [k, v] of r) {
          if (typeof v !== 'number' || COUNT.test(k)) check(id, k, a.get(k), v, 'exact', 0, group);
          else if (PVAL.test(k)) { check(id, k, a.get(k), v, 'abs', 1e-9, group); if (Math.abs(v - P.ALPHA) < 1e-6) boundary.push(id + ' ' + k + ' = ' + v); }
          else check(id, k, a.get(k), v, 'rel', model === 'PM' || /(^|\.)(PM)(\.|$)/.test(k) ? 1e-6 : 1e-9, group);
        }
      }
      const tick = () => new Promise(r => setTimeout(r, 0));
      for (let i = 0; i < corpus.length; i++) {
        const c = corpus[i], x = reference.cases[i], text = textOf(c.rows), rows = window.parse(text);
        check(c.key, 'parsed_rows', rows, c.rows, 'exact', 0, 'loo');
        const app = P.loo(E, rows, c.model), ref = refLoo(c, x);
        compareTree(c.key, app, ref, c.model, 'loo');
        // Network graph: every edge's study count against R kDirect and its colour class against R p.
        const edges = new Map(P.graphEdges(app.base, rows).map(e => [e.comparison, e]));
        check(c.key, 'graph.splitEdges', P.graphEdges(app.base, rows).filter(e => e.p !== null).map(e => e.comparison), ref.base.nodeSplit.map(s => s.comparison), 'exact', 0, 'graph');
        for (const s of ref.base.nodeSplit) {
          const e = edges.get(s.comparison) || {};
          check(c.key, 'graph.k.' + s.comparison, e.k, s.kDirect, 'exact', 0, 'graph');
          check(c.key, 'graph.flag.' + s.comparison, P.sig(e.p), P.sig(s.p), 'exact', 0, 'graph');
        }
        check(c.key, 'text.looSummary', P.looSummary(app), P.looSummary(ref), 'exact', 0, 'text');
        check(c.key, 'text.interpret', P.interpret({ loo: app }), P.interpret({ loo: ref }), 'exact', 0, 'text');
        check(c.key, 'text.methods', P.methodsText({ loo: app }), P.methodsText({ loo: ref }), 'exact', 0, 'text');
        if (progress) progress(i + 1, corpus.length + estimators.length);
        await tick();
      }
      for (let i = 0; i < estimators.length; i++) {
        const t = estimators[i], rows = window.parse(textOf(t.rows));
        check(t.key, 'parsed_rows', rows, t.rows, 'exact', 0, 'estimators');
        const app = P.compare3(E, rows), ref = P.compareFits(Object.fromEntries(P.MODELS.map(m => [m, P.normalizeFit(Object.assign({ status: 'ok', model: m, k: t.rows.length }, t.models[m]))])));
        compareTree(t.key, app, ref, null, 'estimators');
        check(t.key, 'text.compareSummary', P.compareSummary(app), P.compareSummary(ref), 'exact', 0, 'text');
        for (const m of P.MODELS) check(t.key, 'text.methods.' + m, P.methodsText({ base: app.fits[m], compare: app }), P.methodsText({ base: ref.fits[m], compare: ref }), 'exact', 0, 'text');
        if (progress) progress(corpus.length + i + 1, corpus.length + estimators.length);
        if (i % 10 === 9) await tick();
      }
      // Sentences for every accepted configuration of the 122-configuration base replay, from app vs R values.
      for (let i = 0; i < v1corpus.length; i++) {
        const r = v1reference.cases[i].numeric;
        if (!r || r.status !== 'ok' || v1corpus[i].key !== v1reference.cases[i].key) continue;
        const app = P.fitAll(E, window.parse(v1corpus[i].text), v1corpus[i].model), ref = P.normalizeFit(r);
        check(v1corpus[i].key, 'text.base.interpret', P.interpret({ base: app }), P.interpret({ base: ref }), 'exact', 0, 'text');
        check(v1corpus[i].key, 'text.base.methods', P.methodsText({ base: app }), P.methodsText({ base: ref }), 'exact', 0, 'text');
      }
      if (manifest.checks && checks !== manifest.checks) throw Error('Plus replay check cardinality mismatch: ' + checks);
      return { checks, passed, failed, maxima, groups, boundary,
        summaryLines: [manifest.rule, `${corpus.length} configurations / ${manifest.drop_fits} leave-one-out refits and ${estimators.length} FE/DL/PM triples against native R; ${groups.loo} LOO, ${groups.estimators} estimator, ${groups.graph} graph and ${groups.text} sentence checks.` + (boundary.length ? ` ${boundary.length} R p-values lie within 1e-6 of 0.05.` : '')] };
    } finally { running = false; }
  }
  const adapter = {
    app: 'nma-inconsistency-plus',
    paper: { checks: manifest.checks, repoUrl: 'https://github.com/mahmood726-cyber/allmeta', runLabel: 'Plus scope and R reproduction', runUrl: 'validate/README-plus.md', packageVersions: { netmeta: '3.7-0', metafor: '5.2-1' } },
    corpus: { files: manifest.files, rawFiles: true, mode: 'quick', quickChecks: manifest.checks, run: replay },
    refLoo, leaves, textOf, manifest,
  };
  window.AlmIncoPlusAdapter = adapter;
  const mount = document.getElementById('alm-plus-validate');
  if (mount && window.AlmValidate && typeof AlmValidate.mount === 'function') {
    window.AlmIncoPlusValidation = AlmValidate.mount(mount, adapter);
    for (const b of mount.querySelectorAll('button')) if (b.textContent === 'Replay published corpus (stored references)') b.textContent = 'Re-run plus-panel validation (stored R references)';
  }
})();
