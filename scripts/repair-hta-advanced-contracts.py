"""One-time exact-source UI wiring patch. Does not modify any estimator."""
from pathlib import Path
import hashlib
HASHES = {
 'HTA/index.html': 'cc66ee5a4a9341f1694783f6d4bd17fc9efca98c',
 'HTA/src/ui/advancedUI.js': 'c525997abc84f01a5ba64781d872da1d5eb5018d',
 'HTA/src/ui/synthesisPlots.js': '4e085bef0596a8a06d55207d0342f0f061798d98',
 'HTA/src/ui/beginnerMode.js': 'd1f6a627ab3ffe4f62101d1dbc21c4c323398f73',
 'HTA/src/ui/app.js': '05c3b5f326c875d17dae2b45c1899bef100c9172',
}
def read(path):
    b=Path(path).read_bytes()
    expected=HASHES[path]
    sha=hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()
    if expected: assert sha==expected, f'Source changed: {path}: {sha}'
    return b.decode()
def once(t,a,b):
    assert t.count(a)==1, (a[:90],t.count(a))
    return t.replace(a,b,1)
def write(p,t):Path(p).write_bytes(t.encode())
p='HTA/index.html';t=read(p)
t=once(t,'    <script src="src/ui/synthesisPlots.js"></script>','    <script src="src/ui/synthesisPlots.js"></script>\n    <script src="src/ui/advancedSynthesis.js"></script>')
write(p,t)
p='HTA/src/ui/advancedUI.js';t=read(p)
t=once(t,'        this.initEngines();','        this.synthesis = new HTAAdvancedSynthesis(app);\n        this.initEngines();')
a=t.index('    async runNMA() {');b=t.index('    // ============ HELPER CHART METHODS ============',a)
t=t[:a]+'''    // These persistent panels share one validated import/fit/plot contract.
    async runNMA() { return this.synthesis.runNMA(); }
    async runMetaAnalysis() { return this.synthesis.runMA(); }
    async runPublicationBias() { return this.synthesis.runPB(); }
    getMADataFromInputs() { return this.synthesis.data.ma || []; }
    getNMADataFromInputs() { return this.synthesis.data.nma || []; }

'''+t[b:]
write(p,t)
p='HTA/src/ui/synthesisPlots.js';t=read(p)
t=once(t,'function forest(parent, id, title, rows, pooled = null) {',"function forest(parent, id, title, rows, pooled = null, axisDescription = 'Effect on the input analysis scale; 95% intervals') {")
t=once(t,"const x = axis(svg,domain,25+items.length*31,'Effect on the input analysis scale; 95% intervals');",'const x = axis(svg,domain,25+items.length*31,axisDescription);')
t=once(t,'root.HTASynthesisPlots={pairwise,bias,nma,error,saveSVG};','root.HTASynthesisPlots={pairwise,bias,nma,error,saveSVG,forest,funnel,figure,mark,table,element,modal};')
write(p,t)
p='HTA/src/ui/beginnerMode.js';t=read(p)
a=t.index('    runDTAAnalysis(dataset) {');b=t.index('\n    showResultsWithInterpretation(',a)
t=t[:a]+'''    runDTAAnalysis(dataset) {
        return HTADiagnosticRoute(dataset);
    }
''' + t[b:]
write(p,t)
p='HTA/src/ui/app.js';t=read(p)
a=t.index('    setupTabs() {');b=t.index('\n    // ============ UI POPULATION',a)
t=t[:a]+'''    setupTabs() {
        document.querySelectorAll('.tabs').forEach(group => {
            group.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const target = document.getElementById(`tab-${tab.dataset.tab}`);
                    if (!target) return;
                    // Independent plot groups must not hide each other's panels.
                    group.querySelectorAll('.tab').forEach(other => {
                        other.classList.toggle('active', other === tab);
                        const panel = document.getElementById(`tab-${other.dataset.tab}`);
                        if (panel) panel.classList.toggle('active', other === tab);
                    });
                });
            });
        });
    }
''' + t[b:]
write(p,t)
