"""One-time exact repair: connect plot labels/intervals to saved fitted results."""
from pathlib import Path
import hashlib
p=Path('IPD-Meta-Pro/ipd-meta-pro.html')
raw=p.read_bytes()
assert hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()=='c26bb9af46776aa67d4f0fd36df6ab9eaf14f9df', 'Source changed; review first'
t=raw.decode('utf-8')
def once(old,new):
 global t
 assert t.count(old)==1, (old[:90],t.count(old))
 t=t.replace(old,new,1)

# Empty-state panels must not look like a finished example analysis.
for id,value in [('pooledEffect','0.72'),('pooledCI','0.58-0.89'),('pooledP','0.002'),('pooledI2','45%'),('hetI2','45.2%'),('hetTau2','0.0234'),('hetH2','1.82'),('hetQ','18.24'),('eggerZ','1.82'),('eggerP','0.069'),('beggZ','1.45'),('beggP','0.147'),('imputedStudies','2'),('adjustedEffect','0.76 (0.61-0.95)')]:
 once(f'id="{id}">{value}<',f'id="{id}">—<')
once('<div class="stat-label">Q (p=0.032)</div>','<div class="stat-label">Q (p-value)</div>')
once("<div class=\"stat-label\">Egger\\'s Z</div>","<div class=\"stat-label\">Egger’s t</div>")
once('''<div class="alert alert-warning">

                        <strong>Interpretation:</strong> Moderate heterogeneity detected (I² = 45.2%). Consider exploring sources through subgroup analysis or meta-regression.

                    </div>''','''<div class="alert alert-info" id="ipdHetInterpretation" role="status">
                        Run an analysis to assess heterogeneity. No example statistics are used here.
                    </div>''')
once('95% PI: <strong>0.45 to 1.15</strong>','<span id="ipdPredictionInterval">Run a random-effects analysis to estimate a prediction interval.</span>')
once('Range of true effects expected in 95% of similar studies','Prediction intervals depend on the fitted model and its assumptions.')
once('Tau = <strong>0.153</strong> (95% CI: 0.08-0.31)','<span id="ipdTauSummary">Run an analysis to estimate between-study variation.</span>')
once('''<div class="alert alert-info">

                        No significant evidence of publication bias detected (Egger p = 0.069, Begg p = 0.147).

                        However, tests have limited power with fewer than 10 studies.

                    </div>''','''<div class="alert alert-info" id="ipdBiasInterpretation" role="status">
                        Run an analysis to calculate funnel-asymmetry diagnostics.
                    </div>''')

helpers='''// Display adapters read the saved fit; they never rerun an estimator.
function getIPDFittedDisplay(r) {
 const cfg = { ...APP.config, ...(APP.analysisSettings || {}) };
 const pooled = r.pooled;
 const ratio = cfg.outcomeType === 'survival' || (cfg.outcomeType === 'binary' && cfg.effectMeasure !== 'RD');
 const transform = x => ratio ? Math.exp(x) : x;
 const hksj = !!cfg.useHKSJ;
 const lower = hksj && Number.isFinite(pooled.lowerHKSJ) ? pooled.lowerHKSJ : pooled.lower;
 const upper = hksj && Number.isFinite(pooled.upperHKSJ) ? pooled.upperHKSJ : pooled.upper;
 const ci = [lower, upper].every(Number.isFinite) ? [transform(lower), transform(upper)] : [NaN, NaN];
 return { cfg, ratio, transform, effect: transform(pooled.pooled),
  ci: ci.every(Number.isFinite) && ci[0] <= ci[1] ? ci : null,
  level: Number.isFinite(cfg.confLevel) ? cfg.confLevel : .95,
  p: hksj && Number.isFinite(pooled.pHKSJ) ? pooled.pHKSJ : pooled.p,
  measure: cfg.outcomeType === 'survival' ? 'HR' : (cfg.effectMeasure || 'Effect') };
}
function ipdDisplayNumber(x, digits = 3) {
 return Number.isFinite(x) ? x.toFixed(digits) : 'Not estimable';
}
function ipdDisplayP(x) {
 return Number.isFinite(x) && x >= 0 && x <= 1 ? (x < .001 ? '<0.001' : x.toFixed(3)) : 'Not estimable';
}
function renderIPDFittedNarratives(r, view, egger, begg) {
 const set = (id, value) => { const e = document.getElementById(id); if (e) e.textContent = value; };
 const p = r.pooled, k = r.studies.length, pct = (view.level * 100).toFixed(0);
 set('ipdHetInterpretation', `Saved ${view.cfg.reMethod || 'REML'} fit: I² = ${ipdDisplayNumber(p.I2, 1)}%; τ² = ${ipdDisplayNumber(p.tau2, 4)}; Q = ${ipdDisplayNumber(p.Q, 2)} (p ${ipdDisplayP(p.pQ)}). Assess these statistics alongside study differences; they do not identify the cause of heterogeneity.`);
 if (view.cfg.reMethod === 'FE') {
  set('ipdPredictionInterval', 'Not estimated for the fixed-effect model. Select a random-effects model and rerun to estimate a prediction interval.');
  set('ipdTauSummary', 'τ² is fixed at 0 in this fixed-effect model; between-study SD is not estimated.');
 } else {
  const pi = r.pi && [view.transform(r.pi.lower), view.transform(r.pi.upper)];
  set('ipdPredictionInterval', k >= 3 && pi && pi.every(Number.isFinite) && pi[0] <= pi[1]
   ? `${pct}% PI (${view.measure}): ${pi[0].toFixed(3)} to ${pi[1].toFixed(3)} — from the saved fit.`
   : 'Prediction interval unavailable: at least three studies and a finite saved random-effects interval are required.');
  set('ipdTauSummary', Number.isFinite(p.tau2) && p.tau2 >= 0
   ? `τ = ${Math.sqrt(p.tau2).toFixed(4)} (model scale). Use Compute Q-Profile for a separate τ² confidence-interval calculation.`
   : 'Between-study SD is not available for this fit.');
 }
 set('ipdBiasInterpretation', `Egger’s test: t = ${ipdDisplayNumber(egger.t, 2)}, p ${ipdDisplayP(egger.p)}. Begg’s test: z = ${ipdDisplayNumber(begg.z, 2)}, p ${ipdDisplayP(begg.p)}. ${k < 10 ? 'Fewer than 10 studies: interpret these tests cautiously. ' : ''}Funnel asymmetry does not by itself establish publication bias; non-significance does not rule it out.`);
 const effectLabel = document.getElementById('pooledEffect')?.parentElement.querySelector('.stat-label');
 if (effectLabel) effectLabel.textContent = 'Pooled ' + view.measure;
 const ciLabel = document.getElementById('pooledCI')?.parentElement.querySelector('.stat-label');
 if (ciLabel) ciLabel.textContent = pct + '% CI' + (view.cfg.useHKSJ ? ' (HKSJ)' : '');
 const th = document.getElementById('studyResultsBody')?.closest('table').querySelectorAll('thead th')[4];
 if (th) th.textContent = pct + '% CI';
}

'''
once('function renderAnalysisSummaryCard(r) {',helpers+'function renderAnalysisSummaryCard(r) {')
a=t.index('function renderAnalysisSummaryCard(r) {');b=t.index('\nfunction updateResults() {',a)
block=t[a:b]
start=block.index(' const isLogScale = APP.config.outcomeType')
end=block.index(' const kStudies =',start)
block=block[:start]+''' const view = getIPDFittedDisplay(r), cfg = view.cfg;
 const isLogScale = view.ratio;
 const confPct = Math.round(view.level * 100);
 const displayEffect = view.effect;
 const displayLower = view.ci ? view.ci[0] : NaN;
 const displayUpper = view.ci ? view.ci[1] : NaN;

'''+block[end:]
block=block.replace('APP.config.', 'cfg.')
start=block.index(' // Interpretation\n');end=block.index(' // Heterogeneity descriptor',start)
block=block[:start]+''' // Describe the saved interval without guessing whether a larger outcome is beneficial.
 var interpColor = 'var(--text-secondary)';
 const nullEffect = isLogScale ? 1 : 0;
 var interp = view.ci ? `${confPct}% confidence interval ${displayLower > nullEffect || displayUpper < nullEffect ? 'excludes' : 'includes'} the null effect; p ${ipdDisplayP(pVal)}.`
  : 'Saved confidence limits are unavailable; rerun the analysis before interpreting its interval.';

'''+block[end:]
block=block.replace('displayLower.toFixed(2)', 'ipdDisplayNumber(displayLower, 2)').replace('displayUpper.toFixed(2)', 'ipdDisplayNumber(displayUpper, 2)')
t=t[:a]+block+t[b:]

a=t.index('function updateResults() {');b=t.index('\nfunction runBayesian() {',a)
block=t[a:b]
block=block.replace(' const pooled = r.pooled;', ' if (!r || !r.pooled) return;\n const pooled = r.pooled;\n const view = getIPDFittedDisplay(r), cfg = view.cfg;')
start=block.index(' const isLogScale = APP.config.outcomeType');end=block.index(" document.getElementById('pooledEffect')",start)
block=block[:start]+''' const isLogScale = view.ratio;
 const displayEffect = view.effect;
 const displayCI = view.ci ? view.ci.map(x => x.toFixed(2)).join('-') : 'Saved CI unavailable';

'''+block[end:]
block=block.replace('APP.config.', 'cfg.')
block=block.replace("(cfg.useHKSJ ? pooled.pHKSJ : pooled.p).toFixed(4)", 'ipdDisplayP(view.p)')
block=block.replace('if (forestCanvas) {', '''if (forestCanvas) {
 forestCanvas.hidden = !view.ci;
 let note = document.getElementById('ipdForestStatus');
 if (!note) { note = document.createElement('p'); note.id = 'ipdForestStatus'; note.setAttribute('role', 'status'); forestCanvas.parentElement.appendChild(note); }
 note.textContent = view.ci ? '' : 'Saved confidence limits are unavailable. Rerun the analysis before plotting its interval.';
}
if (forestCanvas && view.ci) {''',1)
start=block.index(' const forestPooled = {');end=block.index(' setTimeout(() => {',start)
block=block[:start]+''' const forestPooled = { effect: view.effect, lower: view.ci[0], upper: view.ci[1] };

'''+block[end:]
for old,new in [
 ("egger.t.toFixed(2)","ipdDisplayNumber(egger.t, 2)"),("egger.p.toFixed(3)","ipdDisplayP(egger.p)"),
 ("begg.z.toFixed(2)","ipdDisplayNumber(begg.z, 2)"),("begg.p.toFixed(3)","ipdDisplayP(begg.p)")]: block=block.replace(old,new)
block=block.replace(' const egger = PublicationBias.eggerTest', " const egger = r.studies.length < 3 ? {t: NaN, p: NaN} : PublicationBias.eggerTest",1)
block=block.replace(' const begg = PublicationBias.beggTest', " const begg = r.studies.length < 2 ? {z: NaN, p: NaN} : PublicationBias.beggTest",1)
# trim-and-fill computation is unchanged; only display its CI using the saved level.
block=block.replace('getConfZ()', 'Stats.normalQuantile(1 - (1 - view.level) / 2)')
block=block.replace(' // Announce results to screen readers',' renderIPDFittedNarratives(r, view, egger, begg);\n\n // Announce results to screen readers',1)
t=t[:a]+block+t[b:]
assert 'Moderate heterogeneity detected (I² = 45.2%)' not in t
p.write_bytes(t.encode('utf-8'))
print('Updated saved-result display and interval rendering; estimator functions unchanged.')
