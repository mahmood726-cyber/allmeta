/*
 * Extracted from ipd-meta-pro.html
 * Purpose: isolate schema/export safety logic from monolithic inline script.
 */

function getPooledEffectValue(pooled) {

 if (!pooled || typeof pooled !== 'object') return null;

 const effect = toNumberOrNull(pooled.effect);

 if (effect !== null) return effect;

 return toNumberOrNull(pooled.pooled);

}

function getPooledPValue(pooled, preferHKSJ = false) {

 if (!pooled || typeof pooled !== 'object') return null;

 const pHKSJ = toNumberOrNull(pooled.pHKSJ);

 const p = toNumberOrNull(pooled.p);

 const pValue = toNumberOrNull(pooled.pValue);

 if (preferHKSJ && pHKSJ !== null) return pHKSJ;

 if (p !== null) return p;

 if (pValue !== null) return pValue;

 return pHKSJ;

}

function normalizeResultsSchema(results) {

 if (!results || typeof results !== 'object') return results;



 const studies = Array.isArray(results.studies) ? results.studies : [];

 results.studies = studies;



 const pooled = (results.pooled && typeof results.pooled === 'object') ? results.pooled : null;

 if (pooled) {

  const effect = getPooledEffectValue(pooled);

  if (effect !== null) {

   pooled.effect = effect;

   pooled.pooled = effect;

  }



  const p = toNumberOrNull(pooled.p);

  const pValue = toNumberOrNull(pooled.pValue);

  if (p === null && pValue !== null) pooled.p = pValue;

  if (pValue === null && p !== null) pooled.pValue = p;

 }



 if (toNumberOrNull(results.totalN) === null) {

  results.totalN = studies.reduce(function(sum, s) {

   return sum + (toNumberOrNull(s && s.n) ?? 0);

  }, 0);

 }



 if (!results.heterogeneity || typeof results.heterogeneity !== 'object') {

  results.heterogeneity = {};

 }

 const het = results.heterogeneity;

 const source = pooled || {};



 const resolvedI2 = toNumberOrNull(het.i2);

 const resolvedI2Alt = toNumberOrNull(het.I2);

 const resolvedI2Src = toNumberOrNull(source.I2);

 const i2 = resolvedI2 !== null ? resolvedI2 : (resolvedI2Alt !== null ? resolvedI2Alt : resolvedI2Src);



 const resolvedTau2 = toNumberOrNull(het.tau2);

 const resolvedTau2Src = toNumberOrNull(source.tau2);

 const tau2 = resolvedTau2 !== null ? resolvedTau2 : resolvedTau2Src;



 const resolvedQ = toNumberOrNull(het.q);

 const resolvedQAlt = toNumberOrNull(het.Q);

 const resolvedQSrc = toNumberOrNull(source.Q);

 const q = resolvedQ !== null ? resolvedQ : (resolvedQAlt !== null ? resolvedQAlt : resolvedQSrc);



 const resolvedPHet = toNumberOrNull(het.pHet);

 const resolvedPQ = toNumberOrNull(het.pQ);

 const resolvedPQSrc = toNumberOrNull(source.pQ);

 const pHet = resolvedPHet !== null ? resolvedPHet : (resolvedPQ !== null ? resolvedPQ : resolvedPQSrc);



 if (i2 !== null) {

  het.i2 = i2;

  het.I2 = i2;

 }

 if (tau2 !== null) {

  het.tau2 = tau2;

 }

 if (q !== null) {

  het.q = q;

  het.Q = q;

 }

 if (pHet !== null) {

  het.pHet = pHet;

  het.pQ = pHet;

 }



 return results;

}

function escapeCSV(value, options = {}) {

 const preventFormulaInjection = options.preventFormulaInjection !== false;

 if (value === null || value === undefined) return '';



 let cell = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');



 // Prevent CSV formula injection in spreadsheet tools.

 if (preventFormulaInjection && /^[\t ]*[=+\-@]/.test(cell)) {

  cell = "'" + cell;

 }



 cell = cell.replace(/"/g, '""');

 if (/[",\n]/.test(cell)) {

  return `"${cell}"`;

 }

 return cell;

}



function buildCSVRow(values, options = {}) {

 return values.map(function(v) { return escapeCSV(v, options); }).join(',');

}



function exportAllFormats() {

 if (!APP.results) {

 alert('Run analysis first');

 return;

 }



 APP.results = normalizeResultsSchema(APP.results);



 var exports = [];

 var pooled = APP.results.pooled || {};

 var pooledEffect = getPooledEffectValue(pooled);

 var pooledP = getPooledPValue(pooled, APP.config && APP.config.useHKSJ);

 var totalN = toNumberOrNull(APP.results.totalN);

 if (totalN === null) {

 totalN = (APP.results.studies || []).reduce(function(sum, s) {

 return sum + (toNumberOrNull(s && s.n) ?? 0);

 }, 0);

 }



 var fixedOrBlank = function(value, digits) {

 var num = toNumberOrNull(value);

 return num === null ? '' : num.toFixed(digits);

 };



 var NL = String.fromCharCode(10);

 var csv = 'Study,N,Events,Effect,SE,Lower,Upper,Weight,P-value' + NL;

 (APP.results.studies || []).forEach(function(s) {

 csv += buildCSVRow([

 s.study,

 s.n,

 s.events ?? '',

 fixedOrBlank(s.effect, 4),

 fixedOrBlank(s.se, 4),

 fixedOrBlank(s.lower, 4),

 fixedOrBlank(s.upper, 4),

 fixedOrBlank(s.weight, 4),

 fixedOrBlank(s.p, 6)

 ]) + NL;

 });

 csv += NL + buildCSVRow([

 'Pooled',

 totalN !== null ? totalN : '',

 '',

 fixedOrBlank(pooledEffect, 4),

 fixedOrBlank(pooled.se, 4),

 fixedOrBlank(pooled.lower, 4),

 fixedOrBlank(pooled.upper, 4),

 '1',

 fixedOrBlank(pooledP, 6)

 ]);

 exports.push({ name: 'results.csv', content: csv, type: 'text/csv' });



 if (typeof generateMethodsSection === 'function') {

 var methods = generateMethodsSection(APP.config, APP.results);

 exports.push({ name: 'methods_section.md', content: methods.text, type: 'text/markdown' });

 } else {

 exports.push({

 name: 'methods_section.md',

 content: '# Methods Section\n\nMethod summary export is unavailable in this build.',

 type: 'text/markdown'

 });

 }



 if (typeof generateRCode === 'function') {

 var rCode = generateRCode('two-stage', {

 effects: APP.results.studies.map(function(s) { return s.effect; }),

 variances: APP.results.studies.map(function(s) { return s.se * s.se; }),

 labels: APP.results.studies.map(function(s) { return s.study; })

 }, APP.config);

 exports.push({ name: 'analysis.R', content: rCode, type: 'text/plain' });

 }



 var forestCanvas = document.getElementById('forestPlot');

 if (forestCanvas) {

 exports.push({

 name: 'forest_plot.png',

 content: forestCanvas.toDataURL('image/png').split(',')[1],

 type: 'image/png',

 isBase64: true

 });

 }



 if (typeof generateFullReport === 'function') {

 var report = generateFullReport(APP.results, APP.config);

 exports.push({ name: 'full_report.html', content: report, type: 'text/html' });

 } else {

 exports.push({

 name: 'full_report.html',

 content: '<!doctype html><html><body><h1>IPD Meta-Analysis Export</h1><p>Full report generator is unavailable in this build.</p></body></html>',

 type: 'text/html'

 });

 }



 var jsonExport = JSON.stringify({

 config: APP.config,

 results: APP.results,

 generated: new Date().toISOString()

 }, null, 2);

 exports.push({ name: 'analysis_data.json', content: jsonExport, type: 'application/json' });



 if (typeof JSZip !== 'undefined') {

 var zip = new JSZip();

 exports.forEach(function(exp) {

 if (exp.isBase64) {

 zip.file(exp.name, exp.content, { base64: true });

 } else {

 zip.file(exp.name, exp.content);

 }

 });

 zip.generateAsync({ type: 'blob' }).then(function(blob) {

 var url = URL.createObjectURL(blob);

 var a = document.createElement('a');

 a.href = url;

 a.download = 'ipd_meta_analysis_export.zip';

 a.click();

 setTimeout(function() { URL.revokeObjectURL(url); }, 100);

 });

 showNotification('All formats exported as ZIP', 'success');

 } else {



 exports.forEach(function(exp, i) {

 setTimeout(function() {

 var blob = exp.isBase64 ?

 b64toBlob(exp.content, exp.type) :

 new Blob([exp.content], { type: exp.type });

 var url = URL.createObjectURL(blob);

 var a = document.createElement('a');

 a.href = url;

 a.download = exp.name;

 a.click();

 setTimeout(function() { URL.revokeObjectURL(url); }, 100);

 }, i * 500);

 });

 showNotification('Exporting ' + exports.length + ' files...', 'info');

 }

}

function b64toBlob(b64Data, contentType) {

 var byteCharacters = atob(b64Data);

 var byteNumbers = new Array(byteCharacters.length);

 for (var i = 0; i < byteCharacters.length; i++) {

 byteNumbers[i] = byteCharacters.charCodeAt(i);

 }

 return new Blob([new Uint8Array(byteNumbers)], { type: contentType });

 }

function exportResults(format) {

 if (!APP.results) {

 alert('Please run analysis first');

 return;

 }



 if (format === 'csv') {

 APP.results = normalizeResultsSchema(APP.results);

 const NL = String.fromCharCode(10);

 const toFixedOrBlank = function(value, digits) {

 const num = toNumberOrNull(value);

 return num === null ? '' : num.toFixed(digits);

 };

 const rows = ['Study,N,Events,Effect,SE,Lower,Upper,Weight,P-value'];

 rows.push(...APP.results.studies.map(function(s) {

 return buildCSVRow([

 s.study,

 s.n,

 s.events,

 toFixedOrBlank(s.effect, 4),

 toFixedOrBlank(s.se, 4),

 toFixedOrBlank(s.lower, 4),

 toFixedOrBlank(s.upper, 4),

 toFixedOrBlank(s.weight, 4),

 toFixedOrBlank(s.p, 6)

 ]);

 }));

 const csv = rows.join(NL);



 const blob = new Blob([csv], { type: 'text/csv' });

 const url = URL.createObjectURL(blob);

 const a = document.createElement('a');

 a.href = url;

 a.download = 'meta_analysis_results.csv';

 a.click();

 setTimeout(() => { URL.revokeObjectURL(url); }, 100);

 } else {

 exportAnalysis();

 }

}

function exportROB() {

 saveROBAssessment();

 const NL = String.fromCharCode(10);

 const csv = 'Study,D1_Randomization,D2_Deviations,D3_Missing,D4_Measurement,D5_Selection,Overall' + NL +

 Object.entries(APP.robAssessment).map(function(entry) {

 const study = entry[0];

 const rob = entry[1];

 return buildCSVRow([study, rob.d1, rob.d2, rob.d3, rob.d4, rob.d5, rob.overall]);

 }).join(NL);



 const blob = new Blob([csv], { type: 'text/csv' });

 const url = URL.createObjectURL(blob);

 const a = document.createElement('a');

 a.href = url;

 a.download = 'rob2_assessment.csv';

 a.click();

 setTimeout(() => { URL.revokeObjectURL(url); }, 100);

}

function exportPublicationTables() {

 if (!APP.results) {

 alert('Please run the analysis first');

 return;

 }



 APP.results = normalizeResultsSchema(APP.results);



 const modal = document.createElement('div');

 modal.className = 'modal-overlay active';



 const effectType = APP.config.outcomeType === 'survival' ? 'HR' :

 APP.config.outcomeType === 'binary' ? 'OR' : 'MD';

 const isLogScale = APP.config.outcomeType !== 'continuous';



 const pooled = APP.results.pooled || {};

 const pooledEffect = getPooledEffectValue(pooled);

 const pooledLower = toNumberOrNull(pooled.lower);

 const pooledUpper = toNumberOrNull(pooled.upper);

 const pooledEffectDisplay = pooledEffect === null

 ? 'NA'

 : (isLogScale ? Math.exp(pooledEffect).toFixed(3) : pooledEffect.toFixed(3));

 const pooledCIDisplay = (pooledLower === null || pooledUpper === null)

 ? 'NA'

 : `${(isLogScale ? Math.exp(pooledLower) : pooledLower).toFixed(3)}-${(isLogScale ? Math.exp(pooledUpper) : pooledUpper).toFixed(3)}`;



 const het = APP.results.heterogeneity || {};

 const hetI2 = toNumberOrNull(het.i2) !== null ? toNumberOrNull(het.i2) : toNumberOrNull(het.I2);

 const hetTau2 = toNumberOrNull(het.tau2);

 const hetQ = toNumberOrNull(het.q) !== null ? toNumberOrNull(het.q) : toNumberOrNull(het.Q);

 const hetP = toNumberOrNull(het.pHet) !== null ? toNumberOrNull(het.pHet) : toNumberOrNull(het.pQ);



 const studies = [...new Set(APP.data.map(d => d.study_id || d.study))];

 const table1Rows = studies.map(study => {

 const studyData = APP.data.filter(d => (d.study_id || d.study) === study);

 const treated = studyData.filter(d => d.treatment === 1);

 const control = studyData.filter(d => d.treatment === 0);

 const eventVar = APP.config.eventVar || 'event';



 return {

 study: study,

 nTreated: treated.length,

 nControl: control.length,

 eventsTreated: treated.filter(d => d[eventVar] === 1).length,

 eventsControl: control.filter(d => d[eventVar] === 1).length

 };

 });



 const table2Rows = APP.results.studies.map(s => ({

 study: s.study,

 n: s.n,

 events: s.events,

 effect: isLogScale ? Math.exp(s.effect).toFixed(3) : s.effect.toFixed(3),

 ci: `${(isLogScale ? Math.exp(s.lower) : s.lower).toFixed(3)}-${(isLogScale ? Math.exp(s.upper) : s.upper).toFixed(3)}`,

 weight: (s.weight * 100).toFixed(1) + '%'

 }));



 modal.innerHTML = `

 <div class="modal" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">

 <div class="modal-header">

 <h3>Publication-Ready Tables</h3>

 <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>

 </div>

 <div class="modal-body">

 <h4>Table 1: Characteristics of Included Studies</h4>

 <table class="data-table publication-table" style="font-size: 0.85rem; margin-bottom: 2rem;">

 <thead>

 <tr>

 <th>Study</th>

 <th>Treatment (n)</th>

 <th>Control (n)</th>

 <th>Events (Treatment)</th>

 <th>Events (Control)</th>

 </tr>

 </thead>

 <tbody>

 ${table1Rows.map(r => `

 <tr>

 <td>${escapeHTML(r.study)}</td>

 <td>${r.nTreated}</td>

 <td>${r.nControl}</td>

 <td>${r.eventsTreated}</td>

 <td>${r.eventsControl}</td>

 </tr>

 `).join('')}

 </tbody>

 </table>



 <h4>Table 2: Main Meta-Analysis Results</h4>

 <table class="data-table publication-table" style="font-size: 0.85rem; margin-bottom: 2rem;">

 <thead>

 <tr>

 <th>Study</th>

 <th>N</th>

 <th>Events</th>

 <th>${effectType}</th>

 <th>95% CI</th>

 <th>Weight</th>

 </tr>

 </thead>

 <tbody>

 ${table2Rows.map(r => `

 <tr>

 <td>${escapeHTML(r.study)}</td>

 <td>${r.n}</td>

 <td>${r.events}</td>

 <td>${r.effect}</td>

 <td>${r.ci}</td>

 <td>${r.weight}</td>

 </tr>

 `).join('')}

 <tr style="font-weight: bold; border-top: 2px solid var(--border-color);">

 <td>Pooled (Random-effects)</td>

 <td>${APP.results.studies.reduce((s, r) => s + r.n, 0)}</td>

 <td>${APP.results.studies.reduce((s, r) => s + (r.events ?? 0), 0)}</td>

 <td>${pooledEffectDisplay}</td>

 <td>${pooledCIDisplay}</td>

 <td>100%</td>

 </tr>

 </tbody>

 </table>



 <h4>Table 3: Heterogeneity Statistics</h4>

 <table class="data-table publication-table" style="font-size: 0.85rem;">

 <tbody>

 <tr><td>I² (inconsistency)</td><td>${hetI2 === null ? 'NA' : hetI2.toFixed(1) + '%'}</td></tr>

 <tr><td>t² (between-study variance)</td><td>${hetTau2 === null ? 'NA' : hetTau2.toFixed(4)}</td></tr>

 <tr><td>Q statistic</td><td>${hetQ === null ? 'NA' : hetQ.toFixed(2)}</td></tr>

 <tr><td>Q p-value</td><td>${hetP === null ? 'NA' : hetP.toFixed(4)}</td></tr>

 </tbody>

 </table>



 <div style="margin-top: 1.5rem;">

 <button class="btn btn-secondary" onclick="copyTableAsHTML()">Copy as HTML</button>

 <button class="btn btn-secondary" onclick="downloadTablesCSV()">Download CSV</button>

 <button class="btn btn-secondary" onclick="downloadTablesWord()">Download for Word</button>

 </div>

 </div>

 <div class="modal-footer">

 <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>

 </div>

 </div>

 `;

 document.body.appendChild(modal);

}

function downloadTablesCSV() {

 APP.results = normalizeResultsSchema(APP.results);



 const effectType = APP.config.outcomeType === 'survival' ? 'HR' :

 APP.config.outcomeType === 'binary' ? 'OR' : 'MD';

 const isLogScale = APP.config.outcomeType !== 'continuous';



 const pooled = APP.results.pooled || {};

 const pooledEffect = getPooledEffectValue(pooled);

 const pooledLower = toNumberOrNull(pooled.lower);

 const pooledUpper = toNumberOrNull(pooled.upper);

 const NL = String.fromCharCode(10);



 let csv = 'STUDY CHARACTERISTICS' + NL;

 csv += buildCSVRow(['Study', 'Treatment N', 'Control N', 'Treatment Events', 'Control Events']) + NL;



 const studies = [...new Set(APP.data.map(d => d.study_id || d.study))];

 studies.forEach(study => {

 const studyData = APP.data.filter(d => (d.study_id || d.study) === study);

 const treated = studyData.filter(d => d.treatment === 1);

 const control = studyData.filter(d => d.treatment === 0);

 const eventVar = APP.config.eventVar || 'event';



 csv += buildCSVRow([

 study,

 treated.length,

 control.length,

 treated.filter(d => d[eventVar] === 1).length,

 control.filter(d => d[eventVar] === 1).length

 ]) + NL;

 });



 csv += NL + 'EFFECT ESTIMATES' + NL;

 csv += buildCSVRow(['Study', 'N', 'Events', effectType, 'Lower CI', 'Upper CI', 'Weight']) + NL;



 APP.results.studies.forEach(s => {

 csv += buildCSVRow([

 s.study,

 s.n,

 s.events,

 isLogScale ? Math.exp(s.effect).toFixed(4) : toNumberOrNull(s.effect) === null ? '' : s.effect.toFixed(4),

 isLogScale ? Math.exp(s.lower).toFixed(4) : toNumberOrNull(s.lower) === null ? '' : s.lower.toFixed(4),

 isLogScale ? Math.exp(s.upper).toFixed(4) : toNumberOrNull(s.upper) === null ? '' : s.upper.toFixed(4),

 toNumberOrNull(s.weight) === null ? '' : (s.weight * 100).toFixed(1) + '%'

 ]) + NL;

 });



 const pooledEffectDisplay = pooledEffect === null

 ? ''

 : (isLogScale ? Math.exp(pooledEffect).toFixed(4) : pooledEffect.toFixed(4));

 const pooledLowerDisplay = pooledLower === null

 ? ''

 : (isLogScale ? Math.exp(pooledLower).toFixed(4) : pooledLower.toFixed(4));

 const pooledUpperDisplay = pooledUpper === null

 ? ''

 : (isLogScale ? Math.exp(pooledUpper).toFixed(4) : pooledUpper.toFixed(4));



 csv += NL + buildCSVRow([

 'Pooled',

 APP.results.studies.reduce((s, r) => s + r.n, 0),

 APP.results.studies.reduce((s, r) => s + (r.events ?? 0), 0),

 pooledEffectDisplay,

 pooledLowerDisplay,

 pooledUpperDisplay,

 '100%'

 ]) + NL;



 const blob = new Blob([csv], { type: 'text/csv' });

 const url = URL.createObjectURL(blob);

 const a = document.createElement('a');

 a.href = url;

 a.download = 'ipd_meta_analysis_tables.csv';

 a.click();

 setTimeout(() => { URL.revokeObjectURL(url); }, 100);

}

function exportIPDData() {

    if (!APP.data || APP.data.length === 0) {

        showNotification('No data loaded', 'error');

        return;

    }



    const headers = Object.keys(APP.data[0] || {});

    const NL = String.fromCharCode(10);

    const rows = [buildCSVRow(headers, { preventFormulaInjection: false })];

    APP.data.forEach(function(row) {

        rows.push(buildCSVRow(headers.map(function(h) { return row[h]; })));

    });

    const csv = rows.join(NL);



    const blob = new Blob([csv], { type: 'text/csv' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = 'ipd_dataset.csv';

    a.click();

    setTimeout(() => { URL.revokeObjectURL(url); }, 100);

    showNotification('IPD dataset exported', 'success');

}
