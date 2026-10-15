"""One-use source-preserving repair. Removed before the reviewable PR is opened."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

p = Path('forest-plot/index.html')
s = p.read_text(encoding='utf-8')
expected = 'ee9e47e938fc20d3c1e87c83f757f63c0f30e5a0'
b = p.read_bytes()
assert hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest() == expected, 'Source moved; inspect before patching'

def replace(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:100], s.count(old), count)
    s = s.replace(old, new)

def between(start, end, new):
    global s
    assert s.count(start) == 1, start
    a = s.index(start)
    z = s.index(end, a + len(start))
    s = s[:a] + new + s[z:]

between('    function parseStudies(text) {', '    // Two-sided 95% t-quantile', r'''    function parseStudies(text) {
      const studies = [], warnings = [];
      const lines = String(text || "").split(/\r?\n/);
      let firstRecord = true;
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i].trim();
        if (!raw || raw.startsWith("#")) continue;
        const parts = raw.split(/\s*[,\t]\s*/);
        const estStr = (parts[parts.length - 2] || "").trim();
        const seStr = (parts[parts.length - 1] || "").trim();
        const header = firstRecord && parts.length >= 3 &&
          /^(estimate|est|effect|yi)$/i.test(estStr) && /^(se|sei|standard[ _-]?error)$/i.test(seStr);
        firstRecord = false;
        if (header) continue;
        if (parts.length < 3) { warnings.push("Line " + (i + 1) + ": need label, estimate, SE"); continue; }
        // Number, not parseFloat: '0.2junk', empty cells and arbitrary headers are not data.
        const est = Number(estStr), se = Number(seStr), v = se * se;
        if (!estStr || !seStr || !Number.isFinite(est) || !Number.isFinite(se)) {
          warnings.push("Line " + (i + 1) + ": estimate and SE must be complete finite numbers"); continue;
        }
        if (!(se > 0 && Number.isFinite(v) && v > 0 && Number.isFinite(1 / v) && Number.isFinite(est / v))) {
          warnings.push("Line " + (i + 1) + ": SE must be positive and numerically representable"); continue;
        }
        const label = parts.slice(0, -2).join(", ") || ("Study " + (studies.length + 1));
        studies.push({ label: label, est: est, se: se, v: v });
      }
      // No silently selected subset. Correct every malformed study before pooling/exporting.
      if (warnings.length) warnings.unshift("Analysis blocked: correct all invalid study rows; no partial dataset has been pooled.");
      return { studies: warnings.length ? [] : studies, warnings: warnings };
    }

''')
replace('Headers, blank lines, and lines starting with <code>#</code> are ignored. Estimate and SE must be numeric; SE must be positive.', 'One recognised header, blank lines, and lines starting with <code>#</code> are ignored. All other rows must be valid: malformed rows block the analysis instead of silently changing the study set.')
replace('      // FE CI uses normal — large k by definition.', '      // Fixed-effect normal/Wald CI; this model does not imply a large study count.')
replace('      const I2 = Math.max(0, 100 * (res0.Q - target) / Math.max(res0.Q, 1e-12));', '''      // Keep the historical Q definition, but use model-based I2 beside the
      // tau2-derived Q-profile limits and in the metafor comparison.
      const I2Q = Math.max(0, 100 * (res0.Q - target) / Math.max(res0.Q, 1e-12));
      const sumW2 = studies.reduce((a, study) => a + (1 / study.v) ** 2, 0);
      const vTypical = target / (res0.sw - sumW2 / res0.sw);
      const I2 = tau2 === 0 ? 0 : 100 * tau2 / (tau2 + vTypical);''')
replace('        I2: I2,\n        Q: res0.Q,', '        I2: I2, I2Q: I2Q, vTypical: vTypical,\n        Q: res0.Q,')
replace('method: "PM", test: "knha"', 'method: "PM", test: "adhoc"', 2)
# Precise inference identity without changing the existing PM / floored-HK estimate.
replace('      var out = { _schema: \'forest-plot-results-v1\', k: studies.length };', '''      var out = { _schema: 'forest-plot-results-v1', k: studies.length,
        re_method: 'PM', re_test: 'adhoc', confidence_level: 0.95,
        inference: 'Modified Hartung-Knapp: variance factor max(1,Qstar/(k-1)); t_(k-1)',
        I2_definition: '100*tau2/(tau2+v_typical)',
        prediction_interval: 't_(k-1)*sqrt(tau2+SE_modified_HK^2); an approximation',
        analysis_scale: 'input', studies: studies.map(function (x) { return Object.assign({}, x); }) };''')
replace('        out.I2 = re.I2;', '        out.I2 = re.I2;\n        out.I2_Q = re.I2Q;')
replace('      renderWarnings(parsed.warnings);\n      const fe = poolFE(parsed.studies);\n      const re = poolRE_PM(parsed.studies);', '''      let fe = null, re = null;
      try {
        fe = poolFE(parsed.studies);
        re = poolRE_PM(parsed.studies);
        if (fe && ![fe.mu, fe.se, fe.lo, fe.hi].every(Number.isFinite)) throw new Error('Fixed-effect calculation overflow');
        if (re && ![re.mu, re.se, re.lo, re.hi, re.tau2, re.I2, re.piLo, re.piHi].every(Number.isFinite)) throw new Error('Random-effects calculation overflow');
      } catch (error) {
        fe = null; re = null; parsed.studies = [];
        parsed.warnings.push('Analysis blocked: ' + (error.message || String(error)));
      }
      renderWarnings(parsed.warnings);''')
# Prediction intervals were drawn but absent from the automatic domain.
replace('        if (re && re.lo < lo) lo = re.lo; if (re && re.hi > hi) hi = re.hi;', '''        if (re && re.lo < lo) lo = re.lo; if (re && re.hi > hi) hi = re.hi;
        if (reHasPI) { lo = Math.min(lo, re.piLo); hi = Math.max(hi, re.piHi); }''')
replace('var _lo = isFinite(_ax.x[0]) ? _ax.x[0] : lo;', 'var _lo = Number.isFinite(_ax.x[0]) ? _ax.x[0] : lo;')
replace('var _hi = isFinite(_ax.x[1]) ? _ax.x[1] : hi;', 'var _hi = Number.isFinite(_ax.x[1]) ? _ax.x[1] : hi;')
replace('      const axisY = TOP + bodyH - 12;', '      const axisY = TOP + bodyH + 14; // Always below pooled diamonds and PI.')
replace('      // Null line\n      if (isFinite(nullV)) {', '      // Null line (do not draw outside a user-selected domain)\n      if (Number.isFinite(nullV) && nullV >= lo && nullV <= hi) {')
# Report data must not be rounded before a purported numerical reproduction.
between('          var rScript =', '          return {\n            appKey: "forest-plot",', r'''          var rScript =
            "# Reproduce the displayed PM + modified Hartung-Knapp model\n" +
            "# R metafor: test='adhoc' is the q >= 1 floor, NOT raw test='knha'.\n" +
            "library(metafor)\n" +
            "dat <- data.frame(\n" +
            "  yi = c(" + s.studies.map(function(x) { return String(x.est); }).join(", ") + "),\n" +
            "  vi = c(" + s.studies.map(function(x) { return String(x.se * x.se); }).join(", ") + "),\n" +
            "  label = c(" + s.studies.map(function(x) { return JSON.stringify(String(x.label || '')); }).join(", ") + ")\n" +
            ")\n" +
            "res <- rma(yi, vi, data=dat, method='PM', test='adhoc', control=list(tol=1e-15,maxiter=10000))\n" +
            "print(res)\npredict(res)\n" +
            "# I2 shown is tau2/(tau2+v_typical); I2_Q is separately retained in JSON.\n" +
            "# Prediction intervals use t_(k-1) and are approximations, especially with few studies.\n";
''')
replace('    window.alm.resultsExport({', '''    // The input scale already contains signed/logged effects; do not offer a
    // second logarithm. Natural ratio labels use the explicit Axis scale selector.
    var forestLogToggle = document.querySelector('#alm-axis-mount [data-edge="log"]');
    if (forestLogToggle) { forestLogToggle.disabled = true; forestLogToggle.title = 'Use the Axis scale selector for exponentiated labels'; }
    window.alm.resultsExport({''')
# Add unambiguous visible method and plot conventions (leave existing exported labels stable).
replace('      <div id="stats-wrap"></div>', '''      <p class="hint" id="forest-method-note">Both models are shown: fixed-effect inverse variance with a normal CI, and Paule–Mandel random effects with <strong>modified Hartung–Knapp (variance floor 1)</strong>, matching metafor <code>test="adhoc"</code>. I² uses τ² and the typical sampling variance; the historical Q-based I² is also retained in JSON. Prediction intervals are approximations and can be unstable with few studies. Numerical table entries remain on the input scale; exponentiation changes axis labels only.</p>
      <div id="stats-wrap"></div>''')
# Remove the claim that alternative PI conventions have been universally superseded.
a = s.index('    // PI rationale (Higgins et al. 2009):')
z = s.index('    function poolRE_PM', a)
s = s[:a] + '''    // PI: a t_(k-1) approximation for a future true study effect, matching
    // metafor::predict(rma(...,test="adhoc")). Other conventions are not
    // universally superseded; none is exact, especially with very small k.
''' + s[z:]
a = s.index('      // Prediction interval:')
z = s.index('      let piLo', a)
s = s[:a] + '''      // Match the documented modified-HK model, not an unqualified exact PI.
''' + s[z:]
p.write_text(s, encoding='utf-8')
# Materialise the entire current app register from the actual catalog, not a stale README count.
raw = subprocess.check_output(['node', '-e', "const fs=require('fs'),vm=require('vm');const c={window:{}};vm.runInNewContext(fs.readFileSync('hub/projects.js','utf8'),c);console.log(JSON.stringify(c.window.HTML_APPS_PROJECTS));"], text=True)
apps = json.loads(raw)
records = []
for app in apps:
    path = app.get('path', '')
    external = bool(re.match(r'^https?://', path))
    is_forest = path.startswith('./forest-plot/')
    is_effect = path.startswith('./effect-size-converter/')
    records.append({'name': app['name'], 'path': path, 'hosted_in_repository': not external,
        'review_status': 'under_review' if is_forest else 'queued',
        'repair_status': 'scoped_fix_merged' if is_effect else ('fixes_proposed' if is_forest else 'not_assessed'),
        'pull_request': 111 if is_effect else None,
        'complete': False,
        'scope': 'PR111 scoped converter repair; broader audit pending' if is_effect else ('Forest model/export/plot/input integrity; tests pending' if is_forest else 'Not yet individually assessed in this programme')})
register = {'schema':'allmeta-app-repair-register-v1','catalog_sha256':hashlib.sha256(Path('hub/projects.js').read_bytes()).hexdigest(),
  'base_commit':'bdf777fb074804e09de59ac63db55f0ad90b2241','catalog_entries':len(records),'repository_entries':sum(x['hosted_in_repository'] for x in records),
  'definition_of_complete':'All declared model, numerical, input/output, browser, accessibility and reproducibility gates individually reviewed, with evidence and no unresolved blocking issue. A scoped repair or smoke pass is not completion.',
  'apps':records}
Path('docs/APP_REPAIR_REGISTER.json').write_text(json.dumps(register, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'patched':'forest-plot/index.html','catalog_entries':len(records),'repository_entries':register['repository_entries']}))
