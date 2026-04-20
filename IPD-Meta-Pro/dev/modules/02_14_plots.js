const Plots = {



 drawForest: (canvas, studies, pooled, options = {}) => {

 if (!canvas) return;

 const ctx = canvas.getContext('2d');

 if (!ctx) return;

 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);

 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);

 ctx.scale(2, 2);



 const w = width / 2;

 const h = height / 2;

 const margin = PlotDefaults.forest();

 const plotWidth = w - margin.left - margin.right;

 const plotHeight = h - margin.top - margin.bottom;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary').trim();

 ctx.fillRect(0, 0, w, h);



 const allEffects = [...studies.map(s => s.effect), ...studies.map(s => s.lower), ...studies.map(s => s.upper), pooled.effect, pooled.lower, pooled.upper];

 const minEffect = Math.min(...allEffects) - 0.1;

 const maxEffect = Math.max(...allEffects) + 0.1;

 const scale = plotWidth / (maxEffect - minEffect);

 const toX = (effect) => margin.left + (effect - minEffect) * scale;



 const rowHeight = plotHeight / (studies.length + 2);



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.lineWidth = 1;

 ctx.setLineDash([5, 5]);

 const nullX = toX(options.nullValue || 0);

 ctx.beginPath();

 ctx.moveTo(nullX, margin.top);

 ctx.lineTo(nullX, h - margin.bottom);

 ctx.stroke();

 ctx.setLineDash([]);



 ctx.font = '11px Segoe UI';

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary').trim();



 studies.forEach((study, i) => {

 const y = margin.top + (i + 0.5) * rowHeight;



 ctx.textAlign = 'right';

 ctx.fillText(study.name, margin.left - 10, y + 4);



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 ctx.lineWidth = 1.5;

 ctx.beginPath();

 ctx.moveTo(toX(study.lower), y);

 ctx.lineTo(toX(study.upper), y);

 ctx.stroke();



 const squareSize = Math.sqrt(study.weight) * 15;

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 ctx.fillRect(toX(study.effect) - squareSize / 2, y - squareSize / 2, squareSize, squareSize);



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();

 ctx.textAlign = 'left';

 ctx.fillText(`${study.effect.toFixed(2)} [${study.lower.toFixed(2)}, ${study.upper.toFixed(2)}]`, w - margin.right + 10, y + 4);

 });



 const pooledY = margin.top + (studies.length + 0.5) * rowHeight;



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border-color').trim();

 ctx.beginPath();

 ctx.moveTo(margin.left, pooledY - rowHeight / 2);

 ctx.lineTo(w - margin.right, pooledY - rowHeight / 2);

 ctx.stroke();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-success').trim();

 ctx.beginPath();

 ctx.moveTo(toX(pooled.lower), pooledY);

 ctx.lineTo(toX(pooled.effect), pooledY - 8);

 ctx.lineTo(toX(pooled.upper), pooledY);

 ctx.lineTo(toX(pooled.effect), pooledY + 8);

 ctx.closePath();

 ctx.fill();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary').trim();

 ctx.textAlign = 'right';

 ctx.font = 'bold 11px Segoe UI';

 ctx.fillText('Pooled', margin.left - 10, pooledY + 4);



 ctx.textAlign = 'left';

 ctx.fillText(`${pooled.effect.toFixed(2)} [${pooled.lower.toFixed(2)}, ${pooled.upper.toFixed(2)}]`, w - margin.right + 10, pooledY + 4);



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.lineWidth = 1;

 ctx.beginPath();

 ctx.moveTo(margin.left, h - margin.bottom);

 ctx.lineTo(w - margin.right, h - margin.bottom);

 ctx.stroke();



 ctx.font = '10px Segoe UI';

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.textAlign = 'center';

 const tickCount = 5;

 for (let i = 0; i <= tickCount; i++) {

 const val = minEffect + (maxEffect - minEffect) * i / tickCount;

 const x = toX(val);

 ctx.beginPath();

 ctx.moveTo(x, h - margin.bottom);

 ctx.lineTo(x, h - margin.bottom + 5);

 ctx.stroke();

 ctx.fillText(val.toFixed(2), x, h - margin.bottom + 18);

 }

 },



 drawFunnel: (canvas, effects, se, pooled, options = {}) => {

 if (!canvas) return;

 const ctx = canvas.getContext('2d');

 if (!ctx) return;

 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);

 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);

 ctx.scale(2, 2);



 const w = width / 2;

 const h = height / 2;

 const margin = PlotDefaults.standard();

 const plotWidth = w - margin.left - margin.right;

 const plotHeight = h - margin.top - margin.bottom;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary').trim();

 ctx.fillRect(0, 0, w, h);



 const maxSE = Math.max(...se) * 1.1;

 const effectRange = Math.max(...effects.map(e => Math.abs(e - pooled))) * 1.5;



 const toX = (effect) => margin.left + plotWidth / 2 + (effect - pooled) * plotWidth / (2 * effectRange);

 const toY = (s) => margin.top + (s / maxSE) * plotHeight;



 if (options.showContour) {



 const levels = [0.01, 0.05, 0.1];

 levels.forEach((level, i) => {

 const z = Stats.normalQuantile(1 - level / 2);

 ctx.fillStyle = `rgba(99, 102, 241, ${0.05 + i * 0.03})`;

 ctx.beginPath();

 ctx.moveTo(toX(pooled), margin.top);

 ctx.lineTo(toX(pooled + z * maxSE), margin.top + plotHeight);

 ctx.lineTo(toX(pooled - z * maxSE), margin.top + plotHeight);

 ctx.closePath();

 ctx.fill();

 });

 }



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.setLineDash([5, 5]);

 ctx.lineWidth = 1;

 ctx.beginPath();

 ctx.moveTo(toX(pooled), margin.top);

 ctx.lineTo(toX(pooled + getConfZ() *maxSE), margin.top + plotHeight);

 ctx.moveTo(toX(pooled), margin.top);

 ctx.lineTo(toX(pooled - getConfZ() *maxSE), margin.top + plotHeight);

 ctx.stroke();

 ctx.setLineDash([]);



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 ctx.lineWidth = 2;

 ctx.beginPath();

 ctx.moveTo(toX(pooled), margin.top);

 ctx.lineTo(toX(pooled), margin.top + plotHeight);

 ctx.stroke();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 effects.forEach((e, i) => {

 ctx.beginPath();

 ctx.arc(toX(e), toY(se[i]), 5, 0, Math.PI * 2);

 ctx.fill();

 });



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.lineWidth = 1;



 ctx.beginPath();

 ctx.moveTo(margin.left, margin.top + plotHeight);

 ctx.lineTo(w - margin.right, margin.top + plotHeight);

 ctx.stroke();



 ctx.beginPath();

 ctx.moveTo(margin.left, margin.top);

 ctx.lineTo(margin.left, margin.top + plotHeight);

 ctx.stroke();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();

 ctx.font = '11px Segoe UI';

 ctx.textAlign = 'center';

 ctx.fillText('Effect Size', w / 2, h - 10);



 ctx.save();

 ctx.translate(15, h / 2);

 ctx.rotate(-Math.PI / 2);

 ctx.fillText('Standard Error', 0, 0);

 ctx.restore();

 },



 drawSurvival: (canvas, curves, options = {}) => {

 if (!canvas) return;

 const ctx = canvas.getContext('2d');

 if (!ctx) return;

 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);

 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);

 ctx.scale(2, 2);



 const w = width / 2;

 const h = height / 2;

 const margin = PlotDefaults.standardDeep();

 const plotWidth = w - margin.left - margin.right;

 const plotHeight = h - margin.top - margin.bottom;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary').trim();

 ctx.fillRect(0, 0, w, h);



 const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];

 const maxTime = Math.max(...curves.flatMap(c => c.data.map(d => d.time)));



 const toX = (time) => margin.left + (time / maxTime) * plotWidth;

 const toY = (surv) => margin.top + (1 - surv) * plotHeight;



 curves.forEach((curve, curveIdx) => {

 const color = colors[curveIdx % colors.length];



 if (options.showCI) {

 ctx.fillStyle = color + '20';

 ctx.beginPath();

 curve.data.forEach((d, i) => {

 if (i === 0) ctx.moveTo(toX(d.time), toY(d.ciUpper));

 else {

 const prev = curve.data[i - 1];

 ctx.lineTo(toX(d.time), toY(prev.ciUpper));

 ctx.lineTo(toX(d.time), toY(d.ciUpper));

 }

 });

 for (let i = curve.data.length - 1; i >= 0; i--) {

 const d = curve.data[i];

 if (i === curve.data.length - 1) ctx.lineTo(toX(d.time), toY(d.ciLower));

 else {

 const next = curve.data[i + 1];

 ctx.lineTo(toX(next.time), toY(d.ciLower));

 ctx.lineTo(toX(d.time), toY(d.ciLower));

 }

 }

 ctx.closePath();

 ctx.fill();

 }



 ctx.strokeStyle = color;

 ctx.lineWidth = 2;

 ctx.beginPath();

 curve.data.forEach((d, i) => {

 if (i === 0) ctx.moveTo(toX(d.time), toY(d.survival));

 else {

 const prev = curve.data[i - 1];

 ctx.lineTo(toX(d.time), toY(prev.survival));

 ctx.lineTo(toX(d.time), toY(d.survival));

 }

 });

 ctx.stroke();



 ctx.strokeStyle = color;

 ctx.lineWidth = 1;

 curve.data.forEach(d => {

 if (d.censored > 0) {

 ctx.beginPath();

 ctx.moveTo(toX(d.time), toY(d.survival) - 5);

 ctx.lineTo(toX(d.time), toY(d.survival) + 5);

 ctx.stroke();

 }

 });

 });



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.lineWidth = 1;



 ctx.beginPath();

 ctx.moveTo(margin.left, margin.top);

 ctx.lineTo(margin.left, margin.top + plotHeight);

 ctx.lineTo(w - margin.right, margin.top + plotHeight);

 ctx.stroke();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.font = '10px Segoe UI';

 ctx.textAlign = 'right';

 for (let i = 0; i <= 10; i++) {

 const y = margin.top + (i / 10) * plotHeight;

 ctx.beginPath();

 ctx.moveTo(margin.left - 5, y);

 ctx.lineTo(margin.left, y);

 ctx.stroke();

 ctx.fillText((1 - i / 10).toFixed(1), margin.left - 8, y + 4);

 }



 ctx.textAlign = 'center';

 const tickInterval = Math.ceil(maxTime / 5);

 for (let t = 0; t <= maxTime; t += tickInterval) {

 const x = toX(t);

 ctx.beginPath();

 ctx.moveTo(x, margin.top + plotHeight);

 ctx.lineTo(x, margin.top + plotHeight + 5);

 ctx.stroke();

 ctx.fillText(t.toString(), x, margin.top + plotHeight + 18);

 }



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();

 ctx.font = '11px Segoe UI';

 ctx.textAlign = 'center';

 ctx.fillText('Time', w / 2, h - 10);



 ctx.save();

 ctx.translate(15, h / 2);

 ctx.rotate(-Math.PI / 2);

 ctx.fillText('Survival Probability', 0, 0);

 ctx.restore();



 ctx.textAlign = 'left';

 curves.forEach((curve, i) => {

 const y = margin.top + 15 + i * 20;

 ctx.fillStyle = colors[i % colors.length];

 ctx.fillRect(w - margin.right - 100, y - 8, 15, 3);

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();

 ctx.fillText(curve.name, w - margin.right - 80, y);

 });

 },



 drawTrace: (canvas, samples, options = {}) => {

 if (!canvas) return;

 const ctx = canvas.getContext('2d');

 if (!ctx) return;

 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);

 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);

 ctx.scale(2, 2);



 const w = width / 2;

 const h = height / 2;

 const margin = PlotDefaults.compact();

 const plotWidth = w - margin.left - margin.right;

 const plotHeight = h - margin.top - margin.bottom;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary').trim();

 ctx.fillRect(0, 0, w, h);



 const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];

 const minVal = Math.min(...samples.flat());

 const maxVal = Math.max(...samples.flat());

 const range = maxVal - minVal || 1;



 samples.forEach((chain, chainIdx) => {

 ctx.strokeStyle = colors[chainIdx % colors.length];

 ctx.lineWidth = 0.5;

 ctx.beginPath();



 chain.forEach((val, i) => {

 const x = margin.left + (i / chain.length) * plotWidth;

 const y = margin.top + plotHeight - ((val - minVal) / range) * plotHeight;

 if (i === 0) ctx.moveTo(x, y);

 else ctx.lineTo(x, y);

 });



 ctx.stroke();

 });



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.lineWidth = 1;

 ctx.beginPath();

 ctx.moveTo(margin.left, margin.top);

 ctx.lineTo(margin.left, h - margin.bottom);

 ctx.lineTo(w - margin.right, h - margin.bottom);

 ctx.stroke();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.font = '10px Segoe UI';

 ctx.textAlign = 'center';

 ctx.fillText('Iteration', w / 2, h - 10);

 },



 drawDensity: (canvas, samples, options = {}) => {

 if (!canvas) return;

 const ctx = canvas.getContext('2d');

 if (!ctx) return;

 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);

 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);

 ctx.scale(2, 2);



 const w = width / 2;

 const h = height / 2;

 const margin = PlotDefaults.compact();

 const plotWidth = w - margin.left - margin.right;

 const plotHeight = h - margin.top - margin.bottom;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary').trim();

 ctx.fillRect(0, 0, w, h);



 const allSamples = samples.flat();

 const bandwidth = 1.06 * Stats.sd(allSamples, 1) * Math.pow(allSamples.length, -0.2);

 const minVal = Math.min(...allSamples) - 3 * bandwidth;

 const maxVal = Math.max(...allSamples) + 3 * bandwidth;



 const nPoints = 200;

 const density = [];

 let maxDensity = 0;



 for (let i = 0; i < nPoints; i++) {

 const x = minVal + (i / nPoints) * (maxVal - minVal);

 let d = 0;

 for (const s of allSamples) {

 d += Stats.normalPDF((x - s) / bandwidth);

 }

 d /= (allSamples.length * bandwidth);

 density.push({ x, d });

 maxDensity = Math.max(maxDensity, d);

 }



 ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';

 ctx.strokeStyle = '#6366f1';

 ctx.lineWidth = 2;

 ctx.beginPath();



 density.forEach((pt, i) => {

 const x = margin.left + ((pt.x - minVal) / (maxVal - minVal)) * plotWidth;

 const y = margin.top + plotHeight - (pt.d / maxDensity) * plotHeight;

 if (i === 0) {

 ctx.moveTo(x, margin.top + plotHeight);

 ctx.lineTo(x, y);

 } else {

 ctx.lineTo(x, y);

 }

 });



 ctx.lineTo(margin.left + plotWidth, margin.top + plotHeight);

 ctx.closePath();

 ctx.fill();

 ctx.stroke();



 const lower = Stats.quantile(allSamples, 0.025);

 const upper = Stats.quantile(allSamples, 0.975);

 const median = Stats.median(allSamples);



 ctx.strokeStyle = '#ef4444';

 ctx.setLineDash([5, 5]);

 [lower, upper].forEach(val => {

 const x = margin.left + ((val - minVal) / (maxVal - minVal)) * plotWidth;

 ctx.beginPath();

 ctx.moveTo(x, margin.top);

 ctx.lineTo(x, margin.top + plotHeight);

 ctx.stroke();

 });



 ctx.strokeStyle = '#10b981';

 const medX = margin.left + ((median - minVal) / (maxVal - minVal)) * plotWidth;

 ctx.beginPath();

 ctx.moveTo(medX, margin.top);

 ctx.lineTo(medX, margin.top + plotHeight);

 ctx.stroke();

 ctx.setLineDash([]);



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.lineWidth = 1;

 ctx.beginPath();

 ctx.moveTo(margin.left, margin.top + plotHeight);

 ctx.lineTo(w - margin.right, margin.top + plotHeight);

 ctx.stroke();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.font = '10px Segoe UI';

 ctx.textAlign = 'center';

 ctx.fillText('Effect', w / 2, h - 10);

 },



 drawNetwork: (canvas, nodes, edges) => {

 const ctx = canvas.getContext('2d');

 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);

 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);

 ctx.scale(2, 2);



 const w = width / 2;

 const h = height / 2;

 const centerX = w / 2;

 const centerY = h / 2;

 const radius = Math.min(w, h) * 0.35;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary').trim();

 ctx.fillRect(0, 0, w, h);



 const nodePositions = nodes.map((node, i) => ({

 ...node,

 x: centerX + radius * Math.cos(2 * Math.PI * i / nodes.length - Math.PI / 2),

 y: centerY + radius * Math.sin(2 * Math.PI * i / nodes.length - Math.PI / 2)

 }));



 edges.forEach(edge => {

 const from = nodePositions.find(n => n.id === edge.from);

 const to = nodePositions.find(n => n.id === edge.to);

 if (from && to) {

 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border-color').trim();

 ctx.lineWidth = Math.sqrt(edge.weight) * 2;

 ctx.beginPath();

 ctx.moveTo(from.x, from.y);

 ctx.lineTo(to.x, to.y);

 ctx.stroke();



 if (edge.label) {

 const midX = (from.x + to.x) / 2;

 const midY = (from.y + to.y) / 2;

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.font = '10px Segoe UI';

 ctx.textAlign = 'center';

 ctx.fillText(edge.label, midX, midY);

 }

 }

 });



 nodePositions.forEach(node => {

 const nodeRadius = Math.sqrt(node.size) * 3 + 15;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 ctx.beginPath();

 ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);

 ctx.fill();



 ctx.fillStyle = 'white';

 ctx.font = 'bold 11px Segoe UI';

 ctx.textAlign = 'center';

 ctx.textBaseline = 'middle';

 ctx.fillText(node.label, node.x, node.y);

 });

 },



 // L'Abbé plot (for binary outcomes)

 drawLabbe: (canvas, studies, options = {}) => {

 const ctx = canvas.getContext('2d');

 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);

 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);

 ctx.scale(2, 2);



 const w = width / 2, h = height / 2;

 const margin = PlotDefaults.standard();

 const plotWidth = w - margin.left - margin.right;

 const plotHeight = h - margin.top - margin.bottom;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary').trim();

 ctx.fillRect(0, 0, w, h);



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.setLineDash([5, 5]);

 ctx.beginPath();

 ctx.moveTo(margin.left, margin.top + plotHeight);

 ctx.lineTo(margin.left + plotWidth, margin.top);

 ctx.stroke();

 ctx.setLineDash([]);



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 studies.forEach(s => {

 const x = margin.left + s.controlRate * plotWidth;

 const y = margin.top + (1 - s.treatmentRate) * plotHeight;

 const r = Math.sqrt(s.weight) * 20;

 ctx.globalAlpha = 0.7;

 ctx.beginPath();

 ctx.arc(x, y, r, 0, Math.PI * 2);

 ctx.fill();

 });

 ctx.globalAlpha = 1;



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.lineWidth = 1;

 ctx.beginPath();

 ctx.moveTo(margin.left, margin.top);

 ctx.lineTo(margin.left, h - margin.bottom);

 ctx.lineTo(w - margin.right, h - margin.bottom);

 ctx.stroke();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.font = '11px Segoe UI';

 ctx.textAlign = 'center';

 ctx.fillText('Control Event Rate', w / 2, h - 10);

 ctx.save();

 ctx.translate(15, h / 2);

 ctx.rotate(-Math.PI / 2);

 ctx.fillText('Treatment Event Rate', 0, 0);

 ctx.restore();

 },



 drawGalbraith: (canvas, effects, se, pooled, options = {}) => {

 const ctx = canvas.getContext('2d');

 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);

 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);

 ctx.scale(2, 2);



 const w = width / 2, h = height / 2;

 const margin = PlotDefaults.standard();

 const plotWidth = w - margin.left - margin.right;

 const plotHeight = h - margin.top - margin.bottom;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary').trim();

 ctx.fillRect(0, 0, w, h);



 const precision = se.map(s => 1 / s);

 const standardized = effects.map((e, i) => e / se[i]);

 const maxPrec = Math.max(...precision) * 1.1;

 const minZ = Math.min(...standardized) - 1;

 const maxZ = Math.max(...standardized) + 1;



 const toX = (prec) => margin.left + (prec / maxPrec) * plotWidth;

 const toY = (z) => margin.top + plotHeight - ((z - minZ) / (maxZ - minZ)) * plotHeight;



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 ctx.lineWidth = 2;

 ctx.beginPath();

 ctx.moveTo(margin.left, toY(0));

 ctx.lineTo(margin.left + plotWidth, toY(pooled * maxPrec));

 ctx.stroke();



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.setLineDash([5, 5]);

 ctx.beginPath();

 ctx.moveTo(margin.left, toY(-getConfZ()));

 ctx.lineTo(margin.left + plotWidth, toY(-getConfZ()));

 ctx.moveTo(margin.left, toY(getConfZ()));

 ctx.lineTo(margin.left + plotWidth, toY(getConfZ()));

 ctx.stroke();

 ctx.setLineDash([]);



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 effects.forEach((e, i) => {

 ctx.beginPath();

 ctx.arc(toX(precision[i]), toY(standardized[i]), 5, 0, Math.PI * 2);

 ctx.fill();

 });



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.lineWidth = 1;

 ctx.beginPath();

 ctx.moveTo(margin.left, margin.top);

 ctx.lineTo(margin.left, h - margin.bottom);

 ctx.lineTo(w - margin.right, h - margin.bottom);

 ctx.stroke();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.font = '11px Segoe UI';

 ctx.textAlign = 'center';

 ctx.fillText('1 / SE (Precision)', w / 2, h - 10);

 ctx.save();

 ctx.translate(15, h / 2);

 ctx.rotate(-Math.PI / 2);

 ctx.fillText('z-score (Effect / SE)', 0, 0);

 ctx.restore();

 },



 drawBaujat: (canvas, studies, heterogeneityContrib, influenceOnResult, options = {}) => {

 const ctx = canvas.getContext('2d');

 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);

 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);

 ctx.scale(2, 2);



 const w = width / 2, h = height / 2;

 const margin = PlotDefaults.standard();

 const plotWidth = w - margin.left - margin.right;

 const plotHeight = h - margin.top - margin.bottom;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary').trim();

 ctx.fillRect(0, 0, w, h);



 const maxX = Math.max(...heterogeneityContrib) * 1.1;

 const maxY = Math.max(...influenceOnResult) * 1.1;



 const toX = (x) => margin.left + (x / maxX) * plotWidth;

 const toY = (y) => margin.top + plotHeight - (y / maxY) * plotHeight;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 ctx.font = '10px Segoe UI';

 studies.forEach((s, i) => {

 const x = toX(heterogeneityContrib[i]);

 const y = toY(influenceOnResult[i]);

 ctx.beginPath();

 ctx.arc(x, y, 6, 0, Math.PI * 2);

 ctx.fill();

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();

 ctx.textAlign = 'left';

 ctx.fillText(s, x + 8, y + 3);

 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 });



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.lineWidth = 1;

 ctx.beginPath();

 ctx.moveTo(margin.left, margin.top);

 ctx.lineTo(margin.left, h - margin.bottom);

 ctx.lineTo(w - margin.right, h - margin.bottom);

 ctx.stroke();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.font = '11px Segoe UI';

 ctx.textAlign = 'center';

 ctx.fillText('Contribution to Overall Heterogeneity', w / 2, h - 10);

 ctx.save();

 ctx.translate(15, h / 2);

 ctx.rotate(-Math.PI / 2);

 ctx.fillText('Influence on Overall Result', 0, 0);

 ctx.restore();

 },



 drawCumulative: (canvas, studies, effects, cumulativeEffects, cumulativeCIs, options = {}) => {

 const ctx = canvas.getContext('2d');

 const width = canvas.width = Math.max(canvas.offsetWidth * 2, 800);

 const height = canvas.height = Math.max(canvas.offsetHeight * 2, 600);

 ctx.scale(2, 2);



 const w = width / 2, h = height / 2;

 const margin = PlotDefaults.rightInfo();

 const plotWidth = w - margin.left - margin.right;

 const plotHeight = h - margin.top - margin.bottom;



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary').trim();

 ctx.fillRect(0, 0, w, h);



 const allVals = [...cumulativeEffects, ...cumulativeCIs.map(c => c[0]), ...cumulativeCIs.map(c => c[1])];

 const minVal = Math.min(...allVals) - 0.1;

 const maxVal = Math.max(...allVals) + 0.1;

 const rowHeight = plotHeight / studies.length;



 const toX = (v) => margin.left + ((v - minVal) / (maxVal - minVal)) * plotWidth;



 const nullVal = options.nullValue || 0;

 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.setLineDash([5, 5]);

 ctx.beginPath();

 ctx.moveTo(toX(nullVal), margin.top);

 ctx.lineTo(toX(nullVal), h - margin.bottom);

 ctx.stroke();

 ctx.setLineDash([]);



 ctx.font = '10px Segoe UI';

 studies.forEach((study, i) => {

 const y = margin.top + (i + 0.5) * rowHeight;

 const effect = cumulativeEffects[i];

 const ci = cumulativeCIs[i];



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();

 ctx.textAlign = 'right';

 ctx.fillText(`+ ${study}`, margin.left - 10, y + 4);



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 ctx.lineWidth = 1.5;

 ctx.beginPath();

 ctx.moveTo(toX(ci[0]), y);

 ctx.lineTo(toX(ci[1]), y);

 ctx.stroke();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-primary').trim();

 ctx.beginPath();

 ctx.arc(toX(effect), y, 4, 0, Math.PI * 2);

 ctx.fill();



 ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.textAlign = 'left';

 ctx.fillText(effect.toFixed(2), w - margin.right + 10, y + 4);

 });



 ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim();

 ctx.lineWidth = 1;

 ctx.beginPath();

 ctx.moveTo(margin.left, h - margin.bottom);

 ctx.lineTo(w - margin.right, h - margin.bottom);

 ctx.stroke();

 }

 };



 document.querySelectorAll('.nav-tab').forEach(tab => {

 tab.addEventListener('click', () => {

 document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

 document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));



 tab.classList.add('active');

 const panelId = 'panel-' + tab.dataset.panel;

 document.getElementById(panelId)?.classList.add('active');

 });

 });



 document.querySelectorAll('.inner-tab').forEach(tab => {

 tab.addEventListener('click', () => {

 const parent = tab.closest('.card');

 if (parent) {

 parent.querySelectorAll('.inner-tab').forEach(t => t.classList.remove('active'));

 tab.classList.add('active');

 }

 });

 });



 function toggleTheme() {

 document.body.classList.toggle('light-theme');

 localStorage.setItem('theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');

 }



 if (localStorage.getItem('theme') === 'light') {

 document.body.classList.add('light-theme');

 }



 const dropZone = document.getElementById('dropZone');

 const fileInput = document.getElementById('fileInput');



 dropZone.addEventListener('dragover', (e) => {

 e.preventDefault();

 dropZone.classList.add('dragover');

 });



 dropZone.addEventListener('dragleave', () => {

 dropZone.classList.remove('dragover');

 });



 dropZone.addEventListener('drop', (e) => {

 e.preventDefault();

 dropZone.classList.remove('dragover');

 const file = e.dataTransfer.files[0];

 if (file) handleFile(file);

 });



 fileInput.addEventListener('change', (e) => {

 const file = e.target.files[0];

 if (file) handleFile(file);

 });



 function handleFile(file) {

 const reader = new FileReader();

 const isExcel = file.name.match(/\.(xlsx?|xls)$/i);



 reader.onload = (e) => {

 let parsed;

 try {

 if (isExcel && typeof XLSX !== 'undefined') {

 const data = new Uint8Array(e.target.result);

 const workbook = XLSX.read(data, { type: 'array' });

 const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

 const jsonData = XLSX.utils.sheet_to_json(firstSheet);

 if (jsonData.length > 0) {

 parsed = { headers: Object.keys(jsonData[0]), data: jsonData };

 }

 } else if (file.name.endsWith('.json')) {

 const jsonData = JSON.parse(e.target.result);

 if (Array.isArray(jsonData) && jsonData.length > 0) {

 parsed = { headers: Object.keys(jsonData[0]), data: jsonData };

 }

 } else {

 const text = e.target.result;

 const delimiter = file.name.endsWith('.tsv') ? '\t' : ',';

 parsed = parseDelimited(text, delimiter);

 }



 if (parsed && parsed.data.length > 0) {

 APP.data = parsed.data;

 APP.variables = detectVariableTypes(parsed.data, parsed.headers);

 displayData();

 showNotification(`Loaded ${APP.data.length} records`, 'success');

 scheduleAdoptionBoosterAfterDataLoad('file_upload:' + (file && file.name ? file.name : 'unknown'), {
 delayMs: 220,
 silent: true
 });

 } else {

 showNotification('No data found in file', 'error');

 }

 } catch (err) {

 showNotification('Error parsing file: ' + err.message, 'error');

 }

 };



 if (isExcel) reader.readAsArrayBuffer(file);

 else reader.readAsText(file);

 }



function parseDelimited(text, delimiter = ',') {

 const lines = text.split(/\r?\n/).filter(line => line.trim());

 const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

 const data = [];

 for (let i = 1; i < lines.length; i++) {

 const regex = delimiter === ',' ? /("([^"]|"")*"|[^,]*)/g : /[^\t]+/g;

 const values = lines[i].match(regex) || [];

 const row = {};

 headers.forEach((h, j) => {

 let val = (values[j] || '').trim().replace(/^["']|["']$/g, '');

 const num = parseFloat(val);

 row[h] = isNaN(num) ? val : num;

 });

 data.push(row);

 }

 return { headers, data };

}



function escapeHTML(value) {

 if (value === null || value === undefined) return '';

 return String(value)

   .replace(/&/g, '&amp;')

   .replace(/</g, '&lt;')

   .replace(/>/g, '&gt;')

   .replace(/"/g, '&quot;')

   .replace(/'/g, '&#39;');

}



/* moved to dev/modules/export_schema_module.js: function getPooledEffectValue */

/* moved to dev/modules/export_schema_module.js: function getPooledPValue */

/* moved to dev/modules/export_schema_module.js: function normalizeResultsSchema */

/* moved to dev/modules/export_schema_module.js: function escapeCSV */

/* moved to dev/modules/export_schema_module.js: function buildCSVRow */

function getVarName(v) {

 return (v && typeof v === 'object' && v.name) ? v.name : v;

}



function toNumberOrNull(value) {

 const n = Number(value);

 return Number.isFinite(n) ? n : null;

}



function parseBinary(value) {

 if (value === 1 || value === '1' || value === true) return 1;

 if (value === 0 || value === '0' || value === false) return 0;

 if (typeof value === 'number' && Number.isFinite(value)) return value === 0 ? 0 : 1;

 if (typeof value === 'string') {

 const t = value.trim().toLowerCase();

 const n = Number(t);

 if (Number.isFinite(n)) return n === 0 ? 0 : 1;

 if (t === 'treatment' || t === 'treated' || t === 'tx' || t === 'active') return 1;

 if (t === 'control' || t === 'placebo') return 0;

 }

 return null;

}



function showNotification(message, type = 'info') {

 const existing = document.querySelector('.notification');

 if (existing) existing.remove();

 const notif = document.createElement('div');

 notif.className = 'notification';

 notif.textContent = message;

 notif.style.cssText = `position:fixed;top:80px;right:20px;padding:1rem 1.5rem;border-radius:8px;z-index:1001;

 background:${type==='success'?'var(--accent-success)':type==='error'?'var(--accent-danger)':'var(--accent-info)'};

 color:white;font-weight:500;box-shadow:var(--shadow-lg);animation:fadeIn 0.3s ease;`;

 document.body.appendChild(notif);

 setTimeout(() => { notif.style.opacity = '0'; setTimeout(() => notif.remove(), 300); }, 3000);

 }


function computeCurrentDataFingerprint() {
 const rows = Array.isArray(APP.data) ? APP.data : [];
 if (!rows.length) return 'no_data';
 const first = rows[0] || {};
 const keys = Object.keys(first).sort();
 const colSig = keys.join('|');
 const keySlice = keys.slice(0, 8);
 let sampleSig = '';
 const sampleRows = Math.min(rows.length, 3);
 for (let i = 0; i < sampleRows; i++) {
 const r = rows[i] || {};
 const seg = keySlice.map(function(k) {
 const v = r[k];
 if (v === null || v === undefined) return '';
 if (typeof v === 'object') return JSON.stringify(v).slice(0, 24);
 return String(v).slice(0, 24);
 }).join('|');
 sampleSig += '[' + seg + ']';
 }
 return rows.length + '|' + keys.length + '|' + colSig + '|' + sampleSig.slice(0, 240);
}

function ipdCountDistinctValues(field, scanLimit) {
 if (!field || !Array.isArray(APP.data) || APP.data.length === 0) return 0;
 const limit = Math.max(1000, Number(scanLimit) || 25000);
 const seen = new Set();
 const max = Math.min(APP.data.length, limit);
 for (let i = 0; i < max; i++) {
 const row = APP.data[i];
 if (!row) continue;
 const v = row[field];
 if (v === null || v === undefined || v === '') continue;
 seen.add(String(v));
 if (seen.size > 5000) break;
 }
 return seen.size;
}

function runAdoptionBoosterAfterDataLoad(source, options) {
 const opts = options || {};
 if (!APP.config || APP.config.firstRunAdoptionBoosterEnabled === false) {
 return { skipped: true, reason: 'disabled' };
 }
 if (!Array.isArray(APP.data) || APP.data.length === 0) {
 return { skipped: true, reason: 'no_data' };
 }

 const src = String(source || 'unspecified');
 const now = Date.now();
 const fingerprint = computeCurrentDataFingerprint();
 const prev = APP.firstRunBoosterState || {};
 if (prev.lastSource === src && prev.lastFingerprint === fingerprint && (now - Number(prev.lastRunAt || 0)) < 2500) {
 return { skipped: true, reason: 'duplicate_recent_run', source: src };
 }

 const report = {
 source: src,
 startedAt: new Date().toISOString(),
 dataFingerprint: fingerprint,
 mapPass: null,
 strictQCPass: null,
 strictQCScore: null,
 studyCount: 0,
 ranAnalysis: false,
 analysisReady: !!(APP.results && APP.results.pooled),
 externalBundleReady: false,
 verificationBundleReady: false,
 adoptionForecastReady: false,
 skippedReason: null
 };

 let mapReport = null;
 if (typeof ipd80AutoMapVariables === 'function') {
 try {
 mapReport = ipd80AutoMapVariables({ silent: true });
 report.mapPass = !!(mapReport && mapReport.pass);
 } catch (e) {
 report.mapPass = false;
 report.skippedReason = report.skippedReason || 'auto_map_error';
 }
 }

 let qcReport = null;
 if (typeof runStrictPreAnalysisQCGate === 'function') {
 try {
 qcReport = runStrictPreAnalysisQCGate({ silent: true, mode: 'first_run_booster' });
 APP.lastStrictQCReport = qcReport;
 report.strictQCPass = !!(qcReport && qcReport.pass);
 report.strictQCScore = Number(qcReport && qcReport.qualityScore);
 } catch (e) {
 report.strictQCPass = false;
 report.skippedReason = report.skippedReason || 'qc_error';
 }
 }

 const vars = (typeof ipd80GetCurrentVars === 'function') ? ipd80GetCurrentVars() : {};
 const mappedStudyVar = mapReport && mapReport.mapped ? mapReport.mapped.varStudy : '';
 const studyVar = vars.studyVar || mappedStudyVar || (APP.config && APP.config.studyVar) || '';
 report.studyCount = ipdCountDistinctValues(studyVar, 30000);

 const allowAutoRun = APP.config.firstRunAdoptionBoosterAutoRun !== false && !opts.skipAutoRun;
 const alreadyAnalyzed = !!(APP.results && APP.results.pooled) && APP.lastAnalysisDataFingerprint === fingerprint;
 const qcPassForRun = qcReport ? !!qcReport.pass : true;
 const enoughStudies = report.studyCount >= 2;

 if (allowAutoRun && !alreadyAnalyzed && !APP.analysisRunning && qcPassForRun && enoughStudies && typeof runAnalysis === 'function') {
 const preservePanel = APP.config.firstRunAdoptionBoosterPreservePanel !== false;
 const activeTab = preservePanel ? document.querySelector('.nav-tab.active') : null;
 const activePanel = activeTab && activeTab.dataset ? activeTab.dataset.panel : '';
 runAnalysis();
 report.ranAnalysis = true;
 report.analysisReady = !!(APP.results && APP.results.pooled);
 if (preservePanel && activePanel) {
 setTimeout(function() {
 const tab = document.querySelector('.nav-tab[data-panel="' + activePanel + '"]');
 if (tab && typeof tab.click === 'function') tab.click();
 }, 40);
 }
 } else if (!allowAutoRun) {
 report.skippedReason = report.skippedReason || 'auto_run_disabled';
 } else if (alreadyAnalyzed) {
 report.skippedReason = report.skippedReason || 'already_analyzed_for_dataset';
 } else if (APP.analysisRunning) {
 report.skippedReason = report.skippedReason || 'analysis_in_progress';
 } else if (!qcPassForRun) {
 report.skippedReason = report.skippedReason || 'qc_failed';
 } else if (!enoughStudies) {
 report.skippedReason = report.skippedReason || 'insufficient_studies';
 }

 if (APP.config.firstRunAdoptionBoosterBuildBundles !== false) {
 if (typeof buildExternalRevalidationBundleV1 === 'function') {
 try {
 APP.lastExternalRevalidationBundle = buildExternalRevalidationBundleV1();
 report.externalBundleReady = !!APP.lastExternalRevalidationBundle;
 } catch (e) {}
 }
 if (typeof buildIndependentVerificationChallengeBundle === 'function') {
 try {
 APP.lastIndependentVerificationBundle = buildIndependentVerificationChallengeBundle();
 report.verificationBundleReady = !!APP.lastIndependentVerificationBundle;
 } catch (e) {}
 }
 if (typeof buildPersonaAdoptionForecast12 === 'function') {
 try {
 APP.lastPersonaAdoptionForecast12 = buildPersonaAdoptionForecast12();
 report.adoptionForecastReady = !!APP.lastPersonaAdoptionForecast12;
 } catch (e) {}
 }
 }

 report.finishedAt = new Date().toISOString();
 APP.firstRunBoosterState = {
 lastRunAt: now,
 lastSource: src,
 lastFingerprint: fingerprint,
 lastReport: report
 };
 APP.lastAdoptionBoosterReport = report;

 if (!opts.silent) {
 const readyLabel = report.analysisReady ? 'analysis ready' : 'analysis not ready';
 const qcLabel = report.strictQCPass ? 'QC pass' : 'QC pending';
 showNotification('First-run booster: ' + qcLabel + ', ' + readyLabel, report.analysisReady ? 'success' : 'info');
 }
 return report;
}

function scheduleAdoptionBoosterAfterDataLoad(source, options) {
 const opts = Object.assign({ delayMs: 180, silent: true }, options || {});
 if (!APP.config || APP.config.firstRunAdoptionBoosterEnabled === false) return;
 if (APP.adoptionBoosterTimer) clearTimeout(APP.adoptionBoosterTimer);
 const delay = Math.max(0, Number(opts.delayMs) || 0);
 APP.adoptionBoosterTimer = setTimeout(function() {
 APP.adoptionBoosterTimer = null;
 try {
 runAdoptionBoosterAfterDataLoad(source, opts);
 } catch (e) {
 console.warn('[IPD80 booster] post-load run failed:', e);
 }
 }, delay);
}



// =============================================================================

// DATA PAGINATOR - Large Dataset Handling

// =============================================================================

