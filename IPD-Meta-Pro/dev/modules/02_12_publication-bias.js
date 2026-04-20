const PublicationBias = {

 // Egger\'s regression test

 eggerTest: (effects, se) => {

 const n = effects.length;

 const precision = se.map(s => 1 / s);

 const standardized = effects.map((e, i) => e / se[i]);



 const reg = Stats.linearRegression(precision, standardized);

 const t = reg.intercept / reg.seIntercept;

 const p = 2 * (1 - Stats.tCDF(Math.abs(t), n - 2));



 return { intercept: reg.intercept, se: reg.seIntercept, t, p };

 },



 // Begg\'s rank correlation

 beggTest: (effects, variances) => {

 const n = effects.length;

 const se = variances.map(v => Math.sqrt(v));



 const fe = MetaAnalysis.fixedEffect(effects, variances);

 const standardized = effects.map((e, i) => (e - fe.pooled) / se[i]);



 // Kendall's tau

 let concordant = 0, discordant = 0;

 for (let i = 0; i < n; i++) {

 for (let j = i + 1; j < n; j++) {

 const sign1 = Math.sign(standardized[i] - standardized[j]);

 const sign2 = Math.sign(variances[i] - variances[j]);

 if (sign1 * sign2 > 0) concordant++;

 else if (sign1 * sign2 < 0) discordant++;

 }

 }



 const tau = (concordant - discordant) / (n * (n - 1) / 2);

 const z = tau * Math.sqrt(9 * n * (n - 1) / (2 * (2 * n + 5)));

 const p = 2 * (1 - Stats.normalCDF(Math.abs(z)));



 return { tau, z, p };

 },



 trimAndFill: (effects, variances, side = 'auto') => {

 const n = effects.length;

 const fe = MetaAnalysis.fixedEffect(effects, variances);



 const deviations = effects.map(e => e - fe.pooled);

 if (side === 'auto') {

 side = Stats.mean(deviations) > 0 ? 'right' : 'left';

 }



 const ranks = deviations.map(d => side === 'right' ? d : -d)

 .map((d, i) => ({ d: Math.abs(d), i }))

 .sort((a, b) => a.d - b.d)

 .map((x, r) => ({ ...x, rank: r + 1 }));



 let k0 = 0;

 const sortedDeviations = deviations.slice().sort((a, b) => Math.abs(a) - Math.abs(b));



 for (let i = n - 1; i >= 0; i--) {

 const extreme = side === 'right' ? sortedDeviations[i] > 0 : sortedDeviations[i] < 0;

 if (extreme) k0++;

 else break;

 }

 k0 = Math.floor(k0 / 2);



 const imputed = [];

 const indices = ranks.filter(r => (side === 'right' ? deviations[r.i] > 0 : deviations[r.i] < 0))

 .sort((a, b) => b.d - a.d)

 .slice(0, k0);



 for (const idx of indices) {

 imputed.push({

 effect: 2 * fe.pooled - effects[idx.i],

 variance: variances[idx.i]

 });

 }



 const allEffects = [...effects, ...imputed.map(i => i.effect)];

 const allVariances = [...variances, ...imputed.map(i => i.variance)];

 const adjusted = MetaAnalysis.randomEffectsDL(allEffects, allVariances);



 return {

 k0,

 imputedStudies: imputed,

 original: fe,

 adjusted,

 side

 };

 }

 };



 function parseCSV(text) {

 const lines = text.split(/\r?\n/).filter(line => line.trim());

 const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));

 const data = [];



 for (let i = 1; i < lines.length; i++) {

 const values = lines[i].match(/("([^"]|"")*"|[^,]*)/g) || [];

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



function detectVariableTypes(data, headers) {

 return headers.map(h => {

 const values = data.map(row => row[h]).filter(v => v !== '' && v !== null && v !== undefined);

 const numericCount = values.filter(v => typeof v === 'number' || !isNaN(parseFloat(v))).length;

 const uniqueValues = new Set(values);



 if (numericCount / values.length > 0.9 && uniqueValues.size > 10) {

 return { name: h, type: 'numeric', unique: uniqueValues.size };

 } else {

 return { name: h, type: 'categorical', unique: uniqueValues.size, categories: [...uniqueValues] };

 }

 });

 }



 // Shared plot margin presets — avoids 39 duplicated margin definitions

 