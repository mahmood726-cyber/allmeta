"""Follow-up to the guarded repair, based on real-browser failure diagnostics."""
from pathlib import Path

p = Path('IPD-Meta-Pro/ipd-meta-pro.html')
t = p.read_text()
needle = 'function drawMissingnessPlot(data) {'
assert t.count(needle) == 1
replacement = """// This handler is deliberately top-level: the legacy demo resize listener is
// nested inside kMeans and does not register when the application loads.
let ipdPlotResizeFrame = null;
window.addEventListener('resize', () => {
    if (ipdPlotResizeFrame !== null) cancelAnimationFrame(ipdPlotResizeFrame);
    ipdPlotResizeFrame = requestAnimationFrame(() => {
        ipdPlotResizeFrame = null;
        const active = document.querySelector('.panel.active');
        if (active && active.id === 'panel-network' && APP.data && APP.data.length) {
            buildNetworkFromData();
        }
        if (active && (active.id === 'panel-results' || active.id === 'panel-pubbias') && APP.results) {
            updateResults();
        }
    });
});

""" + needle
p.write_text(t.replace(needle, replacement, 1))

p = Path('nma-dose-response-app/app.js')
t = p.read_text()
a = t.index('  function runAnalysisFromInput() {')
b = t.index('  window.NMAStudio = {', a)
old = t[a:b]
needle = '    state.rawData = parsed;\n    updateAnalysis();'
assert old.count(needle) == 1
new = old.replace(needle, '    state.rawData = parsed;\n    state.lastStats = [];\n    state.lastCurves = [];\n    updateAnalysis();')
p.write_text(t[:a] + new + t[b:])

# Fixture corrections: the applications put funnel in Heterogeneity and Baujat
# in Bias. These are tab-location corrections, not relaxed plot expectations.
p = Path('tests/playwright/flagship-plot-rendering.spec.mjs')
t = p.read_text()
old = "[['analysis', 'forestPlot'], ['heterogeneity', 'baujatPlot'], ['bias', 'funnelPlot']]"
new = "[['analysis', 'forestPlot'], ['heterogeneity', 'funnelPlot'], ['bias', 'baujatPlot']]"
assert t.count(old) == 1
t = t.replace(old, new, 1)
old = "    localStorage.setItem('nma-quickstart-dismissed', 'true');"
assert t.count(old) == 1
t = t.replace(old, old + "\n    localStorage.setItem('nma_wizard_completed', 'true');\n    localStorage.setItem('nma_tutorial_completed', 'true');", 1)
p.write_text(t)
