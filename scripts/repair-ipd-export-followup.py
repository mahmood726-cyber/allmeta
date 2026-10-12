"""Follow-up after repair-ipd-fitted-display.py: use the same saved fit in SVG."""
from pathlib import Path
import hashlib
p=Path('IPD-Meta-Pro/ipd-meta-pro.html');raw=p.read_bytes()
assert hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()=='2a537ea5ac040e2597a43bafbb2406779e2cef7f'
t=raw.decode()
def once(old,new):
 global t
 assert t.count(old)==1,(old[:100],t.count(old))
 t=t.replace(old,new,1)
once('  const pi = r.pi && [view.transform(r.pi.lower), view.transform(r.pi.upper)];', '  const pi = r.pi && [r.pi.lower, r.pi.upper].every(Number.isFinite)\n   ? [view.transform(r.pi.lower), view.transform(r.pi.upper)] : null;')
once('function downloadCanvas(canvas, name, format) {', '''function downloadCanvas(canvas, name, format) {
 if (!canvas || !canvas.width || !canvas.height) {
  showNotification('Run the required analysis before exporting this plot.', 'warning');
  return;
 }
 if (name === 'forest_plot' && (!APP.results || !getIPDFittedDisplay(APP.results).ci)) {
  showNotification('Saved confidence limits are unavailable. Rerun the analysis before exporting.', 'warning');
  return;
 }''')
once(" const svg = generateForestPlotSVG(canvas, name);", " let svg;\n try { svg = generateForestPlotSVG(canvas, name); }\n catch (error) { showNotification(error.message, 'warning'); return; }")
once(" showNotification('SVG exported for publication', 'success');", " showNotification(name === 'forest_plot' ? 'Vector forest SVG exported from saved results.' : 'Canvas image exported inside an SVG wrapper (not editable vectors).', 'success');")
a=t.index('function generateForestPlotSVG(canvas, name) {');b=t.index('// Fallback: embed canvas',a)
s=t[a:b]
s=s.replace(' const width = canvas.width;\n\n const height = canvas.height;', ''' // Non-forest requests must export that canvas, never substitute a forest.
 if (name !== 'forest_plot') return generateCanvasBackedSVG(canvas, canvas.width, canvas.height);
 const width = Math.max(800, canvas.width);
 const height = Math.max(400, canvas.height, 140 + 30 * (APP.results?.studies?.length || 0));''',1)
s=s.replace(" const isLogScale = APP.config.outcomeType === 'survival' ||\n\n (APP.config.outcomeType === 'binary' && APP.config.effectMeasure !== 'RD');",''' const view = getIPDFittedDisplay(results);
 if (!view.ci || !Number.isFinite(view.effect) || !studies.length) throw new Error('Finite saved confidence limits are required for SVG export.');
 const isLogScale = view.ratio;
 const confPct = Math.round(view.level * 100);''',1)
x=s.index(' // Calculate effect range');y=s.index(' const xScale =',x)
s=s[:x]+''' // Saved intervals are the same as those displayed on screen. Include the
 // null and pad additively; multiplicative padding clips negative intervals.
 const effects = studies.map(s => view.transform(s.effect));
 const lowers = studies.map(s => view.transform(s.lower));
 const uppers = studies.map(s => view.transform(s.upper));
 if (!studies.every(s => [s.effect, s.lower, s.upper].every(Number.isFinite))
     || ![...effects, ...lowers, ...uppers].every(Number.isFinite)) {
  throw new Error('Finite saved study intervals are required for SVG export.');
 }
 const nullValue = isLogScale ? 1 : 0;
 const lo = Math.min(...lowers, view.ci[0], nullValue);
 const hi = Math.max(...uppers, view.ci[1], nullValue);
 const pad = Math.max((hi - lo) * .08, 1e-6);
 const minVal = lo - pad, maxVal = hi + pad;

'''+s[y:]
s=s.replace("${APP.config.effectMeasure || 'Effect Size'}", "${escapeHTML(view.measure)}")
s=s.replace(' const effect = isLogScale ? Math.exp(study.effect) : study.effect;', ' const effect = effects[i];')
s=s.replace(' const lower = isLogScale ? Math.exp(study.effect - getConfZ() *study.se) : study.effect - getConfZ() *study.se;', ' const lower = lowers[i];')
s=s.replace(' const upper = isLogScale ? Math.exp(study.effect + getConfZ() *study.se) : study.effect + getConfZ() *study.se;', ' const upper = uppers[i];')
s=s.replace(' const pooledEffect = isLogScale ? Math.exp(pooled.pooled) : pooled.pooled;', ' const pooledEffect = view.effect;')
s=s.replace(' const pooledLower = isLogScale ? Math.exp(pooled.pooled - getConfZ() *pooled.se) : pooled.pooled - getConfZ() *pooled.se;', ' const pooledLower = view.ci[0];')
s=s.replace(' const pooledUpper = isLogScale ? Math.exp(pooled.pooled + getConfZ() *pooled.se) : pooled.pooled + getConfZ() *pooled.se;', ' const pooledUpper = view.ci[1];')
s=s.replace(" const axisLabel = isLogScale ? `${APP.config.effectMeasure} (favors treatment ←→ favors control)` : 'Effect Size';", " const axisLabel = escapeHTML(view.measure) + (isLogScale ? ' (ratio scale)' : ' (effect scale)');")
s=s.replace('<!-- 95% CI:', '<!-- ${confPct}% CI:')
assert 'getConfZ()' not in s and 'APP.config' not in s
t=t[:a]+s+t[b:]
p.write_bytes(t.encode())
print('SVG and screen now use saved intervals; non-forest exports keep their own graphic.')
