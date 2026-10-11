"""Temporary branch repair. Fail closed if any audited source has changed."""
from pathlib import Path
import hashlib
import re

HASHES = {
    'Truthcert1/app.min.js': 'bd64a072fe4b3d0197b90bb23eb0327730999972',
    'Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html': '10cb9167a6bbb7bba693f7b944556046e536e3a4',
    'nma-dose-response-app/app.js': '68359db616d2f7af48ead6e0401a65673e9960f9',
    'nma-dose-response-app/index.html': 'd88b4e3d3c6ff64ef814c5c649a471a68f294b4b',
    'IPD-Meta-Pro/ipd-meta-pro.html': '79f547dc040eb3219826039d786b5648b09fa8ae',
}

def read(path):
    raw = Path(path).read_bytes()
    sha = hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest()
    assert sha == HASHES[path], f'Source changed: {path}: {sha}'
    return raw.decode('utf-8')

def once(text, old, new):
    assert text.count(old) == 1, (old[:100], text.count(old))
    return text.replace(old, new, 1)

def write(path, text):
    Path(path).write_bytes(text.encode('utf-8'))

for path in ['Truthcert1/app.min.js', 'Pairwiseai/TruthCert-PairwisePro-v1.0-bundle.html']:
    text = read(path)
    mini = path.endswith('.js')
    start = text.index('function saveProject(')
    end = text.index('function loadProject(', start)
    save = text[start:end]
    subset = re.search(r'results:\s*AppState\.results\s*\?\s*\{\s*pooled:\s*AppState\.results\.pooled,.*?\}\s*:\s*null', save, re.S)
    assert subset
    text = once(text, subset.group(), 'results: AppState.results')
    if mini:
        a, b = save.index('const studyData='), save.index('const projectState=')
        text = once(text, save[a:b], '// Save input rows as entered, not a lossy effect-only reconstruction.\nconst studyData=getStudyData();\n')
        text = once(text, "if(typeof renderAnalysisPanel==='function'){\nsafeRender(renderAnalysisPanel,'panel-analysis',AppState.results);\n}", "// Repaint every result panel from the complete saved result, without refitting.\nif(typeof renderResults==='function') renderResults();")
    else:
        text = once(text, "if (typeof renderAnalysisPanel === 'function') {\n      safeRender(renderAnalysisPanel, 'panel-analysis', AppState.results);\n    }", "// Repaint every result panel from the complete saved result, without refitting.\n    if (typeof renderResults === 'function') renderResults();")
    key = 'const a=n.dataset.tab;' if mini else 'const a = n.dataset.tab;'
    text = once(text, key, key + """
      requestAnimationFrame(() => {
        const panel = document.getElementById('panel-' + a);
        if (!panel || typeof Plotly === 'undefined') return;
        panel.querySelectorAll('.js-plotly-plot').forEach(plot => {
          if (plot.data && plot.clientWidth && plot.clientHeight) {
            Plotly.Plots.resize(plot).catch(error => console.warn('Plot resize failed:', error));
          }
        });
      });""")
    write(path, text)

path = 'nma-dose-response-app/app.js'
text = read(path)
api = """  // Public UI entry point: keep parsing and analysis in the engine closure.
  function runAnalysisFromInput() {
    if (!state.wasm) return { ok: false, message: 'Analysis engine is still loading.' };
    const parsed = parseCSV(dom.csvInput.value);
    if (!parsed.length) return { ok: false, message: 'CSV parse failed. Check headers.' };
    state.rawData = parsed;
    updateAnalysis();
    if (!state.lastStats || !state.lastStats.length) {
      return { ok: false, message: 'No valid comparisons were available for plotting. Check the input data.' };
    }
    setStatus(`Parsed ${parsed.length} rows.`);
    return { ok: true };
  }

"""
text = once(text, '  window.NMAStudio = {\n', api + '  window.NMAStudio = {\n    runAnalysisFromInput,\n')
write(path, text)

path = 'nma-dose-response-app/index.html'
text = read(path)
a = text.index("document.getElementById('runAnalysis')?.addEventListener")
b = text.index('      // NNT Calculator', a)
text = once(text, text[a:b], """document.getElementById('runAnalysis')?.addEventListener('click', function() {
        const csvInput = document.getElementById('csvInput');
        if (!csvInput || !csvInput.value.trim()) {
          showNotification('Please enter or load CSV data first', 'warning');
          return;
        }
        const run = window.NMAStudio && window.NMAStudio.runAnalysisFromInput;
        if (typeof run !== 'function') {
          showNotification('Analysis engine is still loading.', 'warning');
          return;
        }
        try {
          const result = run();
          if (!result.ok) {
            showNotification(result.message, 'warning');
            return;
          }
          document.getElementById('chartsPanel')?.classList.remove('hidden');
          document.getElementById('chartsToggleBtn')?.classList.remove('visible');
          // Activate after revealing: the chart renderer now sees its true dimensions.
          const activeTab = document.querySelector('#chartTabs [data-tab-button].active');
          (activeTab || document.querySelector('#chartTabs [data-tab-button="dose"]'))?.click();
          showNotification('Analysis complete! Check the Charts panel.', 'success');
        } catch (error) {
          console.error('Analysis failed:', error);
          showNotification('Analysis failed. Check the input data and try again.', 'error');
        }
      });

""")
write(path, text)

path = 'IPD-Meta-Pro/ipd-meta-pro.html'
text = read(path)
key = " document.getElementById('imputedStudies').textContent = tf.k0;"
text = once(text, key, key + """

 // Plot the same observed and imputed effects used by the displayed adjustment.
 const trimFillCanvas = document.getElementById('trimFillPlot');
 if (trimFillCanvas) {
   const observed = r.studies.map(s => ({ effect: s.effect, variance: s.variance }));
   const filled = observed.concat(tf.imputedStudies || []);
   setTimeout(() => Plots.drawFunnel(
     trimFillCanvas, filled.map(s => s.effect), filled.map(s => Math.sqrt(s.variance)),
     tf.adjusted.pooled, { showContour: true, observedCount: observed.length }
   ), 100);
 }
""")
a, b = text.index(' drawFunnel:'), text.index(' drawSurvival:', text.index(' drawFunnel:'))
funnel = text[a:b]
replacement = once(funnel, ' ctx.arc(toX(e), toY(se[i]), 5, 0, Math.PI * 2);\n\n ctx.fill();', """ ctx.arc(toX(e), toY(se[i]), 5, 0, Math.PI * 2);

 if (Number.isInteger(options.observedCount) && i >= options.observedCount) {
   ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();
   ctx.lineWidth = 2;
   ctx.stroke();
 } else {
   ctx.fill();
 }""")
replacement = once(replacement, ' const effectRange = Math.max(...effects.map(e => Math.abs(e - pooled))) * 1.5;', ' // Keep identical-effect datasets finite and include the funnel boundaries.\n const effectRange = Math.max(Math.max(...effects.map(e => Math.abs(e - pooled))) * 1.5, getConfZ() * maxSE, 1e-12);')
replacement = once(replacement, " ctx.fillText('Effect Size', w / 2, h - 10);", " ctx.fillText('Effect Size', w / 2, h - 10);\n if (Number.isInteger(options.observedCount)) {\n   ctx.fillText('Filled: observed; open: imputed', w / 2, 18);\n }")
text = once(text, funnel, replacement)
key = 'function initNetworkDemo() {\n'
text = once(text, key, key + """
 // Once data is loaded, redraw its network rather than the startup illustration.
 if (APP.data && APP.data.length) {
   buildNetworkFromData();
   return;
 }
""")
a = text.index('function switchPanel(panelName)')
b = text.index('function drawMissingnessPlot', a)
switch = text[a:b]
pos = switch.rfind('}')
text = once(text, switch, switch[:pos] + """    requestAnimationFrame(() => {
        if (panelName === 'network' && APP.data && APP.data.length) buildNetworkFromData();
        if ((panelName === 'results' || panelName === 'pubbias') && APP.results) updateResults();
    });
""" + switch[pos:])
write(path, text)
print('Five audited source files repaired; statistical estimators unchanged.')
