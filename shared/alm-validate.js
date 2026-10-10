/* Allmeta validation widget. Network hosts: current origin only. Tier 2 reads
 * same-origin corpus files once, then replays from verified memory offline.
 * file:// users select the manifest-listed JSON files (browser fetch restrictions).
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
  async function verify(bytes, expected, path) {
    if (!/^[a-f0-9]{64}$/i.test(expected || '')) throw new Error('Missing or invalid SHA-256: ' + path);
    const actual = await digest(bytes);
    if (actual !== expected.toLowerCase()) throw new Error('SHA-256 mismatch; refused: ' + path);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  async function loadFiles(specs, selected) {
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
      files[spec.path] = await verify(bytes, spec.sha256, spec.path);
    }
    return files;
  }
  function compare(app, ref, kind, tol) {
    // null is a declared unavailable quantity; undefined/NaN never passes.
    const diff = app === null && ref === null ? 0 :
      typeof app === 'number' && typeof ref === 'number' && Number.isFinite(app) && Number.isFinite(ref) ?
        Math.abs(app - ref) / (kind === 'rel' ? Math.max(1, Math.abs(ref)) : 1) : Infinity;
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
  function mount(el, adapter) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) throw new Error('Validation mount missing');
    el.replaceChildren();
    el.style.cssText = 'margin:1rem 0;padding:1rem;border:1px solid var(--border,#bbb);border-radius:8px;background:var(--panel,#fff);color:var(--ink,#15181d)';
    node('h2', 'Independent validation', el);
    const controls = node('div', undefined, el);
    let live;
    if (adapter.live) {
      live = node('button', 'Validate this analysis in R', controls); live.type = 'button';
    } else {
      live = node('a', 'R check available via the reproducible repo', controls);
      live.href = adapter.paper.repoUrl; live.style.opacity = '0.75';
    }
    const corpusButton = node('button', 'Re-run full validation', controls); corpusButton.type = 'button';
    const status = node('p', 'Ready. Full validation replays the published reference corpus locally.', el);
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const details = node('div', undefined, el);
    const results = node('div', undefined, el); results.style.overflowX = 'auto';
    const links = node('p', undefined, el);
    for (const [label, url] of [['Full R re-execution (GitHub Actions)', adapter.paper.runUrl], ['Open Codespaces', adapter.paper.codespacesUrl], ['Reproducible repository', adapter.paper.repoUrl], ['Paper DOI', adapter.paper.doi && 'https://doi.org/' + adapter.paper.doi]]) {
      if (!url) continue;
      const a = node('a', label, links); a.href = url; links.append(' · ');
    }
    let selected, cached;
    if (location.protocol === 'file:') {
      const label = node('label', 'Select the corpus JSON files for offline validation: ', el);
      const input = node('input', undefined, label); input.type = 'file'; input.multiple = true; input.accept = '.json';
      input.onchange = () => { selected = [...input.files]; cached = null; };
    }
    function table(rows) {
      results.replaceChildren();
      const t = node('table', undefined, results); t.style.cssText = 'width:100%;text-align:left;border-collapse:collapse';
      const head = node('tr', undefined, node('thead', undefined, t));
      for (const h of ['Quantity', 'App', 'R', 'Difference', 'Tolerance', 'PASS/FAIL']) { const th = node('th', h, head); th.scope = 'col'; }
      const body = node('tbody', undefined, t);
      for (const r of rows) {
        const tr = node('tr', undefined, body);
        for (const v of [r.label || r.quantity || r.id, r.app, r.ref, r.diff, r.tol, r.pass ? 'PASS' : 'FAIL']) node('td', String(v), tr);
      }
    }
    async function busy(fn) {
      corpusButton.disabled = true; if (adapter.live) live.disabled = true;
      details.replaceChildren(); results.replaceChildren();
      try { return await fn(); } catch (e) { status.textContent = 'Validation refused: ' + e.message; throw e; }
      finally { corpusButton.disabled = false; if (adapter.live) live.disabled = false; }
    }
    async function prepare() {
      if (!cached) cached = await loadFiles(adapter.corpus.files, selected);
      return cached;
    }
    async function runCorpus() {
      return busy(async () => {
        const start = performance.now(); status.textContent = 'Verifying corpus SHA-256 hashes…';
        const files = await prepare();
        const result = await adapter.corpus.run(files, text => { status.textContent = text; });
        if (!Number.isInteger(result.checks) || result.passed + result.failed.length !== result.checks) throw new Error('Invalid check accounting from adapter');
        const countOK = result.checks === adapter.paper.checks;
        status.textContent = result.passed + '/' + result.checks + ' passed; ' + result.failed.length + ' failed. Paper: ' + adapter.paper.checks + ' checks.' + (countOK ? '' : ' FAIL: check count differs from paper.') + (result.displayFails && result.displayFails.length ? ' FAIL: rendered-number audit has failures.' : '');
        node('p', 'Allmeta build ' + (global.AlmBuildInfo ? global.AlmBuildInfo.sha : 'unavailable') + '; elapsed ' + ((performance.now() - start) / 1000).toFixed(2) + ' s', details);
        for (const f of adapter.corpus.files) node('p', 'SHA-256 verified: ' + f.path + ' ' + f.sha256, details);
        for (const line of result.summaryLines || []) node('p', line, details);
        node('pre', 'Maxima: ' + JSON.stringify(result.maxima) + '\nRefusals: ' + JSON.stringify(result.refusals), details);
        table(result.failed.length ? result.failed.map(f => ({ ...f, pass: false })) : [{ label: 'All numerical checks', app: result.passed, ref: adapter.paper.checks, diff: Math.abs(result.checks - adapter.paper.checks), tol: 0, pass: countOK }]);
        return result;
      });
    }
    async function runLive() {
      return busy(async () => {
        const a = adapter.live, state = a.currentState();
        await runner();
        const app = a.appValues(state), script = a.buildScript(state);
        if (!app.length) throw new Error('Adapter supplied no current-analysis quantities');
        const r = await (await runner()).runR({ script, packages: a.packages, onStatus: s => { status.textContent = s; } });
        if (!r.ok) throw new Error(r.error);
        const lines = r.stdout.split(/\r?\n/).filter(s => s.startsWith('ALMJSON:'));
        if (lines.length !== 1) throw new Error('R must emit exactly one ALMJSON record');
        const ref = JSON.parse(lines[0].slice(8));
        const rows = app.map(v => {
          const tol = a.compare.tolerance[v.key] ?? a.compare.tolerance.default;
          const kind = (a.compare.kind || {})[v.key] || 'abs';
          return { label: v.label, app: v.value, ref: ref[v.key], tol, ...compare(v.value, ref[v.key], kind, tol) };
        });
        for (const [pkg, version] of Object.entries(r.versions)) node('p', pkg + ' ' + version, details);
        for (const [pkg, version] of Object.entries(a.paperVersions || {})) if (r.versions[pkg] !== version) node('p', 'Validated version in the paper: ' + pkg + ' ' + version + '. Any differences beyond tolerance are reported as FAIL.', details);
        if (state.note) node('p', state.note, details);
        table(rows); status.textContent = rows.filter(r => r.pass).length + '/' + rows.length + ' live R quantities passed.';
        return { rows, versions: r.versions };
      });
    }
    corpusButton.onclick = () => runCorpus().catch(() => {});
    if (adapter.live) live.onclick = () => runLive().catch(() => {});
    return { prepare, runCorpus, runLive };
  }
  global.AlmValidate = { mount, digest, verify, loadFiles, compare };
})(typeof window !== 'undefined' ? window : globalThis);
