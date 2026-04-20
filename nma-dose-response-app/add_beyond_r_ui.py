import re

# Read index.html
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the RSM v2 checklist button and add Beyond R panels after it
pattern = r'(<button class="secondary" id="exportRSMv2Checklist"[^>]*>Checklist</button>\s*</div>\s*</div>\s*</div>)'
match = re.search(pattern, content)

if match:
    insert_pos = match.end()
    new_panels = '''

      <div class="panel">
        <h2>Beyond R <span class="badge" style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);">ULTRA</span></h2>
        <div class="hint" style="margin-bottom: 16px;">Methods surpassing metafor, weightr, RoBMA</div>

        <div class="control">
          <label>Copas Selection Model</label>
          <div class="inline-actions">
            <button class="secondary" id="runCopas" title="Copas & Shi (2000)">Run Copas</button>
            <button class="secondary" id="copasSensitivity" title="Sensitivity analysis">Sensitivity</button>
          </div>
          <div class="hint" id="copasResult">Most sophisticated selection model</div>
        </div>

        <div class="control">
          <label>P-uniform*</label>
          <div class="inline-actions">
            <button class="secondary" id="runPUniformStar" title="van Aert et al. (2016)">P-uniform*</button>
          </div>
          <div class="hint" id="puniformResult">Heterogeneity-adjusted p-curve</div>
        </div>

        <div class="control">
          <label>Limit Meta-Analysis</label>
          <div class="inline-actions">
            <button class="secondary" id="runLimitMA" title="Rucker et al. (2011)">Limit MA</button>
          </div>
          <div class="hint" id="limitResult">Extrapolation to infinite precision</div>
        </div>

        <div class="control">
          <label>RoBMA</label>
          <div class="inline-actions">
            <button class="secondary" id="runRoBMA" title="Robust Bayesian Meta-Analysis">Run RoBMA</button>
          </div>
          <div class="hint" id="robmaResult">Bayesian Model Averaging</div>
        </div>
      </div>

      <div class="panel">
        <h2>Sensitivity <span class="badge" style="background: linear-gradient(135deg, #1abc9c 0%, #16a085 100%);">ULTRA</span></h2>
        <div class="hint" style="margin-bottom: 16px;">Bias sensitivity, WAAP-WLS, Z-curve</div>

        <div class="control">
          <label>Publication Bias Sensitivity</label>
          <div class="inline-actions">
            <button class="secondary" id="runBiasSensitivity" title="Mathur & VanderWeele">Sensitivity</button>
            <button class="secondary" id="runWorstCase" title="Worst-case bias">Worst Case</button>
          </div>
          <div class="hint" id="sensitivityResult">Selection strength to nullify effect</div>
        </div>

        <div class="control">
          <label>WAAP-WLS</label>
          <div class="inline-actions">
            <button class="secondary" id="runWAAP" title="Adequately powered studies">WAAP</button>
            <button class="secondary" id="runWLS" title="Weighted Least Squares">WLS</button>
          </div>
          <div class="hint" id="waapResult">Stanley & Doucouliagos method</div>
        </div>

        <div class="control">
          <label>Z-Curve Analysis</label>
          <div class="inline-actions">
            <button class="secondary" id="runZCurve" title="Brunner & Schimmack">Z-Curve</button>
            <button class="secondary" id="runSunset" title="Sunset power analysis">Sunset</button>
          </div>
          <div class="hint" id="zcurveResult">Replicability & discovery rate</div>
        </div>

        <div class="control">
          <label>Selection Model Comparison</label>
          <div class="inline-actions">
            <button class="secondary" id="compareSelectionModels" title="Compare all models">Compare All</button>
          </div>
          <div class="hint" id="comparisonResult">Model averaging across methods</div>
        </div>
      </div>

      <div class="panel">
        <h2>Regression Tests <span class="badge" style="background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%);">ULTRA</span></h2>
        <div class="hint" style="margin-bottom: 16px;">Begg, Peters, Macaskill, Deeks, Arcsine</div>

        <div class="control">
          <label>Rank Correlation Tests</label>
          <div class="inline-actions">
            <button class="secondary" id="runBeggMazumdar" title="Begg & Mazumdar (1994)">Begg</button>
          </div>
          <div class="hint" id="beggResult">Non-parametric rank correlation</div>
        </div>

        <div class="control">
          <label>Sample Size Tests</label>
          <div class="inline-actions">
            <button class="secondary" id="runPeters" title="Peters et al. (2006)">Peters</button>
            <button class="secondary" id="runMacaskill" title="Macaskill et al.">Macaskill</button>
            <button class="secondary" id="runDeeks" title="Deeks et al.">Deeks</button>
          </div>
          <div class="hint" id="regressionResult">Sample size based bias tests</div>
        </div>

        <div class="control">
          <label>Advanced Diagnostics</label>
          <div class="inline-actions">
            <button class="secondary" id="runContourFunnel" title="Contour-enhanced funnel">Contour Plot</button>
            <button class="secondary" id="runCumulativeMA" title="By precision">Cumulative</button>
            <button class="secondary" id="runLOOBias" title="Leave-one-out influence">LOO Bias</button>
          </div>
          <div class="hint" id="advDiagResult">Advanced diagnostic plots</div>
        </div>

        <div class="control">
          <label>Export</label>
          <div class="inline-actions">
            <button class="secondary" id="exportBeyondRReport" title="Complete bias report">Full Report</button>
            <button class="secondary" id="exportBeyondRChecklist" title="Methods checklist">Checklist</button>
          </div>
        </div>
      </div>'''

    content = content[:insert_pos] + new_panels + content[insert_pos:]
    print('Added Beyond R UI panels!')
else:
    print('Could not find insertion point, trying alternative...')
    # Try finding end of Statistical Inference panel
    pattern2 = r'(<div class="hint" id="mrDiagResult">.*?</div>\s*</div>\s*</div>)'
    match2 = re.search(pattern2, content, re.DOTALL)
    if match2:
        insert_pos = match2.end()
        content = content[:insert_pos] + new_panels + content[insert_pos:]
        print('Added using alternative pattern')

# Write back
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'index.html updated. Size: {len(content)} chars')
