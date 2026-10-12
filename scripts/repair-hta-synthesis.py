"""One-time guarded integration. Remove after verified source is committed."""
from pathlib import Path
import hashlib

def read(path, sha):
    b=Path(path).read_bytes()
    assert hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()==sha, f'Source changed: {path}'
    return b.decode()
def once(s,a,b):
    assert s.count(a)==1,(a[:80],s.count(a))
    return s.replace(a,b,1)

p=Path('HTA/src/engine/metaMethods.js')
s=read(str(p),'5a78994f0d6c3962b9dd2fd3d488bbc98e28d900')
a=s.index('    /**\n     * REML τ² estimator using Fisher scoring')
b=s.index('    /**\n     * Paule-Mandel',a)
s=s[:a]+"""    /** Use AllMeta's canonical profile-likelihood-checked REML estimator.
     * The previous simplified score/information iteration could remain at the
     * zero boundary despite a better positive restricted-likelihood solution.
     * Keep the HTA result schema and its existing normal-interval convention.
     */
    estimateTauREML(studies, thetaInit) {
        const core = typeof globalThis !== 'undefined' && globalThis.AlmMaCore
            ? globalThis.AlmMaCore
            : (typeof module !== 'undefined' && module.exports
                ? require('../../../shared/ma-core.js') : null);
        if (!core || typeof core.tau2REML !== 'function') {
            throw new Error('The shared REML engine is unavailable. Reload the application.');
        }
        return core.tau2REML(studies.map(s => s.effect), studies.map(s => s.se * s.se));
    }

"""+s[b:]
s=once(s,"typeof s.effect !== 'number' || isNaN(s.effect)","typeof s.effect !== 'number' || !Number.isFinite(s.effect)")
s=once(s,"typeof s.se !== 'number' || isNaN(s.se) || s.se <= 0","typeof s.se !== 'number' || !Number.isFinite(s.se) || s.se <= 0")
p.write_text(s)

p=Path('HTA/src/ui/beginnerMode.js')
s=read(str(p),'9551c029503ae58d58ea0e2a781f63d97445bb6d')
a=s.index('    runPairwiseAnalysis(dataset) {')
b=s.index('    runDTAAnalysis(dataset) {',a)
s=s[:a]+"""    runPairwiseAnalysis(dataset) {
        for (const id of ['results-modal','bias-modal','hta-nma-results','hta-synthesis-error']) document.getElementById(id)?.remove();
        window.lastResults = null;
        try {
            if (!dataset || !Array.isArray(dataset.studies) || dataset.studies.length < 2) throw new Error('Enter at least two studies with finite effects and positive standard errors.');
            // The beginner view explicitly labels the intervals actually used.
            // It does not claim an automatic HKSJ adjustment that was never applied.
            const ma = new MetaAnalysisMethods({ method:'REML', model:'random', autoHKSJ:false, useHKSJ:false });
            const results = ma.calculatePooledEffect(dataset.studies);
            window.currentDataset = dataset;
            window.lastResults = results;
            this.showResultsWithInterpretation(dataset, results);
        } catch (error) {
            HTASynthesisPlots.error(error.message);
        }
    }

    async runNMAAnalysis(dataset) {
        for (const id of ['results-modal','bias-modal','hta-nma-results','hta-synthesis-error']) document.getElementById(id)?.remove();
        window.lastResults = null;
        window.lastNMAEngine = null;
        try {
            const arms = new Map();
            for (const row of dataset.studies || []) {
                if (!arms.has(row.study)) arms.set(row.study, new Set());
                arms.get(row.study).add(row.treatment);
            }
            if ([...arms.values()].some(a => a.size !== 2)) throw new Error('This beginner view requires two-arm studies. Use the dedicated NMA application for a validated multi-arm workflow.');
            const nma = new NetworkMetaAnalysis({ method:'frequentist', model:'fixed' });
            nma.setData(dataset.studies, 'binary');
            await nma.run();
            window.currentDataset = dataset;
            window.lastNMAEngine = nma;
            this.showNMAResults(dataset, nma.results, nma);
        } catch (error) {
            HTASynthesisPlots.error(error.message);
        }
    }

"""+s[b:]
a=s.index('    showResultsWithInterpretation(dataset, results) {')
b=s.index('    // ============ HELP PANEL',a)
s=s[:a]+"""    showResultsWithInterpretation(dataset, results) {
        return HTASynthesisPlots.pairwise(this, dataset, results);
    }

    showNMAResults(dataset, results, engine) {
        if (!engine) return HTASynthesisPlots.error('A fitted network is required before its plots can be displayed.');
        return HTASynthesisPlots.nma(this, dataset, engine);
    }

    runPublicationBias() {
        if (!window.currentDataset || !window.lastResults) return;
        document.getElementById('results-modal')?.remove();
        try { return HTASynthesisPlots.bias(this, window.currentDataset); }
        catch (error) { HTASynthesisPlots.error(error.message); }
    }

"""+s[b:]
# Align existing CSV/table/report weights with the random-effects fit displayed.
s=s.replace('1/(s.se**2)', '1/(s.se**2 + (window.lastResults?.heterogeneity?.tauSquared || 0))')
s=s.replace('1/(st.se**2)', '1/(st.se**2 + (window.lastResults?.heterogeneity?.tauSquared || 0))')
s=s.replace('heterogeneity?.tau2', 'heterogeneity?.tauSquared')
s=s.replace('heterogeneity?.pValue?', 'heterogeneity?.pValueQ?')
s=s.replace("window.lastResults.heterogeneity?.tauSquared || ''", "window.lastResults.heterogeneity?.tauSquared ?? ''")
s=s.replace("window.lastResults.random?.effect || ''", "window.lastResults.random?.effect ?? ''")
s=s.replace("window.lastResults.random?.ci_lower || ''", "window.lastResults.random?.ci_lower ?? ''")
s=s.replace("window.lastResults.random?.ci_upper || ''", "window.lastResults.random?.ci_upper ?? ''")
p.write_text(s)

p=Path('HTA/index.html')
s=read(str(p),'1c59917c5137c5477e156984a372f510dc3a19b2')
s=once(s,'    <script src="src/engine/metaMethods.js"></script>','    <script src="../shared/ma-core.js"></script>\n    <script src="src/engine/metaMethods.js"></script>')
s=once(s,'    <script src="src/ui/beginnerMode.js"></script>','    <script src="src/ui/synthesisPlots.js"></script>\n    <script src="src/ui/beginnerMode.js"></script>')
p.write_text(s)
print('HTA beginner plots connected; canonical REML used; old result schema preserved.')
