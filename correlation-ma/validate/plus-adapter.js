/* P17 plus: in-page replay of the pinned extras evidence through the real plus panel.
 * For every plus-corpus input the page's own textarea and estimator selector are set, the
 * CI-method radio is chosen, and the rendered panel (window._almCorrPlus() + #alm-plus DOM) is
 * compared with the independent metafor 5.2-1 reference (plus-corpus/reference-plus.json) and with
 * the R results of running the page's exported R scripts (plus-corpus/rscript-results.json).
 * Both files are SHA-256 pinned in plus-pins.js; a mismatch refuses the replay.
 * No estimator implementation lives here. JavaScript replay against stored references; R is not executed.
 */
(function () {
'use strict';
const PINS = window.AlmCorrPlusPins;
const $ = id => document.getElementById(id);
const METHODS = ['REML', 'PM', 'DL', 'FE'], TESTS = ['z', 'knha', 'adhoc'];
const REF_PATH = 'validate/plus-corpus/reference-plus.json', RS_PATH = 'validate/plus-corpus/rscript-results.json';
const fmt = (x, d = 3) => (typeof x === 'number' && isFinite(x) ? x.toFixed(d) : '—');
const tick = () => new Promise(res => setTimeout(res, 0));
const textOf = studies => studies.map(s => s.label + ', ' + s.r + ', ' + s.n).join('\n');
const scriptName = (id, m, t) => (id + '__' + m + '__' + t).replace(/[^A-Za-z0-9._-]+/g, '_') + '.R';

async function replay(files, progress) {
  const REF = files[REF_PATH], RS = files[RS_PATH];
  if (!REF || !Array.isArray(REF.inputs) || !Array.isArray(RS)) throw Error('Invalid extras corpus');
  const rsByFile = new Map(RS.map(x => [x.file, x]));
  let checks = 0; const failed = [], byKind = {}, maxima = {};
  const bump = k => { byKind[k] = (byKind[k] || 0) + 1; };
  function fail(id, quantity, app, ref, diff, tol, reason) { failed.push({ id, quantity, app, ref, diff, tol, reason }); }
  function near(id, quantity, app, ref, kind) {
    checks++; bump(kind || 'num');
    if (ref === null || ref === undefined) { if (app !== null && app !== undefined) fail(id, quantity, app, null, null, 0, 'reference is null'); return; }
    const tol = kind === 'tau2' ? 1e-6 : 1e-9;
    const diff = typeof app === 'number' ? (kind === 'I2' ? Math.abs(app - ref) / 100 : Math.abs(app - ref) / Math.max(1, Math.abs(ref))) : NaN;
    const k = kind || 'num'; if (isFinite(diff) && !(diff <= (maxima[k] || 0))) maxima[k] = diff;
    if (!(typeof app === 'number' && isFinite(app) && diff <= tol)) fail(id, quantity, app, ref, diff, tol);
  }
  function exact(id, quantity, app, ref) { checks++; bump('exact'); if (app !== ref) fail(id, quantity, app, ref, null, 0); }

  // Save the user's state; replay never edits the user's analysis permanently.
  const saved = { data: $('f-data').value, method: $('f-method').value, ui: window.AlmCorrPlusUI.snapshot() };
  const setInput = async (text, method) => {
    const m = $('f-method'); m.value = method; m.dispatchEvent(new Event('change', { bubbles: true }));
    const ta = $('f-data'); ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
  };
  const choose = async (name, value) => {
    const r = document.querySelector("input[name='" + name + "'][value='" + value + "']");
    if (!r) throw Error('Missing control ' + name + '=' + value);
    r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); await tick();
  };
  let configs = 0, looConfigs = 0, looRefusals = 0, rsCompared = 0;
  try {
    for (let n = 0; n < REF.inputs.length; n++) {
      const inp = REF.inputs[n];
      if (progress) progress({ message: 'Extras replay: input ' + (n + 1) + '/' + REF.inputs.length + ' (' + inp.id + ')' });
      for (const method of METHODS) for (const test of TESTS) {
        const id = inp.id + '::' + method + '::' + test; configs++;
        await setInput(textOf(inp.studies), method);
        await choose('alm-plus-test', test);
        const last = window._almLastCorrMA(), plus = window._almCorrPlus();
        exact(id, 'page accepted k', last && last.k, inp.k);
        exact(id, 'plus schema', plus && plus._schema, 'corr-ma-plus-v1');
        exact(id, 'plus k', plus && plus.k, inp.k);
        exact(id, 'current selection', plus && plus.current.method + '/' + plus.current.test, method + '/' + test);
        const trs = [...document.querySelectorAll('#alm-plus-sens tbody tr')];
        exact(id, 'sensitivity rows', trs.length, 12);
        exact(id, 'current row marked', trs.filter(tr => tr.getAttribute('aria-current') === 'true').map(tr => tr.querySelector('th').textContent).join(), method);
        plus.cells.forEach((c, i) => {
          const R = inp.sensitivity.find(x => x.method === c.method && x.test === c.test), cid = id + ' cell ' + c.method + '/' + c.test;
          const tds = trs[i] ? [...trs[i].querySelectorAll('td')].map(t => t.textContent) : [];
          exact(cid, 'applicable', c.applicable, R.app_applicable);
          if (!c.applicable) { exact(cid, 'not-applicable text', tds[1], 'not applicable'); return; }
          const tk = (c.method === 'REML' || c.method === 'PM') ? 'tau2' : 'num';
          near(cid, 'mu_z', c.mu_z, R.mu_z); near(cid, 'se_z', c.se_z, R.se_z);
          near(cid, 'tau2_z', c.tau2_z, R.tau2_z, tk); near(cid, 'tau_z', c.tau_z, R.tau_z, tk);
          near(cid, 'I2', c.I2, R.I2, 'I2'); near(cid, 'Q', c.Q, R.Q); exact(cid, 'df', c.df, R.df);
          near(cid, 'ciLo', c.ciLo, R.ciLo); near(cid, 'ciHi', c.ciHi, R.ciHi);
          near(cid, 'r', c.r, R.r); near(cid, 'r_lo', c.r_lo, R.r_lo); near(cid, 'r_hi', c.r_hi, R.r_hi);
          near(cid, 'piLo (t_{k-1})', c.piLo, R.piLo); near(cid, 'piHi (t_{k-1})', c.piHi, R.piHi);
          near(cid, 'r_pi_lo', c.r_pi_lo, R.r_pi_lo); near(cid, 'r_pi_hi', c.r_pi_hi, R.r_pi_hi);
          // Display strings are bound to the panel's own full-precision numbers at the shown precision.
          exact(cid, 'shown pooled r [CI]', tds[1], fmt(c.r) + ' [' + fmt(c.r_lo) + ', ' + fmt(c.r_hi) + ']');
          exact(cid, 'shown PI', tds[2], c.r_pi_lo != null ? '[' + fmt(c.r_pi_lo) + ', ' + fmt(c.r_pi_hi) + ']' : '—');
          exact(cid, 'shown tau2', tds[3], c.method === 'FE' ? '0 (fixed)' : fmt(c.tau2_z, 4));
          exact(cid, 'shown I2', tds[5], c.I2 != null ? fmt(c.I2, 1) + '%' : '—');
          exact(cid, 'shown Q (df)', tds[6], fmt(c.Q, 2) + ' (' + c.df + ')');
          exact(cid, 'narrower-than-Wald note', /narrower than Wald/.test(tds[7] || ''), !!c.narrower_than_wald);
        });
        // Exported R script: the page's displayed numbers equal what that script printed in R.
        const cur = plus.cells.find(c => c.method === method && c.test === test);
        const rs = rsByFile.get(scriptName(inp.id, method, test));
        if (cur.applicable) {
          checks++; bump('exact');
          if (!rs || rs.error || rs.n_almjson !== 1 || !rs.almjson) fail(id, 'R script result present (one ALMJSON line)', !!rs, true, null, 0);
          else {
            rsCompared++;
            const J = rs.almjson, tk = (method === 'REML' || method === 'PM') ? 'tau2' : 'num';
            exact(id, 'R script k', J.k, inp.k);
            near(id, 'R script mu_z', cur.mu_z, J.mu_z); near(id, 'R script se_z', cur.se_z, J.se_z); near(id, 'R script tau2_z', cur.tau2_z, J.tau2_z, tk);
            near(id, 'R script Q', cur.Q, J.Q); near(id, 'R script I2', cur.I2, J.I2, 'I2');
            near(id, 'R script ciLo', cur.ciLo, J.ciLo); near(id, 'R script ciHi', cur.ciHi, J.ciHi);
            near(id, 'R script piLo', cur.piLo, J.piLo); near(id, 'R script piHi', cur.piHi, J.piHi);
          }
          const sum = $('alm-plus-summary'), res = $('alm-plus-results');
          exact(id, 'plain-language summary bound to shown r and CI', !!sum && sum.textContent.includes('r = ' + fmt(cur.r) + ' (95% CI ' + fmt(cur.r_lo) + ' to ' + fmt(cur.r_hi) + ')'), true);
          exact(id, 'Results text bound to shown r', !!res && res.textContent.includes('pooled r = ' + fmt(cur.r)), true);
        } else {
          exact(id, 'no R script result for a non-applicable cell', rs, undefined);
          exact(id, 'no prose for a non-applicable cell', $('alm-plus-summary'), null);
        }
        // Leave-one-out through the button, every configuration.
        $('alm-plus-loo-btn').click(); await tick();
        const L = plus.loo, refusalShown = !!document.querySelector('#alm-plus-loo .plus-refusal');
        const R = inp.loo.find(x => x.method === method && x.test === test);
        if (inp.loo_refusal || (method === 'FE' && test !== 'z')) {
          looRefusals++;
          exact(id, 'LOO refusal shown', refusalShown, true); exact(id, 'LOO refused', !!(L && L.refused), true);
          exact(id, 'LOO refusal message', document.querySelector('#alm-plus-loo .plus-refusal') && document.querySelector('#alm-plus-loo .plus-refusal').textContent, L && L.reason);
          continue;
        }
        looConfigs++;
        exact(id, 'LOO not refused', refusalShown || !L || L.refused, false);
        if (!L || L.refused || !R) continue;
        const rows = [...document.querySelectorAll('#alm-plus-loo tbody tr')];
        exact(id, 'LOO rows', rows.length, inp.k); exact(id, 'LOO app rows', L.rows.length, inp.k);
        const tk = (method === 'REML' || method === 'PM') ? 'tau2' : 'num';
        L.rows.forEach((row, i) => {
          const rid = id + ' omit ' + (i + 1);
          near(rid, 'LOO mu_z', row.mu_z, R.mu_z[i]); near(rid, 'LOO se_z', row.se_z, R.se_z[i]); near(rid, 'LOO tau2_z', row.tau2_z, R.tau2_z[i], tk);
          if (method !== 'FE') near(rid, 'LOO I2', row.I2, R.I2[i], 'I2'); else exact(rid, 'FE LOO I2 withheld', row.I2, null);
          near(rid, 'LOO Q', row.Q, R.Q[i]); near(rid, 'LOO ciLo', row.ciLo, R.ciLo[i]); near(rid, 'LOO ciHi', row.ciHi, R.ciHi[i]);
          near(rid, 'LOO piLo (t_{k-2})', row.piLo, R.piLo[i]); near(rid, 'LOO piHi (t_{k-2})', row.piHi, R.piHi[i]);
          near(rid, 'LOO r', row.r, R.r[i]); near(rid, 'LOO delta_r', row.delta_r, R.delta_r[i]);
          exact(rid, 'LOO flag: omission changes whether CI excludes 0', row.changes_ci_excludes_0, R.changes_ci_excludes_0[i]);
          const tds = rows[i] ? [...rows[i].querySelectorAll('td')].map(t => t.textContent) : [];
          exact(rid, 'LOO shown r [CI]', tds[0], fmt(row.r) + ' [' + fmt(row.r_lo) + ', ' + fmt(row.r_hi) + ']');
          exact(rid, 'LOO shown delta r', tds[4], fmt(row.delta_r));
          exact(rid, 'LOO row highlighted iff flagged', rows[i] && rows[i].classList.contains('plus-flag'), !!R.changes_ci_excludes_0[i]);
        });
        exact(id, 'LOO largest |delta r| study', L.largest_abs_delta_index, R.largest_abs_delta_index);
        exact(id, 'LOO forest svg role', document.querySelector('#alm-plus-loo svg') && document.querySelector('#alm-plus-loo svg').getAttribute('role'), 'img');
        if (rs && rs.almjson && Array.isArray(rs.almjson.loo_mu_z)) {
          L.rows.forEach((row, i) => { near(id + ' omit ' + (i + 1), 'R script LOO mu_z', row.mu_z, rs.almjson.loo_mu_z[i]); near(id + ' omit ' + (i + 1), 'R script LOO ciLo', row.ciLo, rs.almjson.loo_ciLo[i]); near(id + ' omit ' + (i + 1), 'R script LOO ciHi', row.ciHi, rs.almjson.loo_ciHi[i]); });
        }
      }
    }
  } finally {
    await setInput(saved.data, saved.method);
    window.AlmCorrPlusUI.restore(saved.ui); await tick();
  }
  if (PINS.checks && checks !== PINS.checks) throw Error('Extras check cardinality mismatch: ' + checks);
  return { checks, passed: checks - failed.length, failed, failedChecks: failed.length, maxima, refusals: [],
    summaryLines: [configs + ' extras configurations (' + REF.inputs.length + ' inputs x 4 estimators x 3 CI methods); leave-one-out compared in ' + looConfigs + ', refused as specified in ' + looRefusals + '; ' + rsCompared + ' exported R-script results compared.',
      'Checks by kind: ' + JSON.stringify(byKind) + '.',
      'Tolerances as the paper: tau² relative 1e-6 for PM/REML; other numbers 1e-9 relative to max(1, |R|); I² on the fraction scale; text, flags, counts and refusals exact.',
      'PI = mu ± t(0.975, k − 1)·√(τ² + SE²) (leave-one-out: k − 2), formed explicitly in R; a convention, not metafor predict()’s normal quantile on a Wald fit.'] };
}

const adapter = { app: 'correlation-ma-plus',
  paper: { checks: PINS.checks, repoUrl: 'https://github.com/mahmood726-cyber/allmeta', runLabel: 'Extras scope and R reproduction', runUrl: 'validate/README-plus.md', packageVersions: { metafor: '5.2-1' } },
  corpus: { files: PINS.files, mode: 'quick', quickChecks: PINS.checks, run: replay } };
window.AlmCorrPlusAdapter = adapter;
function mount() {
  const sec = $('alm-plus'); if (!sec || !window.AlmCorrPlusUI) return;
  const host = document.createElement('div'); host.id = 'alm-plus-validate'; sec.append(host);
  window.AlmCorrPlusValidation = AlmValidate.mount(host, adapter);
  for (const h of host.querySelectorAll('h2')) if (h.textContent === 'Validation checks') { const h3 = document.createElement('h3'); h3.textContent = 'Validation checks for these extras'; h.replaceWith(h3); }
  for (const b of host.querySelectorAll('button')) if (b.textContent === 'Replay published corpus (stored references)') b.textContent = 'Replay extras corpus (stored references)';
  // The widget dims its repository link when no live R check is offered; at 0.75 opacity it fails WCAG 1.4.3 contrast here.
  for (const a of host.querySelectorAll('a')) a.style.opacity = '';
  const p = document.createElement('p'); p.textContent = 'Declared extras replay: ' + PINS.configurations + ' configurations / ' + PINS.checks + ' checks. ' + PINS.rule; host.append(p);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
