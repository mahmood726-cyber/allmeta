/* Allmeta validation widget. Network hosts: current origin only. Tier 2 reads
 * same-origin corpus files once, then replays from verified memory offline.
 * file:// users select the manifest-listed corpus files (browser fetch restrictions).
 * External github.com / codespaces.new / doi.org links require a user click.
 * Tier 1 lazily loads the local, pinned shared/webr-runner.js and webR 0.5.5.
 */
(function (global) {
  'use strict';
  const scriptURL = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;
  function localURL(path) {
    const url = new URL(path, document.baseURI);
    if (url.origin !== location.origin || !['http:', 'https:', 'file:'].includes(url.protocol)) throw new Error('Off-origin validation resource refused: ' + path);
    return url;
  }
  async function digest(bytes) {
    if (!global.crypto || !crypto.subtle) throw new Error('SHA-256 requires a secure context (HTTPS or localhost).');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function verify(bytes, expected, path, raw = false) {
    if (!/^[a-f0-9]{64}$/i.test(expected || '')) throw new Error('Missing or invalid SHA-256: ' + path);
    const actual = await digest(bytes);
    if (actual !== expected.toLowerCase()) throw new Error('SHA-256 mismatch; refused: ' + path);
    return raw ? bytes : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  // rawFiles preserves original bytes for adapters that independently recheck pins.
  async function loadFiles(specs, selected, raw) {
    const files = {};
    for (const spec of specs) {
      const url = localURL(spec.path);
      let bytes;
      if (selected) {
        const file = selected.find(f => f.name === spec.path.split('/').pop());
        if (!file) throw new Error('Select the corpus file: ' + spec.path);
        bytes = await file.arrayBuffer();
      } else {
        const response = await fetch(url, { redirect: 'error' });
        if (!response.ok) throw new Error('Cannot read ' + spec.path + ' (HTTP ' + response.status + ')');
        bytes = await response.arrayBuffer();
      }
      files[spec.path] = await verify(bytes, spec.sha256, spec.path, raw);
    }
    return files;
  }
  // Known comparison kinds; anything else fails closed with an explicit reason
  // rather than silently falling through to an absolute-difference test.
  const KINDS = ['abs', 'rel', 'exact'];
  function compare(app, ref, kind, tol) {
    if (!KINDS.includes(kind)) return { diff: Infinity, pass: false, reason: 'Unknown comparison kind: ' + String(kind) };
    if (kind === 'exact') {
      const pass = typeof app === typeof ref && ['string', 'boolean', 'number'].includes(typeof app) && app === ref && (typeof app !== 'number' || Number.isFinite(app));
      return { diff: pass ? 0 : Infinity, pass };
    }
    // null is a declared unavailable quantity; undefined/NaN never passes.
    const diff = app === null && ref === null ? 0 :
      typeof app === 'number' && typeof ref === 'number' && Number.isFinite(app) && Number.isFinite(ref) ?
        Math.abs(app - ref) / (kind === 'rel' ? Math.max(1, Math.abs(ref)) : 1) : Infinity;
    if (typeof tol !== 'number' || !Number.isFinite(tol) || tol < 0) return { diff, pass: false, reason: 'Invalid tolerance: ' + String(tol) };
    return { diff, pass: Number.isFinite(diff) && diff <= tol };
  }
  function node(tag, text, parent) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (parent) parent.append(el);
    return el;
  }
  let runnerPromise;
  function runner() {
    if (global.AlmWebR) return Promise.resolve(global.AlmWebR);
    if (!runnerPromise) runnerPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('webr-runner.js', scriptURL).href;
      s.onload = () => resolve(global.AlmWebR);
      s.onerror = () => { runnerPromise = null; reject(new Error('Local R runner unavailable')); };
      document.head.append(s);
    });
    return runnerPromise;
  }
  const mounts = new WeakMap();
  function mount(el, adapter) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) throw new Error('Validation mount missing');
    if (mounts.has(el)) mounts.get(el)();
    el.replaceChildren();
    el.style.cssText = 'margin:1rem 0;padding:1rem;border:1px solid var(--border,#bbb);border-radius:8px;background:var(--panel,#fff);color:var(--ink,#15181d)';
    node('h2', 'Validation checks', el);
    node('p', 'Current-analysis comparison runs reference software on your data. Corpus replay runs the shipped JavaScript on published benchmark inputs against stored reference values; it does not run R or Python or validate your current data.', el);
    const controls = node('div', undefined, el);
    const runtime = adapter.paper.referenceRuntime || 'R';
    let live;
    if (adapter.live) {
      live = node('button', 'Validate this analysis in R', controls); live.type = 'button';
      if (adapter.live.scope) node('p', 'Live R scope: ' + adapter.live.scope, controls);
    } else {
      node('p', 'Live ' + (adapter.paper.referenceRuntime || 'reference-software') + ' comparison is unavailable in this browser.', controls);
      live = node('a', runtime + ' reference and re-execution', controls);
      live.href = adapter.paper.repoUrl; live.style.opacity = '0.75';
    }
    const corpusButton = node('button', 'Replay published corpus (stored references)', controls); corpusButton.type = 'button';
    const status = node('p', 'Ready. Corpus replay uses stored references; no reference software is executed.', el);
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const details = node('div', undefined, el);
    const results = node('div', undefined, el); results.style.overflowX = 'auto';
    const links = node('p', undefined, el);
    for (const [label, url] of [[adapter.paper.runLabel || runtime + ' re-execution instructions / runs (GitHub Actions)', adapter.paper.runUrl], ['Open Codespaces', adapter.paper.codespacesUrl], ['Reproducible repository', adapter.paper.repoUrl], ['Paper DOI', adapter.paper.doi && 'https://doi.org/' + adapter.paper.doi]]) {
      if (!url) continue;
      const a = node('a', label, links); a.href = url; links.append(' · ');
    }
    let selected, cached;
    if (location.protocol === 'file:') {
      const label = node('label', 'Select the corpus files for offline validation: ', el);
      const input = node('input', undefined, label); input.type = 'file'; input.multiple = true; input.accept = adapter.corpus.fileAccept || '.json';
      input.onchange = () => { selected = [...input.files]; cached = null; };
    }
    function table(rows, referenceLabel = 'Live R') {
      results.replaceChildren();
      const t = node('table', undefined, results); t.style.cssText = 'width:100%;text-align:left;border-collapse:collapse';
      const head = node('tr', undefined, node('thead', undefined, t));
      for (const h of ['Quantity', 'App', referenceLabel, 'Difference', 'Tolerance', 'PASS/FAIL']) { const th = node('th', h, head); th.scope = 'col'; }
      const body = node('tbody', undefined, t);
      for (const r of rows) {
        const tr = node('tr', undefined, body);
        const label = r.label || [r.id, r.quantity].filter(Boolean).join(': ');
        for (const v of [label, r.app, r.ref, r.diff, r.tol, r.pass ? 'PASS' : 'FAIL' + (r.reason ? ' (' + r.reason + ')' : '')]) node('td', v && typeof v === 'object' ? JSON.stringify(v) : String(v), tr);
      }
    }
    // currentState may refit/render (and write URL state), so never poll it.
    // The immutable R payload below is paired with a revision of its input controls.
    // Non-DOM adapters may supply a side-effect-free live.revision() value too.
    let revision = 0, activeLive = null, completedLive = false, running = false;
    function fingerprint() {
      return JSON.stringify([
        [...document.querySelectorAll('input,select,textarea')].filter(n => !el.contains(n))
          .map(n => [n.id, n.value, n.checked, n.type === 'file' ? [...n.files].map(f => [f.name, f.size, f.lastModified]) : null]),
        adapter.live && adapter.live.revision ? adapter.live.revision() : null
      ]);
    }
    let lastInputs = fingerprint();
    function stale() {
      details.replaceChildren(); results.replaceChildren();
      status.textContent = activeLive
        ? 'Inputs changed while R was running \u2014 run the check again. Result out of date.'
        : 'Live R result out of date \u2014 run the check again.';
    }
    function changed(force = false) {
      const inputs = fingerprint();
      if (force || inputs !== lastInputs) {
        lastInputs = inputs; revision++;
        if (activeLive || completedLive) {
          if (activeLive) activeLive.stale = true;
          stale(); completedLive = false;
        }
      }
    }
    function onEdit(event) {
      if (!el.contains(event.target)) changed(true);
    }
    function onAction(event) {
      if (!el.contains(event.target) && event.target.closest('button,input[type=submit]')) changed(true);
    }
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    document.addEventListener('click', onAction, true);
    // File/project loaders may assign .value asynchronously without dispatching an event.
    const observer = new MutationObserver(() => changed());
    observer.observe(document.body, {childList:true, subtree:true});
    const timer = setInterval(() => changed(), 100);
    mounts.set(el, () => {
      if (activeLive) activeLive.stale = true;
      observer.disconnect(); clearInterval(timer);
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
      document.removeEventListener('click', onAction, true);
    });
    async function busy(fn) {
      if (running) throw new Error('Validation already running');
      running = true; completedLive = false;
      corpusButton.disabled = true; if (adapter.live) live.disabled = true;
      details.replaceChildren(); results.replaceChildren();
      try { return await fn(); } catch (e) { status.textContent = 'Validation refused: ' + e.message; throw e; }
      finally { running = false; corpusButton.disabled = false; if (adapter.live) live.disabled = false; }
    }
    async function prepare() {
      if (!cached) {
        if (location.protocol === 'file:' && adapter.corpus.loadFiles && !selected) {
          const files = await adapter.corpus.loadFiles();
          for (const f of adapter.corpus.files) await verify(new TextEncoder().encode(files[f.path]), f.sha256, f.path);
          cached = files;
        } else cached = await loadFiles(adapter.corpus.files, selected, adapter.corpus.rawFiles);
      }
      return cached;
    }
    async function runCorpus() {
      return busy(async () => {
        const start = performance.now(); status.textContent = 'Verifying corpus SHA-256 hashes…';
        const files = await prepare();
        const result = await adapter.corpus.run(files, (progress, total) => { status.textContent = typeof progress === 'object' ? progress.message : total ? progress + '/' + total : progress; });
        if (!result || !Array.isArray(result.failed)) throw new Error('Invalid corpus result from adapter');
        // One failed check may carry several diagnostic rows. Render them before
        // validating the accounting, so invalid accounting never hides evidence.
        table(result.failed.map(f => ({ ...f, pass: false })), 'Stored reference');
        const failedChecks = result.failedChecks ?? result.failed.length;
        if (!Number.isInteger(result.checks) || result.checks < 0 || !Number.isInteger(result.passed) || result.passed < 0 ||
          !Number.isInteger(failedChecks) || failedChecks < 0 || result.passed + failedChecks !== result.checks ||
          failedChecks > result.failed.length || (failedChecks === 0 && result.failed.length > 0)) throw new Error('Invalid check accounting from adapter');
        const coverageFails = result.coverageFails || [];
        if (!Array.isArray(coverageFails)) throw new Error('Invalid coverage accounting from adapter');
        const expected = adapter.corpus.mode === 'quick' ? adapter.corpus.quickChecks : adapter.paper.checks;
        const countOK = result.checks === expected;
        status.textContent = result.passed + '/' + result.checks + ' passed; ' + failedChecks + ' failed checks. Paper: ' + adapter.paper.checks + ' checks.' + (adapter.corpus.mode === 'quick' ? ' Quick subset: ' + expected + ' checks; not full paper reproduction.' : '') + (countOK ? '' : ' FAIL: check count differs from selected scope.') + (coverageFails.length ? ' FAIL: corpus coverage differs from the published contract.' : '') + (result.displayFails && result.displayFails.length ? ' FAIL: rendered-number audit has failures.' : '') + ' JavaScript replay against stored references; ' + runtime + ' not executed.';
        node('p', 'Allmeta build stamp ' + (global.AlmBuildInfo ? global.AlmBuildInfo.sha : 'unavailable') + ' (generated metadata); elapsed ' + ((performance.now() - start) / 1000).toFixed(2) + ' s', details);
        if (adapter.paper.referenceLabel) node('p', 'Stored reference: ' + adapter.paper.referenceLabel, details);
        for (const f of adapter.corpus.files) node('p', 'SHA-256 verified: ' + f.path + ' ' + f.sha256, details);
        for (const line of result.summaryLines || []) node('p', line, details);
        node('pre', 'Maxima: ' + JSON.stringify(result.maxima) + '\nRefusals: ' + JSON.stringify(result.refusals), details);
        const rows = [...result.failed, ...coverageFails].map(f => ({ ...f, pass: false }));
        if (!countOK) rows.push({ label: 'Selected corpus scope: check count', app: result.checks, ref: expected, diff: Math.abs(result.checks - expected), tol: 0, pass: false });
        if (result.displayFails && result.displayFails.length) rows.push(...result.displayFails.map(f => ({ label: 'Rendered-number audit', app: f, ref: 'Within display rounding tolerance', diff: null, tol: null, pass: false })));
        table(rows.length ? rows : [{ label: 'Published corpus checks', app: result.passed, ref: expected, diff: 0, tol: 0, pass: true }], 'Stored reference');
        return result;
      });
    }
    async function runLive() {
      return busy(async () => {
        const a = adapter.live;
        if (!a) throw new Error('Live R validation unavailable for this adapter');
        const state = structuredClone(a.currentState());
        const app = a.appValues(state), comparison = structuredClone(a.compare);
        changed();
        const check = activeLive = {revision, stale:false};
        status.textContent = 'Preparing current-analysis R check...';
        try {
          await runner();
          const script = a.buildScript(state);
          if (!app.length) throw new Error('Adapter supplied no current-analysis quantities');
          const r = await (await runner()).runR({ script, packages: a.packages, onStatus: s => { changed(); if (!check.stale) status.textContent = s; } });
          changed();
          if (check.stale || revision !== check.revision) { stale(); return {stale:true, rows:[]}; }
          if (!r.ok) throw new Error(r.error);
          const lines = r.stdout.split(/\r?\n/).filter(s => s.startsWith('ALMJSON:'));
          if (lines.length !== 1) throw new Error('R must emit exactly one ALMJSON record');
          const ref = JSON.parse(lines[0].slice(8));
          const rows = app.map(v => {
            const tol = comparison.tolerance[v.key] ?? comparison.tolerance.default;
            const kind = (comparison.kind || {})[v.key] || 'abs';
            return { label: v.label, app: v.value, ref: ref[v.key], tol, ...compare(v.value, ref[v.key], kind, tol) };
          });
          for (const [pkg, version] of Object.entries(r.versions)) node('p', pkg === 'R' && /^R version /.test(version) ? version : pkg + ' ' + version, details); // R.version.string already starts "R version
          for (const [pkg, version] of Object.entries(a.paperVersions || a.validatedVersions || adapter.paper.packageVersions || {})) if (r.versions[pkg] !== version) node('p', 'Validated version in the paper: ' + pkg + ' ' + version + '. Any differences beyond tolerance are reported as FAIL.', details);
          if (state.note) node('p', state.note, details);
          table(rows); status.textContent = rows.filter(r => r.pass).length + '/' + rows.length + ' live R quantities passed.' + (rows.some(r => !r.pass) ? ' FAIL: discrepancies exceed tolerance or quantities are unavailable.' : '');
          completedLive = true;
          return { rows, versions: r.versions };
        } catch (error) {
          changed();
          if (check.stale) { stale(); return {stale:true, rows:[]}; }
          throw error;
        } finally { activeLive = null; }
      });
    }
    corpusButton.onclick = () => runCorpus().catch(() => {});
    if (adapter.live) live.onclick = () => runLive().catch(() => {});
    return { prepare, runCorpus, runLive };
  }
  global.AlmValidate = { mount, digest, verify, loadFiles, compare };
})(typeof window !== 'undefined' ? window : globalThis);
