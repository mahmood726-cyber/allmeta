const fs = require('fs');
const html = fs.readFileSync('C:/HTML apps/dosehtml/dose-response-pro-v18.2-ultimate.html', 'utf8');

console.log('='.repeat(60));
console.log('DOSE-RESPONSE APPLICATION VALIDATION REPORT');
console.log('='.repeat(60));

// 1. File stats
console.log('\n1. FILE STATISTICS:');
console.log('   File size:', (html.length / 1024).toFixed(1), 'KB');
const lines = html.split('\n').length;
console.log('   Lines:', lines);

// Extract script
const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
let mainScript = '';
scriptMatch.forEach(s => {
  const content = s.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
  if (content.length > mainScript.length) mainScript = content;
});
console.log('   JS code:', (mainScript.length / 1024).toFixed(1), 'KB');

// 2. Syntax validation
console.log('\n2. JAVASCRIPT SYNTAX:');
try {
  new Function(mainScript);
  console.log('   ✓ VALID - No syntax errors');
} catch (e) {
  console.log('   ✗ ERROR:', e.message);
}

// 3. Function count
const funcDefRegex = /function\s+(\w+)\s*\(/g;
let match;
const funcs = new Set();
while ((match = funcDefRegex.exec(mainScript)) !== null) {
  funcs.add(match[1]);
}
console.log('\n3. FUNCTIONS DEFINED:', funcs.size);

// 4. Critical features check
console.log('\n4. CRITICAL FEATURES:');
const features = {
  'Spline model fitting': funcs.has('fitSplineModel'),
  'Linear model fitting': funcs.has('fitLinearModel'),
  'Funnel plot analysis': funcs.has('runFunnelAnalysis'),
  'Sensitivity analysis': funcs.has('runSensitivityAnalysis'),
  'Subgroup analysis': funcs.has('runSubgroupAnalysis'),
  'Forest plot': funcs.has('updateForestPlot'),
  'XSS protection': funcs.has('sanitizeHTML'),
  'CSV parsing': funcs.has('parseCSV'),
  'Egger\'s test': funcs.has('computeEggersTest'),
  'Begg\'s test': funcs.has('computeBeggsTest'),
  'Trim & Fill': funcs.has('runTrimAndFill'),
  'REML estimation': funcs.has('estimateTau2REML'),
  'Bootstrap CI': funcs.has('bootstrapDoseResponse'),
  'R code generation': funcs.has('generateRCode'),
  'Validation suite': funcs.has('runValidationSuite')
};
Object.entries(features).forEach(([name, exists]) => {
  console.log(exists ? '   ✓' : '   ✗', name);
});

// 5. Tab content check
console.log('\n5. TAB CONTENT:');
const tabs = ['data', 'results', 'plots', 'influence', 'subgroups', 'funnel',
              'compare', 'validation', 'realtime', 'wizard', 'methods', 'rcode', 'refs'];
tabs.forEach(tab => {
  const exists = html.includes(`id="tab-${tab}"`);
  console.log(exists ? '   ✓' : '   ✗', tab);
});

// 6. Security features
console.log('\n6. SECURITY:');
const hasCSP = html.includes('Content-Security-Policy');
const hasSanitize = html.includes('sanitizeHTML');
const noEval = !mainScript.includes('eval(');
const noInnerHTML = !mainScript.includes('.innerHTML =') || mainScript.includes('sanitizeHTML');
console.log(hasCSP ? '   ✓' : '   ✗', 'Content Security Policy');
console.log(hasSanitize ? '   ✓' : '   ✗', 'HTML sanitization function');
console.log(noEval ? '   ✓' : '   ⚠', 'No eval() usage');

// 7. AppState object
console.log('\n7. STATE MANAGEMENT:');
const hasAppState = mainScript.includes('const AppState');
console.log(hasAppState ? '   ✓' : '   ✗', 'AppState object defined');

// 8. Canvas elements for charts
console.log('\n8. CHART CANVASES:');
const canvases = ['mainPlot', 'funnelPlotCanvas', 'coveragePlotCanvas',
                  'livePlotCanvas', 'subgroupDoseResponsePlot', 'subgroupForestPlot'];
canvases.forEach(id => {
  const exists = html.includes(`id="${id}"`);
  console.log(exists ? '   ✓' : '   ✗', id);
});

console.log('\n' + '='.repeat(60));
console.log('VALIDATION COMPLETE');
console.log('='.repeat(60));

// Clean up temp files
try {
  fs.unlinkSync('C:/HTML apps/dosehtml/check_functions.js');
  fs.unlinkSync('C:/HTML apps/dosehtml/check_elements.js');
  fs.unlinkSync('C:/HTML apps/dosehtml/check_events.js');
} catch(e) {}
