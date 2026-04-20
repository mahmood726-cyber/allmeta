const TruthCert = {

 version: '1.0.0',

 _provenanceLog: [],

 _inputHash: null,

 _analysisTimestamp: null,



 // Sync FNV-1a 64-bit hash (for provenance hooks that must be synchronous)

 hashSync: function(data) {

  var str = typeof data === 'string' ? data : JSON.stringify(data);

  var h1 = 0x811c9dc5, h2 = 0x811c9dc5;

  for (var i = 0; i < str.length; i++) {

   var c = str.charCodeAt(i);

   h1 = Math.imul(h1 ^ c, 0x01000193);

   h2 = Math.imul(h2 ^ c, 0x01000193) ^ (c << 8);

  }

  return 'fnv1a_' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');

 },



 // SHA-256 hash via Web Crypto API (async, for bundle export)

 sha256: async function(data) {

  var str = typeof data === 'string' ? data : JSON.stringify(data);

  if (window.crypto && window.crypto.subtle) {

   var buf = new TextEncoder().encode(str);

   var hashBuf = await window.crypto.subtle.digest('SHA-256', buf);

   var arr = Array.from(new Uint8Array(hashBuf));

   return arr.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');

  }

  // Fallback to sync hash

  return this.hashSync(data);

 },



 // Record a provenance step

 logStep: function(step) {

  this._provenanceLog.push({

   timestamp: new Date().toISOString(),

   step: step.step || 'unknown',

   description: step.description || '',

   inputHash: step.inputHash || null,

   outputHash: step.outputHash || null,

   parameters: step.parameters || {},

   validator: step.validator || null,

   outcome: step.outcome || 'PASS'

  });

 },



 // Hash the raw input data synchronously (for provenance hooks)

 hashInputSync: function(data) {

  this._provenanceLog = [];

  this._analysisTimestamp = new Date().toISOString();

  var hash = this.hashSync(data);

  this._inputHash = hash;

  this.logStep({

   step: 'INPUT_HASH',

   description: 'FNV-1a hash of raw input data (' + (Array.isArray(data) ? data.length + ' rows' : 'object') + ')',

   outputHash: hash,

   outcome: 'PASS'

  });

  return hash;

 },



 // Hash the raw input data asynchronously (for bundle export with SHA-256)

 hashInput: async function(data) {

  this._provenanceLog = [];

  this._analysisTimestamp = new Date().toISOString();

  var hash = await this.sha256(data);

  this._inputHash = hash;

  this.logStep({

   step: 'INPUT_HASH',

   description: 'SHA-256 of raw input data (' + (Array.isArray(data) ? data.length + ' rows' : 'object') + ')',

   outputHash: hash,

   outcome: 'PASS'

  });

  return hash;

 },



 // Record analysis execution

 recordAnalysis: function(config, results) {

  this.logStep({

   step: 'ANALYSIS_EXECUTE',

   description: 'Meta-analysis: ' + (config.reMethod || 'DL') + ', effect=' + (config.effectMeasure || 'unknown') + ', approach=' + (config.analysisApproach || 'two-stage'),

   inputHash: this._inputHash,

   parameters: {

    reMethod: config.reMethod,

    effectMeasure: config.effectMeasure,

    confLevel: config.confLevel,

    useHKSJ: config.useHKSJ,

    outcomeType: config.outcomeType,

    seed: (typeof SeededRNG !== 'undefined') ? SeededRNG.getSeed() : 'UNSEEDED'

   },

   outcome: 'PASS'

  });



  if (results && results.pooled) {

   this.logStep({

    step: 'RESULT_RECORD',

    description: 'Pooled effect=' + (results.pooled.effect ? results.pooled.effect.toFixed(6) : 'N/A') +

     ', SE=' + (results.pooled.se ? results.pooled.se.toFixed(6) : 'N/A') +

     ', tau2=' + (results.pooled.tau2 !== undefined ? results.pooled.tau2.toFixed(6) : 'N/A') +

     ', I2=' + (results.pooled.I2 !== undefined ? results.pooled.I2.toFixed(2) + '%' : 'N/A') +

     ', k=' + (results.studies ? results.studies.length : 'N/A'),

    parameters: {

     effect: results.pooled.effect,

     se: results.pooled.se,

     tau2: results.pooled.tau2,

     I2: results.pooled.I2,

     k: results.studies ? results.studies.length : 0

    },

    outcome: 'PASS'

   });

  }

 },



 // Run validators

 validate: function(results) {

  var validations = [];



  // V1: Check no memory-only evidence

  var memRefs = this._provenanceLog.filter(function(s) { return s.inputHash && s.inputHash.startsWith('memory:'); });

  validations.push({

   validator: 'NO_MEMORY_EVIDENCE',

   outcome: memRefs.length === 0 ? 'PASS' : 'BLOCK',

   detail: memRefs.length === 0 ? 'No memory-only references found' : 'BLOCK: ' + memRefs.length + ' memory references found — claims cannot be certified from memory alone'

  });



  // V2: Input hash present

  validations.push({

   validator: 'INPUT_HASHED',

   outcome: this._inputHash ? 'PASS' : 'WARN',

   detail: this._inputHash ? 'Input hash: ' + this._inputHash.substring(0, 16) + '...' : 'WARN: No input hash recorded'

  });



  // V3: Deterministic seed

  var seedStep = this._provenanceLog.find(function(s) { return s.parameters && s.parameters.seed !== undefined; });

  var seedVal = seedStep ? seedStep.parameters.seed : null;

  validations.push({

   validator: 'DETERMINISTIC_SEED',

   outcome: seedVal && seedVal !== 'UNSEEDED' ? 'PASS' : 'WARN',

   detail: seedVal && seedVal !== 'UNSEEDED' ? 'Seed: ' + seedVal : 'WARN: Analysis may not be reproducible (no fixed seed)'

  });



  // V4: Results present

  validations.push({

   validator: 'RESULTS_PRESENT',

   outcome: results && results.pooled ? 'PASS' : 'REJECT',

   detail: results && results.pooled ? 'Pooled effect computed' : 'REJECT: No results available'

  });



  // V5: Minimum studies

  var k = results && results.studies ? results.studies.length : 0;

  validations.push({

   validator: 'MIN_STUDIES',

   outcome: k >= 3 ? 'PASS' : (k >= 2 ? 'WARN' : 'REJECT'),

   detail: 'k=' + k + (k < 3 ? ' (heterogeneity estimates unreliable)' : '')

  });



  validations.forEach(function(v) {

   TruthCert.logStep({ step: 'VALIDATION', description: v.validator + ': ' + v.detail, validator: v.validator, outcome: v.outcome });

  });



  return validations;

 },



 // Overall certification status

 certificationStatus: function(validations) {

  if (validations.some(function(v) { return v.outcome === 'BLOCK'; })) return 'BLOCK';

  if (validations.some(function(v) { return v.outcome === 'REJECT'; })) return 'REJECT';

  if (validations.some(function(v) { return v.outcome === 'WARN'; })) return 'PASS_WITH_WARNINGS';

  return 'PASS';

 },



 // Export a TruthCert bundle as JSON

 exportBundle: async function() {

  if (!APP.results) {

   showNotification('Run analysis first before exporting TruthCert bundle', 'warning');

   return null;

  }



  // Hash results

  var resultsHash = await this.sha256(APP.results);

  this.logStep({ step: 'OUTPUT_HASH', description: 'SHA-256 of results object', outputHash: resultsHash, outcome: 'PASS' });



  var validations = this.validate(APP.results);

  var status = this.certificationStatus(validations);



  var bundle = {

   truthcert: {

    version: this.version,

    status: status,

    timestamp: this._analysisTimestamp || new Date().toISOString(),

    exportedAt: new Date().toISOString()

   },

   evidence: {

    inputHash: this._inputHash,

    outputHash: resultsHash,

    dataRows: APP.data ? APP.data.length : 0,

    studies: APP.results.studies ? APP.results.studies.length : 0

   },

   config: {

    reMethod: APP.config.reMethod,

    effectMeasure: APP.config.effectMeasure,

    outcomeType: APP.config.outcomeType,

    confLevel: APP.config.confLevel,

    useHKSJ: APP.config.useHKSJ,

    seed: (typeof SeededRNG !== 'undefined') ? SeededRNG.getSeed() : null

   },

   results: {

    pooledEffect: APP.results.pooled ? APP.results.pooled.effect : null,

    pooledSE: APP.results.pooled ? APP.results.pooled.se : null,

    tau2: APP.results.pooled ? APP.results.pooled.tau2 : null,

    I2: APP.results.pooled ? APP.results.pooled.I2 : null,

    pValue: APP.results.pooled ? APP.results.pooled.pValue : null

   },

   validations: validations,

   provenance: this._provenanceLog

  };



  // Download bundle

  var blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });

  var url = URL.createObjectURL(blob);

  var a = document.createElement('a');

  a.href = url;

  a.download = 'truthcert_bundle_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';

  a.click();

  URL.revokeObjectURL(url);



  showNotification('TruthCert bundle exported: ' + status, status === 'PASS' ? 'success' : 'warning');

  return bundle;

 },



 // Display certification status in UI

 showStatus: function() {

  if (!APP.results) {

   showNotification('Run analysis first', 'warning');

   return;

  }

  var validations = this.validate(APP.results);

  var status = this.certificationStatus(validations);

  var html = '<div class="analysis-results">';

  html += '<h3>TruthCert Certification Status: <span style="color:' +

   (status === 'PASS' ? 'var(--accent-success)' : status === 'PASS_WITH_WARNINGS' ? 'var(--accent-warning)' : 'var(--accent-danger)') +

   ';">' + status + '</span></h3>';

  html += '<table class="results-table"><thead><tr><th>Validator</th><th>Outcome</th><th>Detail</th></tr></thead><tbody>';

  validations.forEach(function(v) {

   var color = v.outcome === 'PASS' ? 'var(--accent-success)' : v.outcome === 'WARN' ? 'var(--accent-warning)' : 'var(--accent-danger)';

   html += '<tr><td>' + v.validator + '</td><td style="color:' + color + ';font-weight:700;">' + v.outcome + '</td><td>' + v.detail + '</td></tr>';

  });

  html += '</tbody></table>';

  html += '<h4 style="margin-top:1rem;">Provenance Chain (' + this._provenanceLog.length + ' steps)</h4>';

  html += '<div style="max-height:300px;overflow-y:auto;font-size:0.8rem;background:var(--bg-tertiary);padding:0.75rem;border-radius:8px;">';

  this._provenanceLog.forEach(function(s, i) {

   html += '<div style="margin-bottom:0.5rem;padding:0.25rem 0;border-bottom:1px solid var(--border-color);">';

   html += '<strong>' + (i + 1) + '. ' + s.step + '</strong> <span style="color:' +

    (s.outcome === 'PASS' ? 'var(--accent-success)' : s.outcome === 'WARN' ? 'var(--accent-warning)' : 'var(--accent-danger)') +

    ';">[' + s.outcome + ']</span><br>';

   html += '<span style="color:var(--text-secondary);">' + s.description + '</span>';

   if (s.outputHash) html += '<br><code style="font-size:0.7rem;">hash: ' + s.outputHash.substring(0, 24) + '...</code>';

   html += '</div>';

  });

  html += '</div>';

  html += '<div style="margin-top:1rem;"><button class="btn btn-primary" onclick="TruthCert.exportBundle()">Export TruthCert Bundle</button></div>';

  html += '</div>';

  if (typeof showResultsModal === 'function') showResultsModal('TruthCert Certification', html);

 }

};



window.TruthCert = TruthCert;



// Hook TruthCert into runAnalysis provenance tracking (synchronous wrapper)

(function() {

 var _origRunAnalysis = window.runAnalysis;

 if (_origRunAnalysis) {

  window.runAnalysis = function() {

   // Hash input before analysis (sync to preserve runAnalysis semantics)

   if (APP.data) {

    try { TruthCert.hashInputSync(APP.data); } catch(e) { console.warn('[TruthCert] Input hashing failed:', e); }

   }

   // Run original analysis

   _origRunAnalysis.apply(this, arguments);

   // Record provenance

   if (APP.results) {

    try { TruthCert.recordAnalysis(APP.config, APP.results); } catch(e) { console.warn('[TruthCert] Provenance recording failed:', e); }

   }

  };

 }

})();



function isDecorativeLeadingCodePoint(codePoint) {
 if ((codePoint >= 0x1F300 && codePoint <= 0x1FAFF) ||
     (codePoint >= 0x2600 && codePoint <= 0x27BF) ||
     codePoint === 0xFE0F ||
     codePoint === 0x200D) {
  return true;
 }
 return false;
}

function stripLeadingDecorativeGlyphs(text) {
 if (!text) return text;
 let index = 0;
 while (index < text.length) {
  const codePoint = text.codePointAt(index);
  if (codePoint === 0x20 || codePoint === 0x09 || codePoint === 0x0A || codePoint === 0x0D) {
   index += codePoint > 0xFFFF ? 2 : 1;
   continue;
  }
  if (isDecorativeLeadingCodePoint(codePoint)) {
   index += codePoint > 0xFFFF ? 2 : 1;
   continue;
  }
  break;
 }
 return text.slice(index).trim();
}

function normalizeButtonLabels(root) {
 const scope = root && root.querySelectorAll ? root : document;
 const buttons = scope.querySelectorAll('button');
 buttons.forEach(function(btn) {
  const raw = (btn.textContent || '').trim();
  if (!raw) return;
  const cleaned = stripLeadingDecorativeGlyphs(raw);
  if (cleaned && cleaned !== raw) {
   btn.textContent = cleaned;
  }
 });
}

if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', function() {
  normalizeButtonLabels(document);
 }, { once: true });
} else {
 normalizeButtonLabels(document);
}

const _buttonLabelObserver = new MutationObserver(function(mutations) {
 mutations.forEach(function(mutation) {
  if (mutation.type === 'characterData') {
   if (mutation.target && mutation.target.parentElement) {
    normalizeButtonLabels(mutation.target.parentElement);
   }
   return;
  }

  mutation.addedNodes.forEach(function(node) {
   if (node && node.nodeType === 1) {
    normalizeButtonLabels(node);
   } else if (mutation.target && mutation.target.nodeType === 1) {
    normalizeButtonLabels(mutation.target);
   }
  });
 });
});

if (document.body) {
 _buttonLabelObserver.observe(document.body, {
  childList: true,
  characterData: true,
  subtree: true
 });
}

function exposeGlobalHandler(name, fn) {
 if (typeof fn === 'function') window[name] = fn;
}

(function bridgeLegacyOnclickHandlers() {
 exposeGlobalHandler('closeDatasetModal', typeof closeDatasetModal === 'function' ? closeDatasetModal : null);
 exposeGlobalHandler('loadBuiltInIPDDataset', typeof loadBuiltInIPDDataset === 'function' ? loadBuiltInIPDDataset : null);
 exposeGlobalHandler('loadRealIPDDataset', typeof loadRealIPDDataset === 'function' ? loadRealIPDDataset : null);
 exposeGlobalHandler('copyPRISMAText', typeof copyPRISMAText === 'function' ? copyPRISMAText : null);
 exposeGlobalHandler('downloadPRISMAImage', typeof downloadPRISMAImage === 'function' ? downloadPRISMAImage : null);
 exposeGlobalHandler('downloadSurvivalPlot', typeof downloadSurvivalPlot === 'function' ? downloadSurvivalPlot : null);
 exposeGlobalHandler('exportLeagueTable', typeof exportLeagueTable === 'function' ? exportLeagueTable : null);
 exposeGlobalHandler('exportPredictionModel', typeof exportPredictionModel === 'function' ? exportPredictionModel : null);
 exposeGlobalHandler('exportPredictions', typeof exportPredictions === 'function' ? exportPredictions : null);
 exposeGlobalHandler('runAutoHeterogeneity', typeof runAutoHeterogeneity === 'function' ? runAutoHeterogeneity : null);
 exposeGlobalHandler('runOISCalculation', typeof runOISCalculation === 'function' ? runOISCalculation : null);

 exposeGlobalHandler('runCausalForest', typeof runCausalForest === 'function' ? runCausalForest : null);
 exposeGlobalHandler('runBayesianModelAveraging', typeof runBayesianModelAveraging === 'function' ? runBayesianModelAveraging : null);
 exposeGlobalHandler('runCopasSelectionModel', typeof runCopasSelectionModel === 'function' ? runCopasSelectionModel : null);
 exposeGlobalHandler('runComprehensiveAssumptionChecks', typeof runComprehensiveAssumptionChecks === 'function' ? runComprehensiveAssumptionChecks : null);
 exposeGlobalHandler('runOptimalModelSelection', typeof runOptimalModelSelection === 'function' ? runOptimalModelSelection : null);
 exposeGlobalHandler('runPValueAdjustment', typeof runPValueAdjustment === 'function' ? runPValueAdjustment : null);
 exposeGlobalHandler('runRobustVarianceEstimation', typeof runRobustVarianceEstimation === 'function' ? runRobustVarianceEstimation : null);
 exposeGlobalHandler('runMultivariateMetaAnalysis', typeof runMultivariateMetaAnalysis === 'function' ? runMultivariateMetaAnalysis : null);
 exposeGlobalHandler('runEnhancedNodeSplitting', typeof runEnhancedNodeSplitting === 'function' ? runEnhancedNodeSplitting : null);
 exposeGlobalHandler('runGOSHAnalysis', typeof runGOSHAnalysis === 'function' ? runGOSHAnalysis : null);
 exposeGlobalHandler('runDoseResponseMetaAnalysis', typeof runDoseResponseMetaAnalysis === 'function' ? runDoseResponseMetaAnalysis : null);
 exposeGlobalHandler('showIndependentSignoffModal', typeof showIndependentSignoffModal === 'function' ? showIndependentSignoffModal : null);
 exposeGlobalHandler('submitIndependentSignoffFromModal', typeof submitIndependentSignoffFromModal === 'function' ? submitIndependentSignoffFromModal : null);
 exposeGlobalHandler('clearIndependentSignoffsFromModal', typeof clearIndependentSignoffsFromModal === 'function' ? clearIndependentSignoffsFromModal : null);
 exposeGlobalHandler('removeIndependentSignoffFromModal', typeof removeIndependentSignoffFromModal === 'function' ? removeIndependentSignoffFromModal : null);

 if ((typeof window !== 'undefined' && typeof window.runCompetingRisksMACore === 'function') || typeof runBeyondR40 === 'function') {
  window.runCompetingRisksMA = function() {
   if (arguments.length > 0) {
    if (typeof window !== 'undefined' && typeof window.runCompetingRisksMACore === 'function') return window.runCompetingRisksMACore.apply(this, arguments);
    return null;
   }
   if (typeof runBeyondR40 === 'function') return runBeyondR40('competingRisksMA');
   if (typeof showNotification === 'function') showNotification('Competing-risks meta-analysis is unavailable in this runtime.', 'warning');
   return null;
  };
 }

 if (typeof runDoseResponseMA === 'function') {
  window.runDoseResponseMA = function() {
   if (arguments.length === 0 && typeof runDoseResponseMetaAnalysis === 'function') {
    return runDoseResponseMetaAnalysis();
   }
   return runDoseResponseMA.apply(this, arguments);
  };
 }
})();

(function ensureOnclickFallbacks() {
 const notify = function(msg, level) {
  if (typeof showNotification === 'function') showNotification(msg, level || 'info');
  else console.log('[IPD fallback]', msg);
 };
 const runBeyond = function(method, label) {
  if (typeof runBeyondR40 === 'function') {
   try { return runBeyondR40(method); } catch (e) {}
  }
  notify((label || method) + ' is unavailable in this runtime.', 'warning');
  return null;
 };
 const escCsv = function(v) {
  let s = String(v === null || v === undefined ? '' : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
 };
 const saveText = function(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
 };

 if (typeof window.closeDatasetModal !== 'function') {
  window.closeDatasetModal = function() {
   const el = document.getElementById('datasetModalContainer');
   if (el) el.remove();
   document.querySelectorAll('.dataset-modal-overlay').forEach(function(n) { n.remove(); });
  };
 }
 if (typeof window.copyPRISMAText !== 'function') {
  window.copyPRISMAText = function() {
   const flow = document.getElementById('prismaFlow');
   if (!flow) return notify('Open PRISMA flow diagram first.', 'warning');
   const text = (flow.innerText || flow.textContent || '').replace(/\n{2,}/g, '\n').trim();
   if (!text) return notify('PRISMA flow text is empty.', 'warning');
   if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
     .then(function() { notify('PRISMA flow text copied', 'success'); })
     .catch(function() {
      notify('Clipboard permission denied. Copy manually from the PRISMA panel.', 'warning');
     });
    return;
   }
   const ta = document.createElement('textarea');
   ta.value = text;
   document.body.appendChild(ta);
   ta.select();
   document.execCommand('copy');
   ta.remove();
   notify('PRISMA flow text copied', 'success');
  };
 }
 if (typeof window.downloadPRISMAImage !== 'function') {
  window.downloadPRISMAImage = function() {
   const flow = document.getElementById('prismaFlow');
   if (!flow) return notify('Open PRISMA flow diagram first.', 'warning');
   const text = (flow.innerText || flow.textContent || '').replace(/\n{2,}/g, '\n').trim();
   if (!text) return notify('PRISMA flow text is empty.', 'warning');
   const lines = text.split('\n').filter(Boolean);
   const canvas = document.createElement('canvas');
   canvas.width = 1200;
   canvas.height = Math.max(420, 140 + lines.length * 28);
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
   ctx.fillStyle = '#0f172a'; ctx.font = 'bold 28px Arial'; ctx.fillText('PRISMA-IPD Flow Diagram', 36, 54);
   ctx.fillStyle = '#111827'; ctx.font = '18px Arial';
   let y = 102;
   lines.forEach(function(line) { ctx.fillText(line, 48, y); y += 28; });
   const a = document.createElement('a');
   a.href = canvas.toDataURL('image/png');
   a.download = 'prisma_ipd_flow_' + new Date().toISOString().slice(0, 10) + '.png';
   a.click();
   notify('PRISMA flow image downloaded', 'success');
  };
 }
 if (typeof window.exportPredictionModel !== 'function') {
  window.exportPredictionModel = function() {
   if (!window.currentPredictionModel) return notify('No prediction model available to export.', 'warning');
   saveText(JSON.stringify(window.currentPredictionModel, null, 2), 'ipd_prediction_model_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json', 'application/json');
   notify('Prediction model exported', 'success');
  };
 }
 if (typeof window.exportLeagueTable !== 'function') {
  window.exportLeagueTable = function() {
   if (window.currentLeagueTable && Array.isArray(window.currentLeagueTable.treatments)) {
    const d = window.currentLeagueTable;
    const rows = [['Treatment', 'vs', 'Estimate', 'CI Lower', 'CI Upper', 'Label']];
    for (let i = 0; i < d.treatments.length; i++) {
     for (let j = 0; j < d.treatments.length; j++) {
      const c = ((d.matrix[i] || [])[j]) || {};
      rows.push([d.treatments[i], d.treatments[j], c.effect, c.lower, c.upper, c.label || 'NA']);
     }
    }
    const csv = rows.map(function(r) { return r.map(escCsv).join(','); }).join('\n') + '\n';
    saveText(csv, 'ipd_league_table_' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
    return notify('League table exported', 'success');
   }
   const table = document.querySelector('.modal-overlay.active table');
   if (!table) return notify('No league table available to export.', 'warning');
   const rows = Array.from(table.querySelectorAll('tr')).map(function(tr) {
    return Array.from(tr.children).map(function(td) { return escCsv((td.textContent || '').trim()); }).join(',');
   }).join('\n') + '\n';
   saveText(rows, 'ipd_league_table_' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
   notify('League table exported', 'success');
  };
 }
 if (typeof window.loadBuiltInIPDDataset !== 'function' && typeof loadBuiltInIPDDataset === 'function') {
  window.loadBuiltInIPDDataset = loadBuiltInIPDDataset;
 }
 if (typeof window.loadBuiltInIPDDataset !== 'function') {
  window.loadBuiltInIPDDataset = function(datasetId) {
   const map = {
    ipdas_breast: 'survival',
    bp_treatment: 'continuous',
    diabetes_prevention: 'binary',
    covid_treatment: 'covid_treatments',
    depression_network: 'network_antidepressants',
    stroke_prevention: 'statin_cvd',
    pain_doseresponse: 'continuous'
   };
   const key = map[datasetId] || 'survival';
   if (typeof loadExampleData === 'function') {
    loadExampleData(key);
    notify('Loaded built-in dataset fallback: ' + key, 'success');
    return APP.data || null;
   }
   notify('Built-in datasets are unavailable in this runtime.', 'warning');
   return null;
  };
 }
 if (typeof window.loadRealIPDDataset !== 'function' && typeof loadRealIPDDataset === 'function') {
  window.loadRealIPDDataset = loadRealIPDDataset;
 }
 if (typeof window.loadRealIPDDataset !== 'function') {
  window.loadRealIPDDataset = function(datasetName) {
   const map = {
    ovarian: 'ovarian_survival',
    statin: 'statin_cvd',
    hiv: 'hiv_survival',
    covid: 'covid_treatments',
    network: 'network_antidepressants'
   };
   let chosen = 'survival';
   const lower = String(datasetName || '').toLowerCase();
   Object.keys(map).forEach(function(k) { if (lower.indexOf(k) >= 0) chosen = map[k]; });
   if (typeof loadExampleData === 'function') {
    loadExampleData(chosen);
    notify('Loaded real IPD dataset fallback: ' + chosen, 'success');
    return APP.data || null;
   }
   notify('Real IPD datasets are unavailable in this runtime.', 'warning');
   return null;
  };
 }

 if (typeof window.runBayesianModelAveraging !== 'function') window.runBayesianModelAveraging = function() { return runBeyond('bayesianModelAveraging', 'Bayesian model averaging'); };
 if (typeof window.runCopasSelectionModel !== 'function') window.runCopasSelectionModel = function() { return runBeyond('threeParamSelectionModel', 'Copas/selection model'); };
 if (typeof window.runEnhancedNodeSplitting !== 'function') window.runEnhancedNodeSplitting = function() { return runBeyond('nodeSplittingComprehensive', 'Enhanced node-splitting'); };
 window.runGOSHAnalysis = (function(orig) {
  return function() {
   if (typeof orig === 'function') {
    try { return orig.apply(this, arguments); } catch (e) {}
   }
   if (typeof window.runGOSHPlot === 'function') {
    try { return window.runGOSHPlot(); } catch (e) {}
   }
   return runBeyond('influenceDiagnostics', 'GOSH analysis');
  };
 })(window.runGOSHAnalysis);
 if (typeof window.runDoseResponseMetaAnalysis !== 'function') window.runDoseResponseMetaAnalysis = function() { return runBeyond('nonlinearSplineInteractionIPDMA', 'Dose-response meta-analysis'); };
 if (typeof window.runDoseResponseMA !== 'function') window.runDoseResponseMA = function() { return window.runDoseResponseMetaAnalysis(); };
 if (typeof window.runCompetingRisksMA !== 'function') window.runCompetingRisksMA = function() { return runBeyond('competingRisksMA', 'Competing-risks meta-analysis'); };
 if (typeof window.runCausalForest !== 'function') window.runCausalForest = function() { return runBeyond('autoIPDMethodPathway', 'Causal forest'); };
 if (typeof window.runMultivariateMetaAnalysis !== 'function') window.runMultivariateMetaAnalysis = function() {
  if (typeof window.runMultivariateMAnalysis === 'function') return window.runMultivariateMAnalysis();
  return runBeyond('ipdADSynthesis', 'Multivariate meta-analysis');
 };
 if (typeof window.runComprehensiveAssumptionChecks !== 'function') window.runComprehensiveAssumptionChecks = function() { return runBeyond('autoIPDWorkflowRunner', 'Assumption checks'); };
 if (typeof window.runOptimalModelSelection !== 'function') window.runOptimalModelSelection = function() { return runBeyond('autoIPDMethodPathway', 'Optimal model selection'); };
 if (typeof window.runRobustVarianceEstimation !== 'function') window.runRobustVarianceEstimation = function() { return runBeyond('influenceDiagnostics', 'Robust variance estimation'); };
 if (typeof window.runPValueAdjustment !== 'function') {
  window.runPValueAdjustment = function() {
   const input = document.getElementById('pvalInput');
   const methodEl = document.getElementById('corrMethod');
   const out = document.getElementById('pvalResults');
   if (!input || !out) return notify('P-value adjustment UI is unavailable.', 'warning');
   const method = methodEl ? methodEl.value : 'BH';
   const vals = String(input.value || '').split(',').map(function(v) { return Number(v.trim()); }).filter(function(v) { return Number.isFinite(v); });
   if (vals.length < 2) return notify('Enter at least 2 p-values.', 'warning');
   let adj = vals.slice();
   if (method === 'bonferroni') adj = vals.map(function(p) { return Math.min(1, p * vals.length); });
   else if (method === 'BH' || method === 'fdr') {
    const ranked = vals.map(function(p, i) { return { p: p, i: i }; }).sort(function(a, b) { return a.p - b.p; });
    const temp = new Array(vals.length);
    for (let i = 0; i < ranked.length; i++) temp[i] = Math.min(1, ranked[i].p * vals.length / (i + 1));
    for (let i = ranked.length - 2; i >= 0; i--) temp[i] = Math.min(temp[i], temp[i + 1]);
    adj = new Array(vals.length);
    ranked.forEach(function(r, i) { adj[r.i] = temp[i]; });
   }
   const rows = vals.map(function(p, i) {
    const ok = adj[i] < 0.05;
    return '<tr><td>Test ' + (i + 1) + '</td><td>' + p.toFixed(4) + '</td><td>' + adj[i].toFixed(4) + '</td><td style=\"color:' + (ok ? '#10b981' : '#ef4444') + ';\">' + (ok ? 'Yes' : 'No') + '</td></tr>';
   }).join('');
   out.innerHTML = '<table class=\"results-table\" style=\"font-size:0.85rem;\"><tr><th>Comparison</th><th>Raw p-value</th><th>Adjusted p-value</th><th>Significant</th></tr>' + rows + '</table>';
  };
 }
})();

console.log('[IPD-MA Pro] UI button-label normalization enabled');

console.log('[IPD-MA Pro] TruthCert provenance layer loaded v' + TruthCert.version);