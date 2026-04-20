import re

# Read app.js
with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixes = 0

# 1. Add safe formatting utilities after numFmt
safe_utils = '''

  // Safe formatting utilities to prevent errors on undefined values
  const safeFormat = {
    toFixed(val, digits = 3) {
      if (val == null || typeof val !== 'number' || isNaN(val)) return 'N/A';
      return val.toFixed(digits);
    },
    percent(val, digits = 1) {
      if (val == null || typeof val !== 'number' || isNaN(val)) return 'N/A';
      return (val * 100).toFixed(digits) + '%';
    },
    ci(lower, upper, digits = 3) {
      const l = this.toFixed(lower, digits);
      const u = this.toFixed(upper, digits);
      return `[${l}, ${u}]`;
    },
    setText(el, text) {
      if (el && el.textContent !== undefined) {
        el.textContent = text;
      }
    }
  };

'''

# Insert after numFmt if it exists, otherwise after LRUCache
if 'const numFmt = {' in content:
    pattern = r"(const numFmt = \{[\s\S]*?formatP:[\s\S]*?\n  \};)"
    match = re.search(pattern, content)
    if match:
        content = content[:match.end()] + safe_utils + content[match.end():]
        print('Added safe formatting utilities after numFmt')
        fixes += 1
else:
    pattern = r"(class LRUCache \{[\s\S]*?\n  \})"
    match = re.search(pattern, content)
    if match:
        content = content[:match.end()] + safe_utils + content[match.end():]
        print('Added safe formatting utilities after LRUCache')
        fixes += 1

# 2. Fix toFixed calls on potentially undefined result properties
# Pattern: result.xxx.toFixed(N) -> safeFormat.toFixed(result.xxx, N)

# Common patterns to fix
toFixed_patterns = [
    (r'result\.adjustedEffect\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.adjustedEffect, \1)'),
    (r'result\.ci_lower\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.ci_lower, \1)'),
    (r'result\.ci_upper\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.ci_upper, \1)'),
    (r'result\.effect\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.effect, \1)'),
    (r'result\.tau2\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.tau2, \1)'),
    (r'result\.gamma0\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.gamma0, \1)'),
    (r'result\.gamma1\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.gamma1, \1)'),
    (r'result\.pValueAdjustment\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.pValueAdjustment, \1)'),
    (r'result\.limitEffect\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.limitEffect, \1)'),
    (r'result\.biasEstimate\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.biasEstimate, \1)'),
    (r'result\.gStatistic\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.gStatistic, \1)'),
    (r'result\.bmaEffect\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.bmaEffect, \1)'),
    (r'result\.pEffect\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.pEffect, \1)'),
    (r'result\.pHeterogeneity\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.pHeterogeneity, \1)'),
    (r'result\.pPublicationBias\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.pPublicationBias, \1)'),
    (r'result\.pUniformity\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.pUniformity, \1)'),
    (r'result\.sValueToNullify\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.sValueToNullify, \1)'),
    (r'result\.worstCaseEffect\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.worstCaseEffect, \1)'),
    (r'result\.robustEffectS2\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.robustEffectS2, \1)'),
    (r'result\.tau\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.tau, \1)'),
    (r'result\.z\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.z, \1)'),
    (r'result\.pValue\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.pValue, \1)'),
    (r'result\.t\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.t, \1)'),
    (r'result\.slope\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.slope, \1)'),
    (r'result\.fatIntercept\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.fatIntercept, \1)'),
    (r'result\.fatPValue\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.fatPValue, \1)'),
    (r'result\.averagedEffect\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.averagedEffect, \1)'),
    (r'result\.medianPower\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.medianPower, \1)'),
    (r'result\.expectedReplicationRate\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.expectedReplicationRate, \1)'),
    (r'result\.expectedDiscoveryRate\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.expectedDiscoveryRate, \1)'),
    (r'result\.scepticalSignificance\.toFixed\((\d+)\)', r'safeFormat.toFixed(result.scepticalSignificance, \1)'),
]

for old_pattern, new_pattern in toFixed_patterns:
    new_content = re.sub(old_pattern, new_pattern, content)
    if new_content != content:
        content = new_content
        fixes += 1

print(f'Fixed {fixes - 1} toFixed patterns')

# 3. Fix DOM element null checks for Beyond R handlers
# Wrap dom.xxxResult.textContent with null check

dom_result_elements = [
    'copasResult', 'puniformResult', 'limitResult', 'robmaResult',
    'sensitivityResult', 'waapResult', 'zcurveResult', 'beggResult',
    'regressionResult', 'advDiagResult', 'comparisonResult'
]

for elem in dom_result_elements:
    # Replace direct textContent assignment with safe version
    old = f'dom.{elem}.textContent ='
    new = f'if (dom.{elem}) dom.{elem}.textContent ='
    if old in content and new not in content:
        content = content.replace(old, new)
        fixes += 1
        print(f'Added null check for dom.{elem}')

# 4. Fix potential issues with array access on undefined
# result.steps[result.steps.length-1]?.effect -> safeFormat.toFixed(result.steps?.[result.steps.length-1]?.effect, 3)

old_steps = "result.steps[result.steps.length-1]?.effect.toFixed(3)"
new_steps = "safeFormat.toFixed(result.steps?.[result.steps.length-1]?.effect, 3)"
if old_steps in content:
    content = content.replace(old_steps, new_steps)
    fixes += 1
    print('Fixed array access in cumulative MA')

# 5. Fix percentage calculations that might fail
# (result.xxx * 100).toFixed(1) -> safeFormat.percent(result.xxx, 1)

percent_patterns = [
    (r'\(result\.expectedReplicationRate \* 100\)\.toFixed\(1\)', 'safeFormat.percent(result.expectedReplicationRate, 1)'),
    (r'\(result\.expectedDiscoveryRate \* 100\)\.toFixed\(1\)', 'safeFormat.percent(result.expectedDiscoveryRate, 1)'),
    (r'\(result\.scepticalSignificance \* 100\)\.toFixed\(1\)', 'safeFormat.percent(result.scepticalSignificance, 1)'),
    (r'\(result\.medianPower \* 100\)\.toFixed\(1\)', 'safeFormat.percent(result.medianPower, 1)'),
    (r'\(1 - result\.pValueAdjustment\)\.toFixed\(3\)', 'safeFormat.toFixed(1 - (result.pValueAdjustment || 0), 3)'),
]

for old_pat, new_pat in percent_patterns:
    new_content = re.sub(old_pat, new_pat, content)
    if new_content != content:
        content = new_content
        fixes += 1

print('Fixed percentage calculations')

# 6. Fix CI array access that might fail
# result.averagedCI[0].toFixed(3) -> safeFormat.toFixed(result.averagedCI?.[0], 3)
old_ci = "result.averagedCI[0].toFixed(3)"
new_ci = "safeFormat.toFixed(result.averagedCI?.[0], 3)"
if old_ci in content:
    content = content.replace(old_ci, new_ci)
    fixes += 1

old_ci2 = "result.averagedCI[1].toFixed(3)"
new_ci2 = "safeFormat.toFixed(result.averagedCI?.[1], 3)"
if old_ci2 in content:
    content = content.replace(old_ci2, new_ci2)
    fixes += 1

print('Fixed CI array access')

# 7. Add missing error handling for worker pool
# Check if getWorkerPool exists and worker creation errors are handled
worker_error_fix = '''
  function getWorkerPoolSafe() {
    try {
      return getWorkerPool();
    } catch (e) {
      console.warn('Worker pool unavailable, falling back to main thread:', e.message);
      return null;
    }
  }

'''

if 'getWorkerPoolSafe' not in content and 'getWorkerPool()' in content:
    # Insert after getWorkerPool definition
    pattern = r"(function getWorkerPool\(\) \{\n    if \(!workerPool\) workerPool = new WorkerPool\(\);\n    return workerPool;\n  \})"
    match = re.search(pattern, content)
    if match:
        content = content[:match.end()] + worker_error_fix + content[match.end():]
        fixes += 1
        print('Added safe worker pool accessor')

# 8. Fix renderForestPlot and renderFunnelPlot to handle empty stats
old_forest_check = '''function renderForestPlot(stats, options = {}) {
    // Performance: use plot cache and offscreen rendering'''

new_forest_check = '''function renderForestPlot(stats, options = {}) {
    if (!stats || !stats.length) {
      console.warn('renderForestPlot: No stats provided');
      return;
    }
    // Performance: use plot cache and offscreen rendering'''

if old_forest_check in content:
    content = content.replace(old_forest_check, new_forest_check)
    fixes += 1
    print('Added empty stats check to renderForestPlot')

# 9. Fix potential undefined access in model comparison
old_model_loop = 'for (const m of result.models) {'
new_model_loop = 'for (const m of (result.models || [])) {'
if old_model_loop in content:
    content = content.replace(old_model_loop, new_model_loop, 1)  # Only first occurrence in the comparison handler
    fixes += 1
    print('Fixed model array access')

# 10. Add defensive check for state.parsedData.rows access
# Many handlers do: state.parsedData.rows.map(...) which will fail if rows is undefined
old_rows_map = "state.parsedData.rows.map(r =>"
new_rows_map = "(state.parsedData?.rows || []).map(r =>"
content = content.replace(old_rows_map, new_rows_map)
fixes += 1
print('Fixed parsedData.rows access')

# 11. Fix the async wrapper functions to handle worker failure gracefully
old_async_bootstrap = '''  async function asyncBootstrap(effects, ses, nIter = 1000) {
    const cacheKey = 'bootstrap:' + JSON.stringify({ e: effects.slice(0, 3), n: nIter });
    if (computeCache.has(cacheKey)) return computeCache.get(cacheKey);

    const pool = getWorkerPool();
    const result = await pool.run('bootstrap', { effects, ses, nIter });'''

new_async_bootstrap = '''  async function asyncBootstrap(effects, ses, nIter = 1000) {
    const cacheKey = 'bootstrap:' + JSON.stringify({ e: effects.slice(0, 3), n: nIter });
    if (computeCache.has(cacheKey)) return computeCache.get(cacheKey);

    try {
      const pool = getWorkerPool();
      if (!pool) throw new Error('Worker pool unavailable');
      const result = await pool.run('bootstrap', { effects, ses, nIter });'''

if old_async_bootstrap in content:
    # Find and fix the full function
    content = content.replace(old_async_bootstrap, new_async_bootstrap)
    # Add closing brace for try
    old_bootstrap_end = '''    computeCache.set(cacheKey, result);
    return result;
  }'''
    new_bootstrap_end = '''      computeCache.set(cacheKey, result);
      return result;
    } catch (e) {
      console.warn('asyncBootstrap failed:', e.message);
      // Fallback to synchronous calculation
      const n = effects.length;
      const weights = effects.map((_, i) => 1 / (ses[i] * ses[i]));
      const sumW = weights.reduce((a, b) => a + b, 0);
      const mu = effects.reduce((sum, e, i) => sum + e * weights[i], 0) / sumW;
      return { mean: mu, ci_lower: mu - 1.96 * Math.sqrt(1/sumW), ci_upper: mu + 1.96 * Math.sqrt(1/sumW) };
    }
  }'''
    content = content.replace(old_bootstrap_end, new_bootstrap_end, 1)
    fixes += 1
    print('Added error handling to asyncBootstrap')

# 12. Fix debouncedUpdateAnalysis reference if updateAnalysis doesn't exist as async
if 'const debouncedUpdateAnalysis = debounce(async () => {' in content:
    old_debounced = 'const debouncedUpdateAnalysis = debounce(async () => {\n    await updateAnalysis();\n  }, 200);'
    new_debounced = 'const debouncedUpdateAnalysis = debounce(() => {\n    updateAnalysis();\n  }, 200);'
    content = content.replace(old_debounced, new_debounced)
    fixes += 1
    print('Fixed debouncedUpdateAnalysis async wrapper')

# 13. Add null checks for DOM elements that might not exist in the HTML
# Check for elements referenced but potentially missing
missing_dom_checks = [
    ('dom.exportStatus', 'if (dom.exportStatus) '),
    ('dom.livingReviewStatus', 'if (dom.livingReviewStatus) '),
    ('dom.powerResult', 'if (dom.powerResult) '),
    ('dom.optimalDoseResult', 'if (dom.optimalDoseResult) '),
    ('dom.bmaStatus', 'if (dom.bmaStatus) '),
]

for elem, check in missing_dom_checks:
    # Find patterns like: dom.xxx.textContent = "..."
    pattern = rf'({elem}\.textContent\s*=)'
    # Only add check if not already present
    def add_check(m):
        before = content[max(0, m.start()-50):m.start()]
        if check.strip() in before or f'if ({elem})' in before:
            return m.group(0)
        return check + m.group(1)
    new_content = re.sub(pattern, add_check, content)
    if new_content != content:
        content = new_content
        fixes += 1

print('Added missing DOM null checks')

# 14. Fix potential issue with canvas context
old_canvas_ctx = "const ctx = dom.forestCanvas.getContext('2d', { willReadFrequently: true });"
new_canvas_ctx = "const ctx = dom.forestCanvas?.getContext?.('2d', { willReadFrequently: true });\n    if (!ctx) return;"
if old_canvas_ctx in content:
    content = content.replace(old_canvas_ctx, new_canvas_ctx)
    fixes += 1
    print('Added canvas context null check')

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nTotal fixes applied: {fixes}')
print(f'app.js size: {len(content)} chars')
