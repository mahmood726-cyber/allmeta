/* multivariate-ma plus: browser validation panel (#alm-plus-validate) and the displayed-string audit
 * shared with the Node replay. Corpus/reference bytes are SHA-256 pinned (plus-pins.js). */
(function () {
  'use strict';
  var F = window.AlmMvPlus.fmt;
  function cellText(key) { var n = document.querySelector('#alm-plus [data-q="' + key + '"]'); return n ? n.textContent : null; }
  // Render the app's own result into the panel and read back every displayed number.
  function display(c, r, parsed, res, sw) {
    var out = [];
    window.AlmMvPlusUI.renderFor(parsed, res, sw);
    function push(key, expected) { out.push({ key: key, shown: cellText(key), expected: expected }); }
    if (r.supplied.status === 'ok') {
      var ok = res.status === 'ok', f = res.fit;
      for (var j = 0; j < 2; j++) {
        push('mv.' + j + '.ci', ok ? F.ci(f.mu[j], f.muSE[j]) : '(app result missing)');
        push('mv.' + j + '.se', ok ? F.f4(f.muSE[j]) : '(app result missing)');
        var t = ok ? window.AlmMultivariate.zTest(f.mu[j], f.muSE[j]) : null;
        push('mv.' + j + '.z', ok ? F.z(t.z) : '(app result missing)');
        push('mv.' + j + '.p', ok ? F.p(t.p) : '(app result missing)');
        push('mv.' + j + '.tau2', ok ? F.sig4(f.G[j][j]) : '(app result missing)');
        push('ratio.' + j, ok ? (res.varRatio[j] === null ? '—' : F.f3(res.varRatio[j])) : '(app result missing)');
        var u = ok ? res.univariate[j] : null, uok = u && u.status === 'ok';
        push('uni.' + j + '.ci', uok ? F.ci(u.mu, u.se) : '(app result missing)');
        push('uni.' + j + '.se', uok ? F.f4(u.se) : '(app result missing)');
        var ut = uok ? window.AlmMultivariate.zTest(u.mu, u.se) : null;
        push('uni.' + j + '.z', uok ? F.z(ut.z) : '(app result missing)');
        push('uni.' + j + '.p', uok ? F.p(ut.p) : '(app result missing)');
        push('uni.' + j + '.tau2', uok ? F.sig4(u.tau2) : '(app result missing)');
      }
    }
    r.sweep.forEach(function (rs, i) {
      var s = sw[i];
      push('sweep.' + i + '.rhoW', String(rs.rhoW));
      if (rs.status !== 'ok') { push('sweep.' + i + '.status', 'Refused'); push('sweep.' + i + '.reason', s && s.status !== 'ok' ? s.reason : '(app fitted)'); return; }
      var ok = s && s.status === 'ok', f = ok ? s.fit : null, miss = '(app result missing)';
      push('sweep.' + i + '.status', ok ? (s.boundary ? 'ok (' + s.boundary + ')' : 'ok') : miss);
      push('sweep.' + i + '.ci0', ok ? F.ci(f.mu[0], f.muSE[0]) : miss); push('sweep.' + i + '.ci1', ok ? F.ci(f.mu[1], f.muSE[1]) : miss);
      push('sweep.' + i + '.tau20', ok ? F.sig4(f.G[0][0]) : miss); push('sweep.' + i + '.tau21', ok ? F.sig4(f.G[1][1]) : miss);
      push('sweep.' + i + '.rho', ok ? (f.rho === null ? 'undefined' : F.f3(f.rho)) : miss); push('sweep.' + i + '.logLik', ok ? F.f3(f.logLik) : miss);
    });
    return out;
  }
  window.AlmMvPlusDisplay = display;
  var manifest = window.AlmMvPlusManifest, host = document.getElementById('alm-plus-validate');
  if (!manifest || !window.AlmValidate || !host) { if (host) host.textContent = 'Validation unavailable: pins or validation widget missing.'; return; }
  var files = manifest.files;
  function run(loaded, progress) {
    var corpus = loaded[files[0].path], ref = loaded[files[1].path];
    var snap = window.AlmMvPlusUI.snapshot(), status = document.getElementById('plus-status').textContent;
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          var r = window.AlmMvPlusContract.replay(corpus, ref, window.AlmMvPlus, { display: display, progress: function (i, n, k) { progress(i + '/' + n + ' configurations; ' + k + ' checks'); } });
          if (r.checks !== manifest.checks) throw new Error('Plus check cardinality mismatch: ' + r.checks + ' != ' + manifest.checks);
          r.summaryLines = ['R reference: ' + ref.R + '; mvmeta ' + ref.versions.mvmeta + ', metafor ' + ref.versions.metafor + '. Controls: ' + ref.controls.mvmeta + '; ' + ref.controls.nlminb + '; ' + ref.controls.rma + '.',
            'Tolerances: iterative 1e-6 relative to max(1,|ref|); two-study exact and p(z) closed form 1e-9; statuses, refusal reasons, undefined-rho status and displayed strings exact.',
            'Boundary fits adjudicated by REML logLik (app >= ref - 1e-8): ' + r.adjudicated.length + (r.adjudicated.length ? ' (' + r.adjudicated.map(function (a) { return a.id; }).join('; ') + ')' : '') + '.',
            'logLik: app higher than R by >1e-10 in ' + r.logLikComparison.appHigherBy1e10 + ' fits, R higher by >1e-10 in ' + r.logLikComparison.refHigherBy1e10 + '.'];
          resolve(r);
        } catch (e) { reject(e); }
        finally { window.AlmMvPlusUI.restore(snap); document.getElementById('plus-status').textContent = status; }
      }, 0);
    });
  }
  var adapter = { app: 'multivariate-ma-plus', paper: { checks: manifest.checks, repoUrl: 'https://github.com/mahmood726-cyber/allmeta', runLabel: 'Plus validation protocol', runUrl: 'validate/README-plus.md' }, corpus: { files: files, run: run } };
  window.AlmMvPlusValidationAdapter = adapter;
  window.AlmMvPlusValidation = window.AlmValidate.mount(host, adapter);
})();
